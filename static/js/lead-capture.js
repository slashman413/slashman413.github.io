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

  var DEFAULT_ENDPOINT = "https://leads.slashmantools.us/subscribe";

  function endpointFor(form) {
    if (window.LEAD_ENDPOINT) return window.LEAD_ENDPOINT;
    var action = form.getAttribute("action") || "";
    if (/^https?:\/\//.test(action) && !/form\.kit|YOUR_FORM/.test(action)) {
      return action;
    }
    return DEFAULT_ENDPOINT;
  }

  function track(source) {
    try {
      if (typeof window.gtag === "function") {
        window.gtag("event", "generate_lead", {
          event_category: "lead_magnet",
          event_label: source || "lead-capture",
        });
      }
      if (typeof window.plausible === "function") {
        window.plausible("Lead", { props: { source: source || "unknown" } });
      }
    } catch (_) {}
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
    var body = {
      email: email,
      first_name: first_name,
      tags: tags,
      source: source,
      website: fd.get("website") || "", // honeypot
    };

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
        if (data && data.ok) {
          track(source);
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
