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
 *                2×2 factorial: text (control vs "Yes, Send Me…") × colour
 *                (indigo control vs green). Cells a1, a2, b1, b2, 25% each.
 *   newsletter — sidebar / footer / newsletter-page forms
 *                A/B text: "Subscribe" vs "Get Weekly AI Guides — Free".
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
      ],
    },
    newsletter: {
      cells: [
        { id: "a", text: "a", color: "a", w: 1 }, // "Subscribe" + indigo
        { id: "b", text: "b", color: "a", w: 1 }, // "Get Weekly AI Guides — Free" (text-only test)
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

    var text = cell.text === "b" ? btn.getAttribute("data-ab-text-b") : btn.getAttribute("data-ab-text-a");
    var color = cell.color === "b" ? btn.getAttribute("data-ab-color-b") : btn.getAttribute("data-ab-color-a");
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

  function init() {
    var btns = document.querySelectorAll("[data-ab-test]");
    for (var i = 0; i < btns.length; i++) applyTo(btns[i]);
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
