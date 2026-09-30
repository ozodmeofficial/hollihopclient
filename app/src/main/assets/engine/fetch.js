// Same-origin request from inside the logged-in page: the browser adds the
// session cookies itself, and the page's anti-forgery (CSRF) token is attached.
window.HHFetch = function (spec) {
  var id = spec.id;
  var done = function (o) { HHEngine.onResult(id, JSON.stringify(o)); };
  try {
    var token = (function () {
      var m = document.querySelector('meta[name="csrf-token"],meta[name="_csrf"],meta[name="__RequestVerificationToken"],meta[name="X-CSRF-TOKEN"],meta[name="csrf_token"]');
      if (m && m.content) return m.content;
      var i = document.querySelector('input[name="__RequestVerificationToken"],input[name="_csrf"],input[name="csrf_token"],input[name="csrfmiddlewaretoken"],input[name="_token"]');
      if (i && i.value) return i.value;
      var c = document.cookie.match(/(?:^|; )(XSRF-TOKEN|csrftoken|_csrf|csrf_token)=([^;]+)/);
      return c ? decodeURIComponent(c[2]) : null;
    })();
    var method = (spec.method || 'GET').toUpperCase();
    var h = spec.headers || {};
    if (!('X-Requested-With' in h)) h['X-Requested-With'] = 'XMLHttpRequest';
    if (token && spec.csrf !== false) {
      h['RequestVerificationToken'] = h['RequestVerificationToken'] || token;
      h['X-CSRF-Token'] = h['X-CSRF-Token'] || token;
      h['X-XSRF-TOKEN'] = h['X-XSRF-TOKEN'] || token;
    }
    var body = spec.body;
    if (spec.form) {
      var p = new URLSearchParams();
      Object.keys(spec.form).forEach(function (k) {
        var v = spec.form[k];
        (Array.isArray(v) ? v : [v]).forEach(function (x) { if (x !== null && x !== undefined) p.append(k, String(x)); });
      });
      if (token && method !== 'GET' && !p.has('__RequestVerificationToken') && spec.csrf !== false) p.append('__RequestVerificationToken', token);
      body = p.toString();
      h['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    }
    var f = window.__hhOrigFetch || window.fetch;
    f.call(window, spec.url, {
      method: method, headers: h, credentials: 'include', redirect: 'follow',
      body: (method === 'GET' || method === 'HEAD') ? undefined : body
    }).then(function (r) {
      return r.text().then(function (t) {
        done({ ok: true, status: r.status, url: r.url, redirected: r.redirected, contentType: r.headers.get('content-type') || '', body: t });
      });
    }).catch(function (e) { done({ ok: false, status: 0, error: String(e) }); });
  } catch (e) { done({ ok: false, status: 0, error: String(e) }); }
};
