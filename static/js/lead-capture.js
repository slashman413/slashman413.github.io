/**
 * Slashman Tools — Lead Capture client
 * ====================================
 * Progressive-enhancement AJAX handler for every email-capture form on the
 * site. Submits to the custom webhook (Cloudflare Worker) instead of the old
 * dead ConvertKit `form.kit/...` action, and gives real inline UX: loading,
 * success, and error states — no full-page reload.
 *
 * Wiring a form (no per-form JS needed):
 *   <form data-lead-form data-source="toolkit-landing"> ... </form>
 * Optional data attributes on the <form>:
 *   data-success="#css-selector"   element to reveal on success (form hides)
 *   data-success-text="You're in!" fallback text if no success element given
 *
 * Endpoint resolution order:
 *   1. window.LEAD_ENDPOINT  (injected from Hugo site params / set inline)
 *   2. the form's original `action` attribute (if it's a real URL)
 *   3. DEFAULT_ENDPOINT below
 */
(function () {
  "use strict";

  // STOP-GAP endpoint: web3forms (client-side, HTTPS, public). The old default
  // http://100.80.243.33:8081/subscribe was a Tailscale-private IP → unreachable
  // from the public web, mixed-content-blocked on HTTPS, and 404 on Mautic.
  var DEFAULT_ENDPOINT = "https://api.web3forms.com/submit";

  function endpointFor(form) {
    if (window.LEAD_ENDPOINT) return window.LEAD_ENDPOINT;
    var action = form.getAttribute("action") || "";
    if (/^https?:\/\//.test(action) && !/form\.kit|YOUR_FORM/.test(action)) {
      return action;
    }
    return DEFAULT_ENDPOINT;
  }

  function track(source, variant, utm) {
    try {
      var props = { source: source || "lead-capture" };
      if (variant) props.variant = variant;
      if (utm) {
        Object.keys(utm).forEach(function (k) {
          if (utm[k]) props[k] = utm[k];
        });
      }
      if (typeof window.gtag === "function") {
        window.gtag("event", "generate_lead", {
          event_category: "lead_magnet",
          event_label: source || "lead-capture",
          variant: variant || "",
          ...(utm || {}),
        });
      }
      if (typeof window.plausible === "function") {
        window.plausible("Lead", { props: props });
      }
    } catch (_) {}
  }

  // --- Social traffic attribution -----------------------------------------
  // Reads utm_* params (from social share links / bios / video descriptions),
  // plus the HTTP referrer, and persists them in sessionStorage so they survive
  // a page navigation between the landing page and the newsletter page. They
  // are attached to every lead payload and analytics event.
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

  function readUtm() {
    var out = {};
    try {
      var q = new URLSearchParams(window.location.search);
      UTM_KEYS.forEach(function (k) {
        var v = q.get(k);
        if (v) out[k] = v.slice(0, 120);
      });
      // Persist across pages within the session (e.g. article → /newsletter/).
      var saved = sessionStorage.getItem("lead_utm");
      if (!out.utm_source && saved) {
        try { out = JSON.parse(saved); } catch (_) {}
      }
      if (out.utm_source) sessionStorage.setItem("lead_utm", JSON.stringify(out));
    } catch (_) {}
    return out;
  }

  function readReferrer() {
    try {
      return document.referrer || "";
    } catch (_) {
      return "";
    }
  }

  function setStatus(form, msg, kind) {
    var el = form.querySelector("[data-lead-status]");
    if (!el) {
      el = document.createElement("p");
      el.setAttribute("data-lead-status", "");
      el.style.cssText = "font-size:12px;margin-top:8px;line-height:1.5";
      form.appendChild(el);
    }
    el.textContent = msg || "";
    el.style.color = kind === "error" ? "#f87171" : kind === "success" ? "#34d399" : "#7878a0";
  }

  function showSuccess(form) {
    var sel = form.getAttribute("data-success");
    var target = sel ? document.querySelector(sel) : null;
    var container = form.closest("#form-container") || form.parentElement;
    if (target) {
      if (container) container.style.display = "none";
      target.style.display = "block";
      target.style.animation = "sl-success-pop .4s ease-out";
      ensureAnimStyles();
    } else {
      setStatus(form, form.getAttribute("data-success-text") || "✅ You're in! Check your inbox.", "success");
    }
    launchConfetti();
  }

  /* ---- Success animations (dependency-free, ES5) ---------------------- */

  function ensureAnimStyles() {
    if (document.getElementById("sl-success-anim-css")) return;
    var style = document.createElement("style");
    style.id = "sl-success-anim-css";
    style.textContent =
      "@keyframes sl-success-pop{0%{transform:scale(.86);opacity:0}60%{transform:scale(1.04);opacity:1}100%{transform:scale(1);opacity:1}}";
    document.head.appendChild(style);
  }

  // Tiny canvas-free confetti burst on successful signup. Respects
  // prefers-reduced-motion; never blocks or steals pointer events.
  function launchConfetti() {
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      var colors = ["#a5b4fc", "#f59e0b", "#10b981", "#34d399", "#6366f1", "#f0f0f8"];
      var holder = document.createElement("div");
      holder.setAttribute("aria-hidden", "true");
      holder.style.cssText =
        "position:fixed;inset:0;pointer-events:none;z-index:2147483000;overflow:hidden";
      document.body.appendChild(holder);
      var parts = [];
      var count = 90;
      for (var i = 0; i < count; i++) {
        var el = document.createElement("div");
        var w = 5 + Math.random() * 7;
        var h = w * (0.6 + Math.random() * 0.8);
        el.style.cssText =
          "position:absolute;left:0;top:0;width:" +
          w.toFixed(1) +
          "px;height:" +
          h.toFixed(1) +
          "px;background:" +
          colors[(Math.random() * colors.length) | 0] +
          ";border-radius:" +
          (Math.random() > 0.5 ? "50%" : "2px") +
          ";opacity:" +
          (0.75 + Math.random() * 0.25).toFixed(2);
        holder.appendChild(el);
        parts.push({
          el: el,
          x: Math.random() * window.innerWidth,
          y: -20 - Math.random() * window.innerHeight * 0.2,
          vx: (Math.random() - 0.5) * 140,
          vy: 50 + Math.random() * 160,
          rot: Math.random() * 360,
          vr: (Math.random() - 0.5) * 360,
        });
      }
      var last = null;
      function frame(ts) {
        if (last === null) last = ts;
        var dt = Math.min(0.05, (ts - last) / 1000);
        last = ts;
        var alive = false;
        for (var k = 0; k < parts.length; k++) {
          var p = parts[k];
          p.vy += 260 * dt; // gravity (px/s²)
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          if (p.y < window.innerHeight + 60) alive = true;
          p.el.style.transform =
            "translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px) rotate(" + p.rot.toFixed(1) + "deg)";
        }
        if (alive) {
          window.requestAnimationFrame(frame);
        } else if (holder.parentNode) {
          holder.parentNode.removeChild(holder);
        }
      }
      window.requestAnimationFrame(frame);
    } catch (_) {
      // Confetti is decorative — never let it break the success path.
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    var form = e.currentTarget;
    var source =
      form.getAttribute("data-source") ||
      (form.querySelector('[name="tags"]') || {}).value ||
      "unknown";

    var emailEl = form.querySelector('[type="email"], [name="email"]');
    var email = emailEl ? emailEl.value.trim() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setStatus(form, "Please enter a valid email address.", "error");
      if (emailEl) emailEl.focus();
      return;
    }

    var btn = form.querySelector('button[type="submit"], button:not([type])');
    var btnText = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.dataset.original = btnText;
      btn.textContent = "Sending…";
    }
    setStatus(form, "", "");

    var fd = new FormData(form);
    // Try Mautic-form field names first, then standard field names
    var first_name = fd.get("mauticform[firstname]") || fd.get("fields[FIRST_NAME]") || fd.get("first_name") || "";
    var tags = fd.get("mauticform[tags]") || fd.get("tags") || "";
    var variant = fd.get("variant") || "";
    var utm = readUtm();
    var body = {
      email: email,
      first_name: first_name,
      tags: tags,
      source: source,
      variant: variant,
      website: fd.get("website") || "", // honeypot
      referrer: readReferrer(),
    };
    UTM_KEYS.forEach(function (k) {
      if (utm[k]) body[k] = utm[k];
    });
    // Providers that require an access key + email metadata (e.g. web3forms).
    // window.LEAD_ACCESS_KEY is injected from Hugo params (see head.html). When
    // the endpoint flips back to the self-owned Worker / Mautic proxy, just drop
    // the key param and these extra fields are ignored.
    var accessKey = window.LEAD_ACCESS_KEY || fd.get("access_key") || "32e709fa-d67d-46e9-a1a0-1ac9ef6be251";
    if (accessKey) {
      body.access_key = accessKey;
      body.subject = "New slashmantools lead — " + source;
      body.from_name = "slashmantools.us";
      body.botcheck = ""; // web3forms honeypot (empty = human)
    }

    fetch(endpointFor(form), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res.json().catch(function () {
          return { ok: res.ok };
        });
      })
      .then(function (data) {
        // .ok = self-owned Worker/Mautic proxy; .success = web3forms.
        if (data && (data.ok || data.success)) {
          track(source, variant, utm);
          form.reset();
          showSuccess(form);
        } else {
          var msg =
            data && data.error === "invalid_email"
              ? "That email doesn't look right — mind checking it?"
              : data && data.error === "rate_limited"
              ? "Too many attempts. Please try again in a few minutes."
              : "Something went wrong. Please try again.";
          setStatus(form, msg, "error");
          restoreButton(btn);
        }
      })
      .catch(function () {
        setStatus(form, "Network error — please try again.", "error");
        restoreButton(btn);
      });
  }

  function restoreButton(btn) {
    if (btn) {
      btn.disabled = false;
      if (btn.dataset.original) btn.textContent = btn.dataset.original;
    }
  }

  function bindForm(form) {
    if (form.dataset.leadBound) return; // never double-bind
    form.dataset.leadBound = "1";
    form.addEventListener("submit", handleSubmit);
  }

  function init() {
    var forms = document.querySelectorAll("[data-lead-form]");
    for (var i = 0; i < forms.length; i++) bindForm(forms[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Bind forms injected after load (e.g. the mid-article CTA added by
  // cta-ab.js, or future dynamic blocks) without re-binding existing ones.
  if (window.MutationObserver) {
    var mo = new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var added = mutations[m].addedNodes;
        for (var n = 0; n < added.length; n++) {
          var node = added[n];
          if (!node || node.nodeType !== 1) continue;
          if (node.matches && node.matches("[data-lead-form]")) bindForm(node);
          var nested = node.querySelectorAll ? node.querySelectorAll("[data-lead-form]") : [];
          for (var q = 0; q < nested.length; q++) bindForm(nested[q]);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
