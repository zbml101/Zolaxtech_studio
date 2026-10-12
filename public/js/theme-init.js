// Runs before the page paints so the theme does not flash.
(function () {
  var t = null;
  try { t = localStorage.getItem('zx-theme'); } catch (e) {}
  if (!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
})();
