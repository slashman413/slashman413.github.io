/*! kofi-widget.js — shared Ko-fi floating support button for all slashmantools.us pages.
 *  Single source of truth: edit ONLY this file to change the button everywhere.
 *  Usage on any page:  <script src="https://slashmantools.us/kofi-widget.js" defer></script>
 */
(function () {
  if (window.__kofiLoaded) return;
  window.__kofiLoaded = true;
  var s = document.createElement("script");
  s.src = "https://storage.ko-fi.com/cdn/scripts/overlay-widget.js";
  s.async = true;
  s.onload = function () {
    try {
      window.kofiWidgetOverlay.draw("ytstories0413", {
        "type": "floating-chat",
        "floating-chat.donateButton.text": "Support",
        "floating-chat.donateButton.background-color": "#794bc4",
        "floating-chat.donateButton.text-color": "#ffffff"
      });
    } catch (e) {}
  };
  document.head.appendChild(s);
})();
