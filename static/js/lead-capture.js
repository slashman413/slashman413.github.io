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
    } else {
      setStatus(form, form.getAttribute("data-success-text") || "✅ You're in! Check your inbox.", "success");
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
    if (window.LEAD_ACCESS_KEY) {
      body.access_key = window.LEAD_ACCESS_KEY;
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

  function init() {
    var forms = document.querySelectorAll("[data-lead-form]");
    for (var i = 0; i < forms.length; i++) {
      forms[i].addEventListener("submit", handleSubmit);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
