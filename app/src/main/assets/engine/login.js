// Fills the site's own login form like a person would and submits it.
window.HHLogin = function (user, pass) {
  var vis = function (e) { return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); };
  var setVal = function (el, v) {
    el.focus();
    var d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    if (d && d.set) d.set.call(el, v); else el.value = v;
    ['input', 'change', 'keyup', 'blur'].forEach(function (t) { el.dispatchEvent(new Event(t, { bubbles: true })); });
  };
  var pws = Array.prototype.filter.call(document.querySelectorAll('input[type=password]'), vis);
  var pw = pws[0] || document.querySelector('input[type=password]');
  if (!pw) return 'nopw';
  var scope = pw.form || pw.closest('form,.modal,.login,.auth,[class*=login],[class*=auth]') || document;
  var inputs = Array.prototype.filter.call(scope.querySelectorAll('input'), function (i) {
    var t = (i.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'email', 'tel', 'login'].indexOf(t) >= 0 && vis(i);
  });
  var userInput = inputs.filter(function (i) {
    return /login|user|email|name|логин|почт/i.test((i.name || '') + ' ' + (i.id || '') + ' ' + (i.placeholder || ''));
  })[0] || inputs[0];
  if (userInput) setVal(userInput, user);
  setVal(pw, pass);
  var remember = Array.prototype.filter.call(scope.querySelectorAll('input[type=checkbox]'), function (c) {
    return /remember|запомн|RememberMe|persist/i.test((c.name || '') + ' ' + (c.id || '') + ' ' + ((c.parentElement && c.parentElement.textContent) || ''));
  })[0];
  if (remember && !remember.checked) remember.click();
  setTimeout(function () {
    var btn = scope.querySelector('button[type=submit],input[type=submit]') ||
      Array.prototype.filter.call(scope.querySelectorAll('button,a,input[type=button],[role=button]'), function (b) {
        return /войти|вход|login|log in|sign in|kirish/i.test((b.textContent || '') + ' ' + (b.value || ''));
      })[0];
    if (btn) btn.click();
    else if (pw.form) { if (pw.form.requestSubmit) pw.form.requestSubmit(); else pw.form.submit(); }
    else pw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
  }, 400);
  return 'submitted';
};
