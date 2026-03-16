'use strict';

// ============================================================
// UTILS  —  shadow-DOM stylesheet helper
// Injects an extension stylesheet into a shadow root via <link>
// so CSS lives in styles/ and not inline in JS files.
// ============================================================
(function () {
  const DSS = window.DSS;

  DSS.addShadowStyle = function (shadow, file) {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = chrome.runtime.getURL(`styles/${file}`);
    shadow.appendChild(link);
  };
})();
