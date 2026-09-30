// Runs an automation script inside the currently open site page.
window.HHTask = function (id, fn) {
  var send = function (o) { HHEngine.onTask(id, JSON.stringify(o)); };
  try {
    Promise.resolve(fn()).then(function (d) { send({ ok: true, url: location.href, data: d === undefined ? null : d }); },
      function (e) { send({ ok: false, url: location.href, error: String(e && e.message || e) }); });
  } catch (e) { send({ ok: false, url: location.href, error: String(e && e.message || e) }); }
};
