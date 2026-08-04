/**
 * Slashman Tools — CTA A/B Testing framework
 * ===========================================
 * Client-side A/B/n testing for the site's conversion buttons.
 *
 * How it works
 * ------------
 *   Every button tagged `data-ab-test="<testId>"` is assigned a sticky cell
 *   (localStorage, 50/50 or weighted split) on first view. The cell controls:
 *     - button text   (data-ab-text-a / data-ab-text-b)
 *     - button colour (data-ab-color-a / data-ab-color-b)
 *   The chosen cell is written into the enclosing form as a hidden
 *   `variant` input, so EVERY lead record carries its cell end-to-end:
 *
 *     form → lead-capture.js (body.variant) → Worker (lead.variant) → KV
 *           → sync_kv_to_mautic.py → Mautic tag "variant-<test>-<cell>"
 *
 *   That makes conversion the ground-truth metric: pull GET /leads from the
 *   Worker (or query Mautic tags) and compare cells on actual signups, not
 *   just clicks. Impression/click funnels are also pushed to Plausible and
 *   GA4 as cta_impression / cta_click events with {test, variant, placement}.
 *
 * Tests (see TESTS below)
 * -----------------------
 *   leadmagnet — in-article / homepage / toolkit download buttons
 *                 2×2 factorial + amber: text (control vs "Yes, Send Me…") ×
 *                 colour (indigo control vs green vs amber). Cells a1, a2,
 *                 b1, b2, c1, 20% each.
 *   newsletter — sidebar / footer / newsletter-page / mid-article forms
 *                Text A/B/C: "Subscribe" vs "Get Weekly AI Guides — Free" vs
 *                "Join Now — It's Free" (indigo).
 *                Colour A/B/C: indigo vs amber vs emerald (control text).
 *                Cells a–e, 20% each — text and colour are orthogonal
 *                marginals of the same test, so both dimensions are
 *                analysable from one cell assignment.
 *
 * Adding a test: add an entry to TESTS, tag buttons with data-ab-test and
 * the matching data-ab-text-* / data-ab-color-* attributes. Nothing else.
 *
 * No external dependencies; matches the ES5 style of lead-capture.js.
 */
