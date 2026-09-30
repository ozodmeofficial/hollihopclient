package uz.ozodbek.hollihop;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Preferences, app data files and the login (password encrypted with Android Keystore). */
class Store {

    static class Credentials {
        final String user, pass;
        Credentials(String user, String pass) { this.user = user; this.pass = pass; }
    }

    private static final String KEY_ALIAS = "hollihop_login";
    private final Context ctx;
    private final SharedPreferences prefs;
    private Credentials sessionOnly;   // when "remember me" is off

    Store(Context ctx) {
        this.ctx = ctx;
        this.prefs = ctx.getSharedPreferences("hollihop", Context.MODE_PRIVATE);
    }

    String getString(String k, String d) { return prefs.getString(k, d); }
    void putString(String k, String v) { prefs.edit().putString(k, v).apply(); }
    boolean getBool(String k, boolean d) { return prefs.getBoolean(k, d); }
    void putBool(String k, boolean v) { prefs.edit().putBoolean(k, v).apply(); }

    // ------------------------------------------------------------------ credentials

    void saveCredentials(String user, String pass, boolean remember) {
        putString("lastUser", user);
        sessionOnly = new Credentials(user, pass);
        if (!remember) {
            prefs.edit().remove("user").remove("pass").apply();
            return;
        }
        try {
            prefs.edit().putString("user", user).putString("pass", encrypt(pass)).apply();
        } catch (Exception e) {
            prefs.edit().remove("user").remove("pass").apply();
        }
    }

    Credentials credentials() {
        if (sessionOnly != null) return sessionOnly;
        String u = prefs.getString("user", null), p = prefs.getString("pass", null);
        if (u == null || p == null) return null;
        try {
            sessionOnly = new Credentials(u, decrypt(p));
            return sessionOnly;
        } catch (Exception e) {
            return null;
        }
    }

    boolean hasCredentials() { return credentials() != null; }

    void clearCredentials() {
        sessionOnly = null;
        prefs.edit().remove("user").remove("pass").apply();
    }

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return g.generateKey();
    }

    private String encrypt(String plain) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = c.getIV();
        byte[] enc = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(enc, Base64.NO_WRAP);
    }

    private String decrypt(String s) throws Exception {
        String[] parts = s.split(":", 2);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(c.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    // ------------------------------------------------------------------ data files

    private File file(String key) {
        File dir = new File(ctx.getFilesDir(), "data");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return new File(dir, key.replaceAll("[^A-Za-z0-9_.-]", "_") + ".json");
    }

    String readFile(String key) {
        File f = file(key);
        if (!f.exists()) return null;
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] b = new byte[(int) f.length()];
            int off = 0, n;
            while (off < b.length && (n = in.read(b, off, b.length - off)) > 0) off += n;
            return new String(b, 0, off, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    void writeFile(String key, String value) {
        File f = file(key);
        if (value == null) { //noinspection ResultOfMethodCallIgnored
            f.delete();
            return;
        }
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return;
        }
        //noinspection ResultOfMethodCallIgnored
        tmp.renameTo(f);
    }
}
