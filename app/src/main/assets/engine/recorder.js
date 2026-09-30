// Records the requests the site itself makes (XHR/fetch/forms) so the app can
// show them in "Tarmoq jurnali" and learn how the site saves data.
(function () {
  if (window.__hhRecorder) return;
  window.__hhRecorder = true;
  var cut = function (s, n) { s = s == null ? '' : String(s); return s.length > n ? s.slice(0, n) + '…' : s; };
  var bodyStr = function (b) {
    try {
      if (b == null) return '';
      if (typeof b === 'string') return b;
      if (b instanceof URLSearchParams) return b.toString();
      if (b instanceof FormData) { var a = []; b.forEach(function (v, k) { a.push(k + '=' + (typeof v === 'string' ? v : '[file]')); }); return a.join('&'); }
      return '[' + (b.constructor && b.constructor.name) + ']';
    } catch (e) { return ''; }
  };
  var log = function (o) {
    try {
      if (/password|parol|pass=/i.test(o.body || '')) o.body = '[maxfiy]';
      o.t = Date.now(); o.page = location.pathname;
      HHEngine.onNet(JSON.stringify(o));
    } catch (e) { }
  };
  var X = XMLHttpRequest.prototype, open = X.open, send = X.send;
  X.open = function (m, u) { this.__hh = { type: 'xhr', method: m, url: String(u) }; return open.apply(this, arguments); };
  X.send = function (b) {
    var x = this, info = x.__hh || {};
    info.body = cut(bodyStr(b), 4000);
    x.addEventListener('loadend', function () {
      info.status = x.status;
      try { info.response = cut(x.responseType === '' || x.responseType === 'text' ? x.responseText : '[' + x.responseType + ']', 3000); } catch (e) { }
      log(info);
    });
    return send.apply(this, arguments);
  };
  if (window.fetch) {
    var of = window.fetch;
    window.__hhOrigFetch = of;
    window.fetch = function (input, init) {
      var info = { type: 'fetch', method: (init && init.method) || (input && input.method) || 'GET', url: String((input && input.url) || input), body: cut(bodyStr(init && init.body), 4000) };
      return of.apply(this, arguments).then(function (r) {
        info.status = r.status;
        r.clone().text().then(function (t) { info.response = cut(t, 3000); log(info); }, function () { log(info); });
        return r;
      });
    };
  }
  document.addEventListener('submit', function (e) {
    var f = e.target;
    try { log({ type: 'form', method: (f.method || 'GET').toUpperCase(), url: f.action, body: cut(bodyStr(new FormData(f)), 4000) }); } catch (x) { }
  }, true);
})();
