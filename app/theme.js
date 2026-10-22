// Light or dark, before the first paint. A plain script (not a module) in <head>, after the theme-color metas, so the
// page never flashes the wrong colours. The choice is per device: 'light', 'dark' or 'auto' (follow the system). The
// tokens in styles.css read <html data-theme>. window.ctoTheme.set() changes it, with a cross-fade where the browser can do one.
(function () {
  var KEY = 'cto.theme';
  var sys = window.matchMedia('(prefers-color-scheme: dark)');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mem = null; // when storage is blocked, the choice lasts for this page
  function pref() {
    if (mem) return mem;
    try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch (e) { return 'auto'; }
  }
  function apply() {
    var p = pref();
    var dark = p === 'dark' || (p === 'auto' && sys.matches);
    var root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-theme-pref', p);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) { metas[i].removeAttribute('media'); metas[i].setAttribute('content', dark ? '#000000' : '#f2f2f7'); }
  }
  function set(p) {
    try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch (e) { mem = p; }
    var go = function () { apply(); window.dispatchEvent(new Event('cto-theme')); };
    if (document.startViewTransition && !calm.matches) document.startViewTransition(go); else go();
  }
  apply();
  sys.addEventListener('change', function () { if (pref() === 'auto') { apply(); window.dispatchEvent(new Event('cto-theme')); } });
  window.addEventListener('storage', function (e) { if (e.key === KEY) { apply(); window.dispatchEvent(new Event('cto-theme')); } });
  window.ctoTheme = {
    get: pref,
    dark: function () { return document.documentElement.getAttribute('data-theme') === 'dark'; },
    set: set,
  };
})();
