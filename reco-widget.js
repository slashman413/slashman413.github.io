/*! reco-widget.js — shared Amazon affiliate recommendation widget for all slashman413 sites.
 *  Single source of truth: edit ONLY this file to change products/behaviour everywhere.
 *  Usage on any page:  <div class="reco-widget" data-cat="finance"></div>
 *                      <script src="https://slashman413.github.io/reco-widget.js" defer></script>
 *  Categories: ai | security | writing | finance | dev | design | productivity | media | utility
 */
(function () {
  var TAG = "ytstories0413-20";
  var ROTATE_MS = 5500;

  // [emoji, display title, amazon search keyword]
  var CAT = {
    ai: [
      ["📘", "Hands-On Machine Learning", "hands on machine learning book"],
      ["🤖", "AI Engineering — Chip Huyen", "ai engineering chip huyen book"],
      ["🧠", "Deep Learning — Goodfellow", "deep learning goodfellow book"],
      ["🎮", "NVIDIA RTX GPU", "nvidia rtx gpu"],
      ["📕", "Designing ML Systems", "designing machine learning systems book"],
      ["🖥️", "Portable Monitor", "portable monitor"]
    ],
    security: [
      ["🔑", "YubiKey 5 NFC Security Key", "yubikey 5 nfc"],
      ["🔐", "Password Manager", "password manager subscription"],
      ["📕", "The Art of Invisibility — Mitnick", "art of invisibility mitnick"],
      ["🛡️", "Hardware Security Key", "hardware security key fido2"],
      ["💻", "Webcam Privacy Cover", "webcam cover slide"]
    ],
    writing: [
      ["✍️", "On Writing — Stephen King", "on writing stephen king"],
      ["📖", "The Elements of Style", "elements of style book"],
      ["⌨️", "Mechanical Keyboard", "mechanical keyboard"],
      ["📓", "Writing Notebook", "writing notebook journal"],
      ["🖊️", "Fountain Pen", "fountain pen"]
    ],
    finance: [
      ["📈", "The Intelligent Investor", "intelligent investor book"],
      ["💰", "The Psychology of Money", "psychology of money book"],
      ["📊", "A Random Walk Down Wall Street", "random walk down wall street"],
      ["📕", "One Up On Wall Street", "one up on wall street book"],
      ["🪙", "Common Sense Investing — Bogle", "little book of common sense investing"],
      ["📗", "The Simple Path to Wealth", "simple path to wealth book"]
    ],
    dev: [
      ["💻", "Clean Code — Robert Martin", "clean code robert martin"],
      ["📘", "The Pragmatic Programmer", "pragmatic programmer book"],
      ["⌨️", "Mechanical Keyboard", "mechanical keyboard"],
      ["🔌", "USB-C Hub", "usb c hub"],
      ["🖥️", "Portable Monitor", "portable monitor"]
    ],
    design: [
      ["🎨", "Monitor Color Calibrator", "monitor color calibrator spyderx"],
      ["📕", "Interaction of Color — Albers", "interaction of color albers"],
      ["🖍️", "Color Theory for Designers", "color theory design book"],
      ["🖱️", "Graphics Drawing Tablet", "graphics drawing tablet"]
    ],
    productivity: [
      ["⏲️", "Pomodoro Cube Timer", "pomodoro timer cube"],
      ["📚", "Deep Work — Cal Newport", "deep work cal newport"],
      ["📕", "Atomic Habits — James Clear", "atomic habits book"],
      ["🎧", "Noise-Cancelling Headphones", "noise cancelling headphones"],
      ["🪑", "Standing Desk", "standing desk"]
    ],
    media: [
      ["💾", "Samsung T7 Portable SSD", "samsung t7 portable ssd"],
      ["🖨️", "Document Scanner", "document scanner"],
      ["🏷️", "Label Printer", "label printer"],
      ["📷", "Barcode / QR Scanner", "qr code scanner"],
      ["🔌", "USB-C Hub", "usb c hub"]
    ],
    utility: [
      ["⚖️", "Digital Kitchen Scale", "digital kitchen scale"],
      ["🧮", "Scientific Calculator", "scientific calculator"],
      ["📐", "Math Reference Guide", "math reference book"],
      ["📏", "Tape Measure", "tape measure"]
    ]
  };

  function injectStyle() {
    if (document.getElementById("rw-style")) return;
    var s = document.createElement("style");
    s.id = "rw-style";
    s.textContent =
      ".reco-widget{margin:16px auto;max-width:560px}" +
      ".rw-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:12px 14px}" +
      ".rw-head{font-size:11px;font-weight:700;letter-spacing:1px;color:#7a7aa8;text-transform:uppercase;margin-bottom:8px}" +
      ".rw-slot{transition:opacity .22s ease}" +
      ".rw-slot a{display:flex;align-items:center;gap:10px;text-decoration:none;color:#e8e8f0;padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05)}" +
      ".rw-slot a:hover{background:rgba(255,255,255,.08)}" +
      ".rw-emoji{font-size:22px;line-height:1}" +
      ".rw-title{flex:1;font-size:14px;font-weight:600}" +
      ".rw-cta{font-size:12px;color:#a5b4fc;white-space:nowrap}" +
      ".rw-disc{font-size:10px;color:#55557a;margin-top:8px;text-align:center}";
    document.head.appendChild(s);
  }

  function mount(el) {
    var cat = (el.getAttribute("data-cat") || "finance").toLowerCase();
    var list = (CAT[cat] || CAT.finance).slice();
    for (var j = list.length - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)); var t = list[j]; list[j] = list[k]; list[k] = t; }
    el.innerHTML = '<div class="rw-card"><div class="rw-head">🛒 推薦 Recommended</div><div class="rw-slot"></div><div class="rw-disc">含 Amazon 聯盟連結 · As an Amazon Associate I earn from qualifying purchases</div></div>';
    var slot = el.querySelector(".rw-slot");
    var i = 0;
    function show() {
      var p = list[i % list.length]; i++;
      slot.style.opacity = 0;
      setTimeout(function () {
        var a = document.createElement("a");
        a.href = "https://www.amazon.com/s?k=" + encodeURIComponent(p[2]) + "&tag=" + TAG;
        a.target = "_blank";
        a.rel = "nofollow sponsored noopener";
        a.innerHTML = '<span class="rw-emoji">' + p[0] + '</span><span class="rw-title">' + p[1] + '</span><span class="rw-cta">在 Amazon 查看 →</span>';
        a.addEventListener("click", function () { try { gtag("event", "affiliate_click", { cat: cat }); } catch (e) {} });
        slot.innerHTML = "";
        slot.appendChild(a);
        slot.style.opacity = 1;
      }, 220);
    }
    show();
    if (list.length > 1) setInterval(show, ROTATE_MS);
  }

  function init() {
    injectStyle();
    var els = document.querySelectorAll(".reco-widget");
    for (var n = 0; n < els.length; n++) mount(els[n]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
