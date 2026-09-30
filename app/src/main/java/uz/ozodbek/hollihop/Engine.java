package uz.ozodbek.hollihop;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Drives the hidden real-browser session: automatic login, session keeping,
 * same-origin fetch() with the page's cookies/CSRF token, and page automation.
 */
class Engine {

    interface Listener { void emit(String event, String json); }
    interface Callback { void done(String json); }

    private static final String DEFAULT_BASE = "https://sensorika.t8s.ru";
    private static final long REQUEST_TIMEOUT_MS = 45_000;
    private static final long TASK_TIMEOUT_MS = 60_000;
    private static final long STALE_SESSION_MS = 15 * 60_000;
    private static final int MAX_NET_LOG = 400;

    private final Context ctx;
    private final WebView web;
    private final Store store;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());

    private final String jsProbe, jsLogin, jsFetch, jsRecorder, jsTask;

    private String state = "idle";      // idle | loading | login | loggedIn | loginFailed | needsLogin | loggedOut
    private String lastError = "";
    private String currentUrl = "";
    private boolean pageReady = false;
    private int loginAttempts = 0;
    private boolean followedLoginLink = false;
    private long lastPageLoad = 0;

    private final List<Object[]> queue = new ArrayList<>();            // {id, spec, cb}
    private final Map<String, Callback> inflight = new HashMap<>();
    private final ArrayDeque<PageTask> tasks = new ArrayDeque<>();
    private PageTask task;
    private final ArrayDeque<String> netLog = new ArrayDeque<>();

    private static class PageTask {
        String id, url, script;
        int waitMs, navTries;
        Callback cb;
        boolean running, renav;
    }

    Engine(Context ctx, WebView web, Store store, Listener listener) {
        this.ctx = ctx;
        this.web = web;
        this.store = store;
        this.listener = listener;
        jsProbe = asset("engine/probe.js");
        jsLogin = asset("engine/login.js");
        jsFetch = asset("engine/fetch.js");
        jsRecorder = asset("engine/recorder.js");
        jsTask = asset("engine/task.js");
    }

    /** Removes the WebView markers so the site sees a regular Chrome browser. */
    static String userAgent(String def, boolean desktop) {
        String ua = def == null ? "" : def;
        ua = ua.replace("; wv)", ")").replaceAll("Version/\\d+\\.\\d+ ", "");
        if (desktop) {
            String chrome = "Chrome/130.0.0.0";
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("Chrome/[\\d.]+").matcher(ua);
            if (m.find()) chrome = m.group();
            ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " + chrome + " Safari/537.36";
        }
        return ua;
    }

    Bridge bridge() { return new Bridge(); }

    String base() {
        String b = store.getString("baseUrl", DEFAULT_BASE).trim();
        while (b.endsWith("/")) b = b.substring(0, b.length() - 1);
        return b.isEmpty() ? DEFAULT_BASE : b;
    }

    String absolute(String url) {
        if (url == null || url.isEmpty()) return base() + "/";
        if (url.startsWith("http://") || url.startsWith("https://")) return url;
        return base() + (url.startsWith("/") ? "" : "/") + url;
    }

    private boolean sameOrigin(String url) {
        try {
            Uri a = Uri.parse(url), b = Uri.parse(base());
            return a.getHost() != null && a.getHost().equalsIgnoreCase(b.getHost());
        } catch (Exception e) { return false; }
    }

    // ------------------------------------------------------------------ lifecycle

    void start() {
        if (store.hasCredentials()) {
            setState("loading", "");
            load(base() + "/");
        } else {
            setState("needsLogin", "");
        }
    }

    void onResume() {
        if (store.hasCredentials() && lastPageLoad > 0
                && SystemClock.elapsedRealtime() - lastPageLoad > STALE_SESSION_MS && task == null) {
            load(base() + "/");
        }
    }

    void login(String baseUrl, String user, String pass, boolean remember) {
        if (baseUrl != null && !baseUrl.trim().isEmpty()) {
            String b = baseUrl.trim();
            if (!b.startsWith("http")) b = "https://" + b;
            store.putString("baseUrl", b);
        }
        store.saveCredentials(user, pass, remember);
        loginAttempts = 0;
        followedLoginLink = false;
        setState("login", "");
        load(base() + "/");
    }

    void ensureSession() {
        if (!store.hasCredentials()) { setState("needsLogin", ""); return; }
        loginAttempts = 0;
        followedLoginLink = false;
        if (!"login".equals(state)) setState("loading", "");
        load(base() + "/");
    }

    void logout() {
        store.clearCredentials();
        CookieManager.getInstance().removeAllCookies(null);
        CookieManager.getInstance().flush();
        web.clearCache(true);
        failAll("Tizimdan chiqildi");
        web.loadUrl("about:blank");
        pageReady = false;
        setState("loggedOut", "");
    }

    private void load(String url) {
        pageReady = false;
        lastPageLoad = SystemClock.elapsedRealtime();
        web.loadUrl(url);
    }

    void onPageStarted(String url) {
        pageReady = false;
        currentUrl = url;
    }

    void onPageFinished(String url) {
        currentUrl = url;
        if (url == null || url.startsWith("about:")) return;
        web.evaluateJavascript(jsRecorder, null);
        web.evaluateJavascript(jsProbe, null);
    }

    // ------------------------------------------------------------------ page analysis

    private void onPageInfo(JSONObject info) {
        String url = info.optString("url");
        currentUrl = url;
        boolean onSite = sameOrigin(url);
        boolean hasPassword = info.optBoolean("hasPassword");
        boolean hasLogout = info.optBoolean("hasLogout");
        String loginLink = info.optString("loginLink", "");
        String err = info.optString("error", "");

        if (!onSite) { pageReady = false; return; }

        if (hasPassword) {
            pageReady = false;
            if (task != null && !task.running) task.renav = true;
            Store.Credentials c = store.credentials();
            if (c != null && loginAttempts < 2) {
                loginAttempts++;
                setState("login", "");
                String call = jsLogin + "\n;HHLogin(" + JSONObject.quote(c.user) + "," + JSONObject.quote(c.pass) + ");";
                web.evaluateJavascript(call, null);
                // single-page login forms may not navigate — look again later
                main.postDelayed(() -> web.evaluateJavascript(jsProbe, null), 5000);
            } else {
                setState(c == null ? "needsLogin" : "loginFailed",
                        err.isEmpty() ? "Login yoki parol noto'g'ri bo'lishi mumkin" : err);
                failAll("Saytga kirib bo'lmadi: " + lastError);
            }
            return;
        }

        if (!hasLogout && !loginLink.isEmpty() && !followedLoginLink && !"loggedIn".equals(state)) {
            followedLoginLink = true;
            load(loginLink);
            return;
        }

        pageReady = true;
        loginAttempts = 0;
        if (!"loggedIn".equals(state)) {
            CookieManager.getInstance().flush();
            setState("loggedIn", "");
        }

        if (task != null && !task.running) {
            if (task.renav && task.navTries < 3) {
                task.renav = false;
                task.navTries++;
                load(absolute(task.url));
                return;
            }
            task.running = true;
            final PageTask t = task;
            main.postDelayed(() -> runTaskScript(t), Math.max(0, t.waitMs));
            return;
        }
        flushQueue();
    }

    // ------------------------------------------------------------------ requests

    void request(String id, String specJson, Callback cb) {
        queue.add(new Object[]{id, specJson, cb});
        main.postDelayed(() -> timeoutQueued(id), REQUEST_TIMEOUT_MS * 2);
        if (canRun()) flushQueue();
        else if (!"login".equals(state) && !"loading".equals(state) && task == null) {
            if ("needsLogin".equals(state) || "loggedOut".equals(state)) failAll("Avval tizimga kiring");
            else ensureSession();
        }
    }

    private boolean canRun() {
        return pageReady && "loggedIn".equals(state) && task == null;
    }

    private void flushQueue() {
        if (!canRun()) return;
        List<Object[]> copy = new ArrayList<>(queue);
        queue.clear();
        for (Object[] q : copy) exec((String) q[0], (String) q[1], (Callback) q[2]);
    }

    private void exec(String id, String specJson, Callback cb) {
        try {
            JSONObject spec = new JSONObject(specJson);
            spec.put("id", id);
            spec.put("url", absolute(spec.optString("url")));
            inflight.put(id, cb);
            web.evaluateJavascript(jsFetch + "\n;HHFetch(" + spec + ");", null);
            main.postDelayed(() -> {
                Callback c = inflight.remove(id);
                if (c != null) c.done(error("So'rov vaqti tugadi"));
            }, REQUEST_TIMEOUT_MS);
        } catch (Exception e) {
            cb.done(error("Noto'g'ri so'rov: " + e.getMessage()));
        }
    }

    private void timeoutQueued(String id) {
        Iterator<Object[]> it = queue.iterator();
        while (it.hasNext()) {
            Object[] q = it.next();
            if (id.equals(q[0])) {
                it.remove();
                ((Callback) q[2]).done(error("Sayt javob bermadi (sessiya tayyor emas)"));
            }
        }
    }

    private void failAll(String msg) {
        List<Object[]> copy = new ArrayList<>(queue);
        queue.clear();
        for (Object[] q : copy) ((Callback) q[2]).done(error(msg));
        if (task != null) {
            PageTask t = task;
            task = null;
            t.cb.done(error(msg));
        }
        while (!tasks.isEmpty()) tasks.poll().cb.done(error(msg));
    }

    // ------------------------------------------------------------------ page tasks

    void runInPage(String id, String url, String script, int waitMs, Callback cb) {
        PageTask t = new PageTask();
        t.id = id; t.url = url; t.script = script; t.waitMs = waitMs; t.cb = cb;
        tasks.add(t);
        nextTask();
    }

    private void nextTask() {
        if (task != null || tasks.isEmpty()) return;
        if (!"loggedIn".equals(state) && !"loading".equals(state) && !"login".equals(state)) {
            if (store.hasCredentials()) ensureSession();
            else { failAll("Avval tizimga kiring"); return; }
        }
        task = tasks.poll();
        final PageTask t = task;
        main.postDelayed(() -> {
            if (task == t) finishTask(error("Sahifa vaqti tugadi: " + t.url));
        }, TASK_TIMEOUT_MS);
        load(absolute(t.url));
    }

    private void runTaskScript(PageTask t) {
        if (task != t) return;
        String call = jsTask + "\n;HHTask(" + JSONObject.quote(t.id) + ",function(){\n" + t.script + "\n});";
        web.evaluateJavascript(call, null);
    }

    private void finishTask(String json) {
        PageTask t = task;
        task = null;
        if (t != null) t.cb.done(json);
        if (!tasks.isEmpty()) nextTask();
        else flushQueue();
    }

    // ------------------------------------------------------------------ state

    private void setState(String s, String err) {
        state = s;
        lastError = err == null ? "" : err;
        listener.emit("state", stateJson());
    }

    String stateJson() {
        try {
            JSONObject o = new JSONObject();
            o.put("state", state);
            o.put("error", lastError);
            o.put("baseUrl", base());
            o.put("url", currentUrl);
            Store.Credentials c = store.credentials();
            o.put("user", c == null ? store.getString("lastUser", "") : c.user);
            o.put("hasCredentials", c != null);
            o.put("desktopMode", store.getBool("desktopMode", false));
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    String netLogJson() {
        JSONArray a = new JSONArray();
        for (String s : netLog) {
            try { a.put(new JSONObject(s)); } catch (Exception ignored) { }
        }
        return a.toString();
    }

    void clearNetLog() { netLog.clear(); }

    private static String error(String msg) {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", false);
            o.put("status", 0);
            o.put("error", msg);
            return o.toString();
        } catch (Exception e) { return "{\"ok\":false}"; }
    }

    private String asset(String path) {
        try (InputStream in = ctx.getAssets().open(path);
             BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line).append('\n');
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    /** Exposed to the site page as window.HHEngine. */
    class Bridge {
        @JavascriptInterface
        public void onPageInfo(String json) {
            main.post(() -> {
                try { Engine.this.onPageInfo(new JSONObject(json)); } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void onResult(String id, String json) {
            main.post(() -> {
                Callback c = inflight.remove(id);
                if (c != null) c.done(json);
            });
        }

        @JavascriptInterface
        public void onTask(String id, String json) {
            main.post(() -> {
                if (task != null && task.id.equals(id)) finishTask(json);
            });
        }

        @JavascriptInterface
        public void onNet(String json) {
            main.post(() -> {
                netLog.addLast(json);
                while (netLog.size() > MAX_NET_LOG) netLog.removeFirst();
            });
        }
    }
}
