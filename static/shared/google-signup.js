/*! google-signup.js — bottom "Continue with Google" email sign-up prompt.
 *  Single source of truth for every Slashman site. Usage on any page:
 *    <script src="https://accounts.google.com/gsi/client" async defer></script>
 *    <script src="https://slashmantools.us/shared/google-signup.js" defer></script>
 *  (Pages without the GIS tag get it injected; kofi-widget.js loads this file too.)
 *
 *  Why a rendered button in our own card instead of One Tap: under FedCM, Chrome
 *  draws One Tap in browser UI at the top right on desktop and ignores positioning,
 *  so it cannot be a bottom prompt.
 *
 *  Activate: paste the Web OAuth client id into CLIENT_ID below AND into
 *  GOOGLE_CLIENT_ID in webhook/wrangler.toml. While it is empty this file does nothing.
 */
(function () {
  "use strict";
  if (window.__smGoogleSignup) return;
  window.__smGoogleSignup = true;

  var CLIENT_ID = "743655601010-slhoc53f98gaaane92lduamfc6835kv5.apps.googleusercontent.com";
  var ENDPOINT = "https://api.slashmantools.us/subscribe/google";
  var PRIVACY_URL = "https://slashmantools.us/privacy/#google-sign-in";
  var GIS_SRC = "https://accounts.google.com/gsi/client";
  var STORE_KEY = "sm_google_signup"; // "done", or epoch ms the dismissal expires
  var DISMISS_DAYS = 30;
  var GIS_WAIT_MS = 10000;
  // A sign-in prompt over a password generator reads as phishing; legal pages stay clean.
  var SKIP_PATHS = /\/(password-generator|privacy|terms|embed)(\/|\.html|$)/;

  var COPY = {
    en: {
      title: "Get new tools and offers by email",
      body: "Continue with Google to join the list for new tools, guides and product promotions. Unsubscribe anytime.",
      privacy: "Privacy",
      close: "Dismiss",
      saving: "Saving…",
      done: "You're on the list: ",
      error: "Something went wrong. Please try again.",
    },
    zh: {
      title: "用 Email 接收新工具與優惠",
      body: "使用 Google 帳戶繼續，即可訂閱新工具、教學與產品促銷資訊，隨時可取消訂閱。",
      privacy: "隱私權政策",
      close: "關閉",
      saving: "儲存中…",
      done: "訂閱成功：",
      error: "發生錯誤，請再試一次。",
    },
  };

  function storeGet() {
    try { return localStorage.getItem(STORE_KEY); } catch (_) { return null; }
  }
  function storeSet(v) {
    try { localStorage.setItem(STORE_KEY, String(v)); } catch (_) {}
  }

  function suppressed() {
    if (window.top !== window) return true; // embedded tool iframes
    if (location.protocol !== "https:") return true; // Google refuses plain-http origins (button 403s)
    if (SKIP_PATHS.test(location.pathname)) return true;
    var saved = storeGet();
    return saved === "done" || (saved && Number(saved) > Date.now());
  }

  function track(name) {
    try {
      if (typeof window.gtag === "function") window.gtag("event", name, { event_category: "google_signup" });
      if (typeof window.plausible === "function") window.plausible(name);
    } catch (_) {}
  }

  function readAttribution() {
    var out = {};
    var query = new URLSearchParams(location.search);
    var saved = {};
    try { saved = JSON.parse(sessionStorage.getItem("lead_utm") || "{}"); } catch (_) {}
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) {
      var v = query.get(k) || saved[k];
      if (v) out[k] = v.slice(0, 120);
    });
    return out;
  }

  function injectStyles() {
    var css =
      "#sm-google-prompt{position:fixed;left:16px;bottom:16px;z-index:2147483000;box-sizing:border-box;" +
      "width:min(360px,calc(100vw - 32px));padding:16px;border-radius:14px;background:#fff;color:#1f2937;" +
      "border:1px solid #e5e7eb;box-shadow:0 10px 30px rgba(0,0,0,.28);" +
      "font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans TC',sans-serif}" +
      "#sm-google-prompt[hidden]{display:none}" +
      "#sm-google-prompt strong{display:block;font-size:15px;margin:0 24px 4px 0;color:#111827}" +
      "#sm-google-prompt p{margin:0 0 12px;font-size:13px;color:#4b5563}" +
      "#sm-google-prompt a{color:#4b5563;text-decoration:underline}" +
      "#sm-google-prompt .sm-gp-close{position:absolute;top:6px;right:6px;width:32px;height:32px;padding:0;" +
      "border:0;background:none;color:#6b7280;font-size:20px;line-height:1;cursor:pointer}" +
      "#sm-google-prompt .sm-gp-status{margin:8px 0 0;font-weight:600;color:#047857}" +
      "#sm-google-prompt .sm-gp-status[data-kind=error]{color:#b91c1c}" +
      "@media (max-width:480px){#sm-google-prompt{left:8px;bottom:8px;width:calc(100vw - 16px)}}";
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function render() {
    var lang = (document.documentElement.lang || "").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
    var t = COPY[lang];

    var card = document.getElementById("sm-google-prompt");
    if (!card) {
      card = document.createElement("div");
      card.id = "sm-google-prompt";
      document.body.appendChild(card);
    }
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", t.title);

    var title = document.createElement("strong");
    title.textContent = t.title;

    var body = document.createElement("p");
    body.textContent = t.body + " ";
    var privacy = document.createElement("a");
    privacy.href = PRIVACY_URL;
    privacy.target = "_blank";
    privacy.rel = "noopener";
    privacy.textContent = t.privacy;
    body.appendChild(privacy);

    var slot = document.createElement("div");

    var status = document.createElement("p");
    status.className = "sm-gp-status";
    status.hidden = true;
    status.setAttribute("aria-live", "polite");

    var close = document.createElement("button");
    close.type = "button";
    close.className = "sm-gp-close";
    close.setAttribute("aria-label", t.close);
    close.textContent = "×";
    close.addEventListener("click", function () {
      storeSet(Date.now() + DISMISS_DAYS * 86400000);
      card.hidden = true;
      track("google_prompt_dismiss");
    });

    card.appendChild(close);
    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(slot);
    card.appendChild(status);

    function setStatus(msg, kind) {
      status.textContent = msg;
      status.hidden = false;
      status.setAttribute("data-kind", kind);
    }

    function onCredential(response) {
      setStatus(t.saving, "info");
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.assign(
            {
              credential: response.credential,
              source: "google-prompt-" + location.hostname,
              tags: "google-signin",
              referrer: document.referrer || "",
            },
            readAttribution()
          )
        ),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data || !data.ok) throw new Error((data && data.error) || "failed");
          storeSet("done");
          setStatus(t.done + data.email, "success");
          track("google_prompt_signup");
          slot.hidden = true;
          setTimeout(function () { card.hidden = true; }, 5000);
        })
        .catch(function () {
          setStatus(t.error, "error");
        });
    }

    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: onCredential,
      ux_mode: "popup",
      context: "signup",
    });
    window.google.accounts.id.renderButton(slot, {
      type: "standard",
      theme: "filled_blue",
      size: "large",
      shape: "pill",
      text: "continue_with",
      width: 280,
      locale: lang === "zh" ? "zh_TW" : "en",
    });
    card.hidden = false;
    track("google_prompt_shown");
  }

  function gisReady() {
    return window.google && window.google.accounts && window.google.accounts.id;
  }

  function start() {
    if (!document.querySelector('script[src^="' + GIS_SRC + '"]')) {
      var tag = document.createElement("script");
      tag.src = GIS_SRC;
      tag.async = true;
      document.head.appendChild(tag);
    }
    // Ad blockers often stop GIS. Then no card appears rather than an empty one.
    var deadline = Date.now() + GIS_WAIT_MS;
    (function wait() {
      if (gisReady()) {
        injectStyles();
        render();
      } else if (Date.now() < deadline) {
        setTimeout(wait, 100);
      }
    })();
  }

  if (!CLIENT_ID || suppressed()) return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
