/* ============================================================================
   Slashman Tools — Unified Cross-Tool Navigation Bar (engine)
   ============================================================================
   File    : unified-nav.js
   Version : 1.1.0 (2026-08-03: add Guides dropdown — 4 content pillars + content map)
   Author  : ArchitectUX (@slashman413 design division)
   License : MIT

   WHAT IT DOES
   ------------
   1. Renders the entire navigation bar into <nav id="sn-nav"></nav> from the
      CONFIG object below. One file = one source of truth for ALL ~30 tool
      repos: edit here, every tool gets the new nav.
   2. Bilingual UI (EN / 繁體 / 简体). Reads the EXISTING `site_lang`
      localStorage key so users keep their language across every tool.
      Emits a `slashtools:lang` CustomEvent + best-effort calls a page-level
      `window.setLang()` so existing bilingual tools can follow along.
   3. Theme manager: dark / light / system. Stores `slashtools_theme`,
      sets <html data-theme="...">. Dark is the brand default.
   4. Mobile: hamburger → slide-down panel. Desktop: inline links.
   5. Active-link highlighting from location.pathname. Cross-tab sync via the
      storage event. Fully keyboard-accessible (focus-visible, aria-*).

   HOW TO ADD TO A PAGE (any static tool repo)
   --------------------------------------------
   <link rel="stylesheet" href="https://slashmantools.us/shared/unified-nav.css">
   <nav id="sn-nav" aria-label="Site navigation"></nav>
   <script src="https://slashmantools.us/shared/unified-nav.js" defer></script>

   API exposed on window.SlashNav:
     SlashNav.getLang() / setLang(code) / getTheme() / setTheme(mode)
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     CONFIG — single source of truth for links, labels, i18n, Ko-fi.
     Add/remove tools here; every page that loads this file updates.
     ------------------------------------------------------------------------ */
  var CONFIG = {
    brand: {
      en: "Slashman Tools",
      "zh-Hant": "Slashman 工具箱",
      "zh-Hans": "Slashman 工具箱"
    },
    links: [
      { href: "/tools/",                          key: "tools",     label: { en: "Tools",         "zh-Hant": "工具",       "zh-Hans": "工具" } },
      { href: "/tw-etf-dashboard/dashboard.html", key: "stocks",    label: { en: "TW Stocks",     "zh-Hant": "台股分析",   "zh-Hans": "台股分析" } },
      { href: "/global-events-tracker/",          key: "global",    label: { en: "Global",        "zh-Hant": "全球追蹤",   "zh-Hans": "全球追踪" } },
      { href: "/blog/",                           key: "blog",      label: { en: "Blog",          "zh-Hant": "部落格",     "zh-Hans": "博客" } },
      { href: "/services/",                       key: "services",  label: { en: "Services",      "zh-Hant": "接案服務",   "zh-Hans": "接案服务" } },
      {
        href: "/topics/",
        key: "guides",
        label: { en: "Guides", "zh-Hant": "指南", "zh-Hans": "指南" },
        children: [
          { href: "/categories/ai-automation/",  key: "ai-automation",  label: { en: "AI Automation", "zh-Hant": "AI 自動化", "zh-Hans": "AI 自动化" } },
          { href: "/categories/investment/",     key: "investment",     label: { en: "Investment",    "zh-Hant": "投資",       "zh-Hans": "投资" } },
          { href: "/categories/developer-tools/", key: "developer-tools", label: { en: "Developer Tools", "zh-Hant": "開發者工具", "zh-Hans": "开发者工具" } },
          { href: "/categories/productivity/",   key: "productivity",   label: { en: "Productivity",  "zh-Hant": "生產力",     "zh-Hans": "生产力" } },
          { href: "/content-map/",               key: "content-map",    label: { en: "Content Map",   "zh-Hant": "內容地圖",   "zh-Hans": "内容地图" } }
        ]
      }
    ],
    langOptions: [
      { code: "en",      label: "EN" },
      { code: "zh-Hant", label: "繁" },
      { code: "zh-Hans", label: "简" }
    ],
    kofi: {
      url: "https://ko-fi.com/ytstories0413",
      label: { en: "Support", "zh-Hant": "支持", "zh-Hans": "支持" }
    },
    themeIcons: { dark: "🌙", light: "☀️", system: "💻" },
    themeLabels: {
      dark:   { en: "Switch to light theme",   "zh-Hant": "切換至淺色主題",   "zh-Hans": "切换至浅色主题" },
      light:  { en: "Switch to system theme",  "zh-Hant": "切換至系統主題",   "zh-Hans": "切换至系统主题" },
      system: { en: "Switch to dark theme",    "zh-Hant": "切換至深色主題",   "zh-Hans": "切换至深色主题" }
    }
  };

  var LANGS = ["en", "zh-Hant", "zh-Hans"];
  var THEMES = ["dark", "light", "system"];
  var LS_LANG = "site_lang";        // reuse existing key — users keep their language
  var LS_THEME = "slashtools_theme";

  var host = document.getElementById("sn-nav");
  if (!host || host.getAttribute("data-sn-initialized")) return;
  host.setAttribute("data-sn-initialized", "1");

  var currentLang = detectLang();
  var currentTheme = detectTheme();
  var systemQuery = window.matchMedia("(prefers-color-scheme: light)");
  var systemListenerAttached = false;

  /* ------------------------------------------------------------------ */
  /*  Small helpers                                                      */
  /* ------------------------------------------------------------------ */
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function detectLang() {
    var l = load(LS_LANG);
    if (l === "zh") l = "zh-Hant";                    // portal stores "zh"
    if (l && LANGS.indexOf(l) > -1) return l;
    var nav = (navigator.language || "en").toLowerCase();
    if (nav.indexOf("zh") === 0) {
      return (nav.indexOf("cn") > -1 || nav.indexOf("hans") > -1 || nav.indexOf("sg") > -1)
        ? "zh-Hans" : "zh-Hant";
    }
    return "en";
  }

  function detectTheme() {
    var t = load(LS_THEME);
    return THEMES.indexOf(t) > -1 ? t : "dark";       // brand default: dark
  }

  function resolveTheme(mode) {
    if (mode === "system") {
      return systemQuery.matches ? "light" : "dark";
    }
    return mode;
  }

  function tr(obj) { return (obj && obj[currentLang]) || (obj && obj.en) || ""; }

  /* ------------------------------------------------------------------ */
  /*  Render                                                            */
  /* ------------------------------------------------------------------ */
  /* Renders one link item. Items with `children` become a dropdown
     (desktop: hover/focus reveals; mobile panel: children inlined). */
  function renderLinks(panel) {
    return CONFIG.links.map(function (l) {
      var html = '<a class="sn-link" data-key="' + esc(l.key) + '" href="' + esc(l.href) + '">'
        + esc(tr(l.label)) + "</a>";
      var kids = l.children || [];
      if (!kids.length) return html;
      var kidsHtml = kids.map(function (c) {
        return '<a class="sn-link sn-link--child" data-key="' + esc(c.key) + '" href="' + esc(c.href) + '">'
          + esc(tr(c.label)) + "</a>";
      }).join("");
      return '<div class="sn-dd-wrap">' + html +
        '<div class="sn-dd"><div class="sn-dd-inner">' + kidsHtml + "</div></div></div>";
    }).join("");
  }

  function render() {
    var links = renderLinks(false);
    var panelLinks = renderLinks(true);

    var langBtns = CONFIG.langOptions.map(function (o) {
      return '<button type="button" class="sn-lang-btn" data-lang="' + esc(o.code)
        + '" aria-pressed="false">' + esc(o.label) + "</button>";
    }).join("");

    host.innerHTML =
      '<div class="sn-nav">' +
        '<div class="sn-nav-inner">' +
          '<a class="sn-brand" href="/">' +
            '<span class="sn-brand__logo" aria-hidden="true">🧰</span>' +
            '<span class="sn-brand__text">' + esc(tr(CONFIG.brand)) + "</span>" +
          "</a>" +
          '<div class="sn-links" role="list">' + links + "</div>" +
          '<div class="sn-actions">' +
            '<div class="sn-lang" role="group" aria-label="Language">' + langBtns + "</div>" +
            '<button type="button" class="sn-theme" aria-label="Theme"></button>' +
            '<a class="sn-kofi" href="' + esc(CONFIG.kofi.url) + '" target="_blank" rel="noopener">' +
              "☕ <span>" + esc(tr(CONFIG.kofi.label)) + "</span>" +
            "</a>" +
            '<button type="button" class="sn-burger" aria-expanded="false" aria-label="Menu">☰</button>' +
          "</div>" +
        "</div>" +
        '<div class="sn-panel">' +
          panelLinks +
          '<div class="sn-panel-row">' +
            '<div class="sn-lang" role="group" aria-label="Language">' + langBtns + "</div>" +
            '<a class="sn-kofi" href="' + esc(CONFIG.kofi.url) + '" target="_blank" rel="noopener">☕ <span>'
              + esc(tr(CONFIG.kofi.label)) + "</span></a>" +
          "</div>" +
        "</div>" +
      "</div>";

    wireEvents();
    applyLang();
    applyTheme(currentTheme, true);
    markActive();
  }

  function wireEvents() {
    /* Language buttons (delegated: covers desktop + mobile panel) */
    host.addEventListener("click", function (e) {
      var btn = e.target.closest(".sn-lang-btn");
      if (btn) { setLang(btn.getAttribute("data-lang")); return; }

      var burger = e.target.closest(".sn-burger");
      if (burger) {
        var open = burger.getAttribute("aria-expanded") === "true";
        setMenuOpen(!open);
        return;
      }

      var themeBtn = e.target.closest(".sn-theme");
      if (themeBtn) { cycleTheme(); return; }

      /* close the mobile panel when a link is chosen */
      var link = e.target.closest(".sn-link");
      if (link) setMenuOpen(false);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Language                                                           */
  /* ------------------------------------------------------------------ */
  function applyLang() {
    /* flat key -> config map covering top-level links AND dropdown children */
    var cfgByKey = {};
    CONFIG.links.forEach(function (l) {
      cfgByKey[l.key] = l;
      (l.children || []).forEach(function (c) { cfgByKey[c.key] = c; });
    });
    host.querySelectorAll(".sn-brand__text").forEach(function (el) {
      el.textContent = tr(CONFIG.brand);
    });
    host.querySelectorAll(".sn-link").forEach(function (el) {
      var cfg = cfgByKey[el.getAttribute("data-key")];
      if (cfg) el.textContent = tr(cfg.label);
    });
    host.querySelectorAll(".sn-kofi span").forEach(function (el) {
      el.textContent = tr(CONFIG.kofi.label);
    });
    host.querySelectorAll(".sn-lang-btn").forEach(function (el) {
      el.setAttribute("aria-pressed", String(el.getAttribute("data-lang") === currentLang));
    });
    /* a11y: reflect the language on <html> so screen readers announce correctly */
    if (document.documentElement.lang !== currentLang) {
      document.documentElement.lang = currentLang;
    }
  }

  function setLang(l) {
    if (LANGS.indexOf(l) === -1) return;
    currentLang = l;
    store(LS_LANG, l);
    applyLang();
    /* best-effort: let pages with their own setLang() follow along */
    try { if (typeof window.setLang === "function") window.setLang(l); } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent("slashtools:lang", { detail: { lang: l } }));
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ */
  /*  Theme                                                              */
  /* ------------------------------------------------------------------ */
  function applyTheme(mode, skipStore) {
    currentTheme = THEMES.indexOf(mode) > -1 ? mode : "dark";
    var resolved = resolveTheme(currentTheme);
    document.documentElement.setAttribute("data-theme", resolved);

    if (currentTheme === "system") {
      if (!systemListenerAttached) {
        systemQuery.addEventListener("change", function () {
          if (currentTheme === "system") {
            document.documentElement.setAttribute("data-theme", resolveTheme("system"));
          }
        });
        systemListenerAttached = true;
      }
    }
    if (!skipStore) store(LS_THEME, currentTheme);

    var btn = host.querySelector(".sn-theme");
    if (btn) {
      btn.textContent = CONFIG.themeIcons[currentTheme];
      btn.setAttribute("aria-label", tr(CONFIG.themeLabels[currentTheme]));
      btn.setAttribute("title", tr(CONFIG.themeLabels[currentTheme]));
    }
  }

  function cycleTheme() {
    var order = { dark: "light", light: "system", system: "dark" };
    applyTheme(order[currentTheme], false);
  }

  /* ------------------------------------------------------------------ */
  /*  Active link + mobile menu                                          */
  /* ------------------------------------------------------------------ */
  function markActive() {
    var path = location.pathname || "/";
    function isActive(href) {
      return (href === "/" && path === "/") ||
        (href !== "/" && path.indexOf(href) === 0);
    }
    CONFIG.links.forEach(function (l) {
      var kids = l.children || [];
      var active = isActive(l.href);
      if (!active) {
        kids.forEach(function (c) { if (isActive(c.href)) active = true; });
      }
      host.querySelectorAll('.sn-link[data-key="' + l.key + '"]').forEach(function (el) {
        el.classList.toggle("sn-active", active);
      });
      kids.forEach(function (c) {
        host.querySelectorAll('.sn-link[data-key="' + c.key + '"]').forEach(function (el) {
          el.classList.toggle("sn-active", isActive(c.href));
        });
      });
    });
  }

  function setMenuOpen(open) {
    var nav = host.querySelector(".sn-nav");
    var burger = host.querySelector(".sn-burger");
    if (!nav || !burger) return;
    nav.setAttribute("data-open", open ? "true" : "false");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  /* ------------------------------------------------------------------ */
  /*  Cross-tab sync                                                     */
  /* ------------------------------------------------------------------ */
  window.addEventListener("storage", function (e) {
    if (e.key === LS_LANG && e.newValue && e.newValue !== currentLang) setLang(e.newValue);
    if (e.key === LS_THEME && e.newValue && e.newValue !== currentTheme) applyTheme(e.newValue, false);
  });

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */
  window.SlashNav = {
    getLang: function () { return currentLang; },
    setLang: setLang,
    getTheme: function () { return currentTheme; },
    setTheme: function (m) { applyTheme(m, false); }
  };

  /* Run once the DOM is ready (script may load before or after parse). */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
