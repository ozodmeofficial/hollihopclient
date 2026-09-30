// Describes the current page to the app: is it a login form, are we logged in?
(function () {
  try {
    var vis = function (e) { return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); };
    var pw = Array.prototype.filter.call(document.querySelectorAll('input[type=password]'), vis);
    var nodes = Array.prototype.slice.call(document.querySelectorAll('a,button'));
    var hasLogout = nodes.some(function (a) {
      return /logout|logoff|signout|sign-out|выход|выйти|chiqish/i.test((a.getAttribute('href') || '') + ' ' + (a.textContent || ''));
    });
    var loginLink = nodes.filter(function (a) {
      return a.tagName === 'A' && a.href && /^\s*(войти|вход|login|log in|sign in|kirish)\s*$/i.test(a.textContent || '');
    })[0];
    var err = Array.prototype.map.call(
      document.querySelectorAll('.validation-summary-errors,.field-validation-error,.alert-danger,.alert-error,.text-danger,.error-message,.login-error'),
      function (e) { return (e.innerText || '').trim(); }).filter(Boolean).join(' | ').slice(0, 300);
    HHEngine.onPageInfo(JSON.stringify({
      url: location.href, title: document.title, hasPassword: pw.length > 0,
      hasLogout: hasLogout, loginLink: loginLink ? loginLink.href : '', error: err
    }));
  } catch (e) {
    HHEngine.onPageInfo(JSON.stringify({ url: location.href, error: String(e) }));
  }
})();
