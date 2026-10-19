/* ============================================================================
   Slashman Tools — Unified Cross-Tool Navigation Bar (engine)
   ============================================================================
   File    : unified-nav.js
   Version : 2.0.0 (2026-08-13: English-only, self-contained bar, Vercel-style)
   Author  : @slashman413 design division
   License : MIT

   WHAT IT DOES
   ------------
   1. Renders the whole navigation bar into <nav id="sn-nav"></nav> from the
      CONFIG object below. One file = one source of truth for every tool repo.
   2. The bar is SELF-CONTAINED: it renders links, a theme toggle, and a
      support link. It does NOT reach into the host page's content, translate
      it, or broadcast language changes. The site is English-only.
   3. Theme manager: dark / light. Stores `slashtools_theme`, sets
      <html data-theme="...">. Dark is the brand default. (This is the only
      state the bar shares with the page, since the page's own CSS keys off it.)
   4. Mobile: hamburger -> slide-down panel. Desktop: inline links.
   5. Active-link highlighting from location.pathname. Cross-tab theme sync.
      Fully keyboard-accessible (focus-visible, aria-*).

   HOW TO ADD TO A PAGE (any static tool repo)
   --------------------------------------------
   <link rel="stylesheet" href="https://slashmantools.us/shared/unified-nav.css">
   <nav id="sn-nav" aria-label="Site navigation"></nav>
   <script src="https://slashmantools.us/shared/unified-nav.js" defer></script>

   API exposed on window.SlashNav:
     SlashNav.getTheme() / setTheme(mode)
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     CONFIG — single source of truth for links + support link.
     Add/remove tools here; every page that loads this file updates.
     ------------------------------------------------------------------------ */
  var CONFIG = {
    brand: "Slashman Tools",
    links: [
      { href: "/tools/",                          key: "tools",    label: "Tools" },
      { href: "/tw-etf-dashboard/dashboard.html", key: "stocks",   label: "TW Stocks" },
      { href: "/global-events-tracker/",          key: "global",   label: "Global" },
      { href: "/blog/",                           key: "blog",     label: "Blog" },
      { href: "/services/",                       key: "services", label: "Services" },
      {
        href: "/topics/",
        key: "guides",
        label: "Guides",
        children: [
          { href: "/categories/ai-automation/",   key: "ai-automation",   label: "AI Automation" },
          { href: "/categories/investment/",      key: "investment",      label: "Investment" },
          { href: "/categories/developer-tools/", key: "developer-tools", label: "Developer Tools" },
          { href: "/categories/productivity/",    key: "productivity",    label: "Productivity" },
          { href: "/content-map/",                key: "content-map",     label: "Content Map" }
        ]
      }
    ],
    support: { url: "https://ko-fi.com/ytstories0413", label: "Support" }
  };

  var THEMES = ["dark", "light"];
  var LS_THEME = "slashtools_theme";

  /* Monochrome brand mark + theme glyphs (inline SVG — no emoji). */
  var ICONS = {
    mark:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="currentColor"/>' +
        '<path d="M15 6.5 9 17.5" stroke="var(--sn-bg,#000)" stroke-width="2.4" stroke-linecap="round"/>' +
      "</svg>",
    moon:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke="currentColor" ' +
        'stroke-width="1.8" stroke-linejoin="round"/></svg>',
    sun:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.8"/>' +
        '<path d="M12 2v2.4M12 19.6V22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2 12h2.4M19.6 12H22' +
        'M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round"/></svg>'
  };

  var host = document.getElementById("sn-nav");
  if (!host || host.getAttribute("data-sn-initialized")) return;
  host.setAttribute("data-sn-initialized", "1");

  var currentTheme = detectTheme();

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

  function detectTheme() {
    var t = load(LS_THEME);
    if (THEMES.indexOf(t) > -1) return t;
    return "dark"; // brand default: dark
  }

  /* ------------------------------------------------------------------ */
  /*  Render                                                            */
  /* ------------------------------------------------------------------ */
  /* Renders one link item. Items with `children` become a dropdown
     (desktop: hover/focus reveals; mobile panel: children inlined). */
  function renderLinks() {
    return CONFIG.links.map(function (l) {
      var html = '<a class="sn-link" data-key="' + esc(l.key) + '" href="' + esc(l.href) + '">'
        + esc(l.label) + "</a>";
      var kids = l.children || [];
      if (!kids.length) return html;
      var kidsHtml = kids.map(function (c) {
        return '<a class="sn-link sn-link--child" data-key="' + esc(c.key) + '" href="' + esc(c.href) + '">'
          + esc(c.label) + "</a>";
      }).join("");
      return '<div class="sn-dd-wrap">' + html +
        '<div class="sn-dd"><div class="sn-dd-inner">' + kidsHtml + "</div></div></div>";
    }).join("");
  }

  function render() {
    var links = renderLinks();

    host.innerHTML =
      '<div class="sn-nav">' +
        '<div class="sn-nav-inner">' +
          '<a class="sn-brand" href="/" aria-label="' + esc(CONFIG.brand) + ' home">' +
            '<span class="sn-brand__logo">' + ICONS.mark + "</span>" +
            '<span class="sn-brand__text">' + esc(CONFIG.brand) + "</span>" +
          "</a>" +
          '<div class="sn-links" role="list">' + links + "</div>" +
          '<div class="sn-actions">' +
            '<button type="button" class="sn-theme" aria-label="Toggle theme"></button>' +
            '<a class="sn-support" href="' + esc(CONFIG.support.url) + '" target="_blank" rel="noopener">' +
              esc(CONFIG.support.label) +
            "</a>" +
            '<button type="button" class="sn-burger" aria-expanded="false" aria-label="Menu">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
              '<path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" ' +
              'stroke-linecap="round"/></svg>' +
            "</button>" +
          "</div>" +
        "</div>" +
        '<div class="sn-panel">' +
          links +
          '<div class="sn-panel-row">' +
            '<a class="sn-support" href="' + esc(CONFIG.support.url) + '" target="_blank" rel="noopener">'
              + esc(CONFIG.support.label) + "</a>" +
          "</div>" +
        "</div>" +
      "</div>";

    wireEvents();
    applyTheme(currentTheme, true);
    markActive();
  }

  function wireEvents() {
    host.addEventListener("click", function (e) {
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
  /*  Theme (the only page-level state the bar owns)                     */
  /* ------------------------------------------------------------------ */
  function applyTheme(mode, skipStore) {
    currentTheme = THEMES.indexOf(mode) > -1 ? mode : "dark";
    document.documentElement.setAttribute("data-theme", currentTheme);
    if (!skipStore) store(LS_THEME, currentTheme);

    var btn = host.querySelector(".sn-theme");
    if (btn) {
      /* show the icon of the mode you'd switch TO */
      var next = currentTheme === "dark" ? "light" : "dark";
      btn.innerHTML = currentTheme === "dark" ? ICONS.sun : ICONS.moon;
      var lbl = "Switch to " + next + " theme";
      btn.setAttribute("aria-label", lbl);
      btn.setAttribute("title", lbl);
    }
  }

  function cycleTheme() {
    applyTheme(currentTheme === "dark" ? "light" : "dark", false);
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
  /*  Cross-tab theme sync                                               */
  /* ------------------------------------------------------------------ */
  window.addEventListener("storage", function (e) {
    if (e.key === LS_THEME && e.newValue && e.newValue !== currentTheme) applyTheme(e.newValue, true);
  });

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */
  window.SlashNav = {
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