(function () {
  "use strict";

  var TESTS = {
    leadmagnet: {
      cells: [
        { id: "a1", text: "a", color: "a", w: 1 }, // control text + indigo
        { id: "a2", text: "a", color: "b", w: 1 }, // control text + green
        { id: "b1", text: "b", color: "a", w: 1 }, // new text + indigo
        { id: "b2", text: "b", color: "b", w: 1 }, // new text + green
        { id: "c1", text: "a", color: "c", w: 1 }, // control text + amber (high attention)
      ],
    },
    newsletter: {
      cells: [
        { id: "a", text: "a", color: "a", w: 1 }, // "Subscribe" + indigo (control)
        { id: "b", text: "b", color: "a", w: 1 }, // "Get Weekly AI Guides — Free"
        { id: "c", text: "c", color: "a", w: 1 }, // "Join Now — It's Free"
        { id: "d", text: "a", color: "b", w: 1 }, // amber button (high attention)
        { id: "e", text: "a", color: "c", w: 1 }, // emerald button (success/green)
      ],
    },
  };

  var LS_PREFIX = "sl_ab_";

  function cellDef(testId, cellId) {
    var def = TESTS[testId];
    if (!def) return null;
    for (var i = 0; i < def.cells.length; i++) {
      if (def.cells[i].id === cellId) return def.cells[i];
    }
    return def.cells[0];
  }

  function pickCell(testId) {
    var def = TESTS[testId];
    if (!def) return "a";
    var key = LS_PREFIX + testId;
    try {
      var saved = localStorage.getItem(key);
      if (saved && cellDef(testId, saved)) return saved;
      var total = 0;
      for (var i = 0; i < def.cells.length; i++) total += def.cells[i].w;
      var r = Math.random() * total;
      for (var j = 0; j < def.cells.length; j++) {
        r -= def.cells[j].w;
        if (r <= 0) {
          localStorage.setItem(key, def.cells[j].id);
          return def.cells[j].id;
        }
      }
      var last = def.cells[def.cells.length - 1].id;
      localStorage.setItem(key, last);
      return last;
    } catch (_) {
      // Storage unavailable (private mode) — fall back to the control cell.
      return def.cells[0].id;
    }
  }

  function track(eventName, testId, cellId, placement) {
    try {
      var props = { test: testId, variant: cellId };
      if (placement) props.placement = placement;
      if (typeof window.plausible === "function") {
        window.plausible(eventName, { props: props });
      }
      if (typeof window.gtag === "function") {
        window.gtag("event", eventName, props);
      }
    } catch (_) {}
  }

  function applyTo(btn) {
    var testId = btn.getAttribute("data-ab-test");
    if (!testId || !TESTS[testId]) return;

    var cellId = pickCell(testId);
    var cell = cellDef(testId, cellId);
    var placement = btn.getAttribute("data-ab-placement") || "unknown";

    var text =
      cell.text === "b"
        ? btn.getAttribute("data-ab-text-b")
        : cell.text === "c"
        ? btn.getAttribute("data-ab-text-c")
        : btn.getAttribute("data-ab-text-a");
    var color =
      cell.color === "b"
        ? btn.getAttribute("data-ab-color-b")
        : cell.color === "c"
        ? btn.getAttribute("data-ab-color-c")
        : btn.getAttribute("data-ab-color-a");
    if (text) btn.textContent = text;
    if (color) btn.style.background = color;

    btn.dataset.abCell = cellId;

    // Carry the cell on every lead captured from this form.
    var form = btn.closest("form");
    if (form && !form.querySelector('input[name="variant"]')) {
      var inp = document.createElement("input");
      inp.type = "hidden";
      inp.name = "variant";
      inp.value = testId + ":" + cellId;
      form.appendChild(inp);
    }

    // Impression = actually visible to the visitor (not just present in DOM).
    if ("IntersectionObserver" in window) {
      var fired = false;
      var io = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting && !fired) {
              fired = true;
              track("cta_impression", testId, cellId, placement);
              io.disconnect();
            }
          }
        },
        { rootMargin: "80px 0px" }
      );
      io.observe(btn);
    } else {
      track("cta_impression", testId, cellId, placement);
    }
  }

  /**
   * Mid-article inline CTA — injects a compact newsletter form after the
   * paragraph at ~50% of the article's text length. Only on real articles
   * (≥1200 chars of prose, <2 existing lead forms). Client-side injection
   * means every existing and future article gets the CTA with zero edits.
   * The injected form participates in the `newsletter` A/B test (placement
   * "mid-article") and is auto-bound by lead-capture.js's MutationObserver.
   */
  var MID_ARTICLE_CSS =
    ".mid-article-cta{margin:30px 0;padding:18px 20px;background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.28);border-radius:12px}" +
    ".mid-article-cta .mac-title{font-size:14.5px;font-weight:800;color:#f0f0f8;margin:0 0 4px}" +
    ".mid-article-cta .mac-sub{font-size:12.5px;color:var(--muted,#7878a0);line-height:1.55;margin:0 0 10px}" +
    ".mid-article-cta form{display:flex;gap:6px;flex-wrap:wrap}" +
    ".mid-article-cta input[type=email]{flex:1;min-width:180px;padding:9px 11px;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:8px;color:#f0f0f8;font-size:13px;outline:none}" +
    ".mid-article-cta button{padding:9px 16px;background:#a5b4fc;color:#0a0a0f;border:none;border-radius:8px;font-weight:700;font-size:12.5px;cursor:pointer;white-space:nowrap}" +
    ".mid-article-cta [data-lead-status]{flex:1 1 100%;font-size:11.5px;margin-top:2px;min-height:14px}" +
    "@media(max-width:600px){.mid-article-cta form{flex-direction:column}.mid-article-cta input[type=email]{min-width:0}}";

  function ensureMidArticleCSS() {
    if (document.getElementById("sl-mid-article-css")) return;
    var style = document.createElement("style");
    style.id = "sl-mid-article-css";
    style.textContent = MID_ARTICLE_CSS;
    document.head.appendChild(style);
  }

  function injectMidArticleCTA() {
    var article = document.querySelector(".content article");
    if (!article) return;
    if (article.querySelectorAll("[data-lead-form]").length >= 2) return;
    var paras = article.querySelectorAll("p");
    var total = 0;
    for (var i = 0; i < paras.length; i++) total += (paras[i].textContent || "").length;
    if (total < 1200) return; // too short to interrupt
    var half = total / 2;
    var acc = 0;
    var target = null;
    for (var j = 0; j < paras.length; j++) {
      acc += (paras[j].textContent || "").length;
      if (acc >= half) {
        target = paras[j];
        break;
      }
    }
    if (!target || !target.parentNode) return;

    var box = document.createElement("div");
    box.className = "mid-article-cta";
    box.innerHTML =
      '<p class="mac-title">Enjoying this guide?</p>' +
      '<p class="mac-sub">Get a free weekly roundup of practical AI tools and automation walkthroughs — plus the AI Productivity Toolkit on signup. No spam, unsubscribe anytime.</p>' +
      '<form data-lead-form data-source="mid-article" data-success-text="✅ You\'re in — check your inbox!">' +
      '<input type="email" name="mauticform[email]" placeholder="you@example.com" aria-label="Email address" required inputmode="email" autocomplete="email">' +
      '<input type="hidden" name="mauticform[formId]" value="15">' +
      '<input type="hidden" name="mauticform[formName]" value="midarticlesubscribe">' +
      '<input type="hidden" name="tags" value="mid-article">' +
      '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">' +
      '<button type="submit" data-ab-test="newsletter" data-ab-placement="mid-article" ' +
      'data-ab-text-a="Subscribe" data-ab-text-b="Get Weekly AI Guides — Free" data-ab-text-c="Join Now — It\'s Free" ' +
      'data-ab-color-a="#a5b4fc" data-ab-color-b="#f59e0b" data-ab-color-c="#10b981">Subscribe</button>' +
      '<p data-lead-status role="status" aria-live="polite"></p>' +
      "</form>";
    target.parentNode.insertBefore(box, target.nextSibling);
    var btn = box.querySelector("[data-ab-test]");
    if (btn) applyTo(btn);
    // lead-capture.js's MutationObserver binds the new form.
  }

  function init() {
    var btns = document.querySelectorAll("[data-ab-test]");
    for (var i = 0; i < btns.length; i++) applyTo(btns[i]);
    ensureMidArticleCSS();
    injectMidArticleCTA();
  }

  // Click/conversion funnel: fires on valid submit (browsers block the submit
  // event for invalid required fields, so this is close to a real attempt).
  document.addEventListener(
    "submit",
    function (e) {
      var form = e.target;
      if (!form || form.tagName !== "FORM") return;
      var btn = form.querySelector("[data-ab-test]");
      if (btn && btn.dataset.abCell) {
        track(
          "cta_click",
          btn.getAttribute("data-ab-test"),
          btn.dataset.abCell,
          btn.getAttribute("data-ab-placement") || "unknown"
        );
      }
    },
    true
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Debug / reporting hook: window.SLASHMAN_AB.getVariant("leadmagnet")
  window.SLASHMAN_AB = {
    getVariant: function (testId) {
      return TESTS[testId] ? pickCell(testId) : null;
    },
  };
})();
