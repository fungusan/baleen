(function () {
  var KEY = 'theme';
  var root = document.documentElement;
  var dark = window.matchMedia('(prefers-color-scheme: dark)');

  function stored() {
    try {
      var value = localStorage.getItem(KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function resolved() {
    return root.getAttribute('data-theme') || (dark.matches ? 'dark' : 'light');
  }

  function paint(theme) {
    if (theme) root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
  }

  paint(stored());

  function sync(theme) {
    var next = theme === 'dark' ? 'light' : 'dark';
    for (var button of document.querySelectorAll('[data-theme-toggle]')) {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      button.setAttribute('aria-label', 'Switch to ' + next + ' mode');
    }
  }

  function wire() {
    sync(resolved());
    for (var button of document.querySelectorAll('[data-theme-toggle]')) {
      button.addEventListener('click', function () {
        var theme = resolved() === 'dark' ? 'light' : 'dark';
        paint(theme);
        try {
          localStorage.setItem(KEY, theme);
        } catch (error) {}
        sync(theme);
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  dark.addEventListener('change', function () {
    if (!stored()) sync(resolved());
  });
})();
