package uz.ozodbek.hollihop;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * Two WebViews:
 *  - ui:     the app interface (local HTML in assets/app)
 *  - engine: a real Chromium browser session on the HolliHop site. It keeps
 *            cookies, CSRF tokens and everything else exactly like a desktop
 *            browser, and every request of the app is executed inside it.
 */
public class MainActivity extends Activity {

    private static final String UI_URL = "file:///android_asset/app/index.html";
    private static final int FILE_CHOOSER_REQUEST = 42;

    private final Handler main = new Handler(Looper.getMainLooper());

    private WebView ui;
    private WebView engine;
    private LinearLayout browserPane;
    private TextView browserUrl;
    private ProgressBar browserProgress;
    private boolean browserVisible = false;

    private Store store;
    private Engine engineCtl;
    private ValueCallback<Uri[]> fileCallback;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new Store(this);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);

        // ---- engine (real site) + its toolbar ----
        browserPane = new LinearLayout(this);
        browserPane.setOrientation(LinearLayout.VERTICAL);
        browserPane.addView(buildBrowserBar(), new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(52)));
        browserProgress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        browserProgress.setMax(100);
        browserPane.addView(browserProgress, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        engine = new WebView(this);
        browserPane.addView(engine, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(browserPane, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // ---- ui on top ----
        ui = new WebView(this);
        root.addView(ui, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(engine, true);

        setupEngine();
        setupUi();

        engineCtl = new Engine(this, engine, store, new Engine.Listener() {
            @Override public void emit(String event, String json) { emitToUi(event, json); }
        });
        engine.addJavascriptInterface(engineCtl.bridge(), "HHEngine");
        engineCtl.start();

        ui.loadUrl(UI_URL);
    }

    private View buildBrowserBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(Color.parseColor("#1F4FD8"));
        bar.setPadding(dp(6), 0, dp(6), 0);

        TextView back = barButton("← Ilova");
        back.setOnClickListener(v -> hideBrowser());
        bar.addView(back);

        browserUrl = new TextView(this);
        browserUrl.setTextColor(Color.WHITE);
        browserUrl.setSingleLine(true);
        browserUrl.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        browserUrl.setPadding(dp(8), 0, dp(8), 0);
        bar.addView(browserUrl, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView prev = barButton("◀");
        prev.setOnClickListener(v -> { if (engine.canGoBack()) engine.goBack(); });
        bar.addView(prev);

        TextView reload = barButton("↻");
        reload.setOnClickListener(v -> engine.reload());
        bar.addView(reload);
        return bar;
    }

    private TextView barButton(String text) {
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextColor(Color.WHITE);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        b.setPadding(dp(10), dp(8), dp(10), dp(8));
        return b;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupEngine() {
        WebSettings s = engine.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUserAgentString(Engine.userAgent(s.getUserAgentString(), store.getBool("desktopMode", false)));

        engine.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int p) {
                browserProgress.setProgress(p);
                browserProgress.setVisibility(p >= 100 ? View.INVISIBLE : View.VISIBLE);
            }

            @Override public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }

            @Override public boolean onConsoleMessage(ConsoleMessage m) { return true; }
        });

        engine.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleExternal(req.getUrl());
            }

            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                browserUrl.setText(url);
                engineCtl.onPageStarted(url);
            }

            @Override public void onPageFinished(WebView view, String url) {
                browserUrl.setText(url);
                engineCtl.onPageFinished(url);
                CookieManager.getInstance().flush();
            }
        });
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void setupUi() {
        WebSettings s = ui.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        ui.setWebChromeClient(new WebChromeClient());
        ui.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if ("file".equals(u.getScheme())) return false;
                return handleExternal(u) || openExternal(u);
            }
        });
        ui.addJavascriptInterface(new UiBridge(), "Android");
    }

    /** tel:, sms:, mailto:, tg:, whatsapp: … go to the system. */
    private boolean handleExternal(Uri u) {
        String scheme = u.getScheme() == null ? "" : u.getScheme();
        if (scheme.equals("http") || scheme.equals("https") || scheme.equals("about")
                || scheme.equals("javascript") || scheme.equals("data") || scheme.equals("blob")) {
            return false;
        }
        return openExternal(u);
    }

    private boolean openExternal(Uri u) {
        try {
            Intent i = "tel".equals(u.getScheme()) ? new Intent(Intent.ACTION_DIAL, u) : new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            toast("Ochib bo'lmadi: " + u);
        }
        return true;
    }

    void emitToUi(String event, String json) {
        main.post(() -> ui.evaluateJavascript(
                "window.HH&&HH._event(" + JSONObject.quote(event) + "," + (json == null ? "null" : json) + ")", null));
    }

    void resolveToUi(String id, String json) {
        main.post(() -> ui.evaluateJavascript(
                "window.HH&&HH._resolve(" + JSONObject.quote(id) + "," + json + ")", null));
    }

    private void showBrowser(String url) {
        browserVisible = true;
        ui.setVisibility(View.GONE);
        if (url != null && !url.isEmpty()) engine.loadUrl(engineCtl.absolute(url));
    }

    private void hideBrowser() {
        browserVisible = false;
        ui.setVisibility(View.VISIBLE);
        emitToUi("browserClosed", "{}");
    }

    private void toast(String msg) {
        main.post(() -> Toast.makeText(this, msg, Toast.LENGTH_SHORT).show());
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    @Override public void onBackPressed() {
        if (browserVisible) {
            if (engine.canGoBack()) engine.goBack();
            else hideBrowser();
            return;
        }
        ui.evaluateJavascript("window.HH?HH._back():false", value -> {
            if (!"true".equals(value)) moveTaskToBack(true);
        });
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override protected void onResume() {
        super.onResume();
        engine.onResume();
        ui.onResume();
        if (engineCtl != null) engineCtl.onResume();
    }

    @Override protected void onPause() {
        CookieManager.getInstance().flush();
        engine.onPause();
        ui.onPause();
        super.onPause();
    }

    /** Interface exposed to the app UI as window.Android. All calls are async-safe. */
    private class UiBridge {
        @android.webkit.JavascriptInterface
        public void request(String id, String specJson) {
            main.post(() -> engineCtl.request(id, specJson, json -> resolveToUi(id, json)));
        }

        @android.webkit.JavascriptInterface
        public void runInPage(String id, String url, String script, int waitMs) {
            main.post(() -> engineCtl.runInPage(id, url, script, waitMs, json -> resolveToUi(id, json)));
        }

        @android.webkit.JavascriptInterface
        public void login(String baseUrl, String user, String pass, boolean remember) {
            main.post(() -> engineCtl.login(baseUrl, user, pass, remember));
        }

        @android.webkit.JavascriptInterface
        public void ensureSession() {
            main.post(() -> engineCtl.ensureSession());
        }

        @android.webkit.JavascriptInterface
        public void logout() {
            main.post(() -> engineCtl.logout());
        }

        @android.webkit.JavascriptInterface
        public String state() {
            return engineCtl.stateJson();
        }

        @android.webkit.JavascriptInterface
        public void showBrowser(String url) {
            main.post(() -> MainActivity.this.showBrowser(url));
        }

        @android.webkit.JavascriptInterface
        public void setDesktopMode(boolean on) {
            store.putBool("desktopMode", on);
            main.post(() -> {
                WebSettings s = engine.getSettings();
                s.setUserAgentString(Engine.userAgent(WebSettings.getDefaultUserAgent(MainActivity.this), on));
                engine.reload();
            });
        }

        @android.webkit.JavascriptInterface
        public void dial(String phone) {
            main.post(() -> openExternal(Uri.parse("tel:" + Uri.encode(phone.replaceAll("[^0-9+]", "")))));
        }

        @android.webkit.JavascriptInterface
        public void sms(String phone, String text) {
            main.post(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + phone.replaceAll("[^0-9+]", "")));
                    i.putExtra("sms_body", text);
                    startActivity(i);
                } catch (Exception e) { toast("SMS ilovasi topilmadi"); }
            });
        }

        @android.webkit.JavascriptInterface
        public void openUrl(String url) {
            main.post(() -> openExternal(Uri.parse(url)));
        }

        @android.webkit.JavascriptInterface
        public void share(String text) {
            main.post(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, "Ulashish"));
            });
        }

        @android.webkit.JavascriptInterface
        public String kvGet(String key) {
            return store.readFile(key);
        }

        @android.webkit.JavascriptInterface
        public void kvSet(String key, String value) {
            store.writeFile(key, value);
        }

        @android.webkit.JavascriptInterface
        public String netLog() {
            return engineCtl.netLogJson();
        }

        @android.webkit.JavascriptInterface
        public void clearNetLog() {
            engineCtl.clearNetLog();
        }

        @android.webkit.JavascriptInterface
        public void toast(String msg) {
            MainActivity.this.toast(msg);
        }

        @android.webkit.JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) { return "?"; }
        }
    }
}
