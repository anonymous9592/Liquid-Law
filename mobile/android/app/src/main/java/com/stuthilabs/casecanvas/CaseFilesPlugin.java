package com.stuthilabs.casecanvas;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * File access for the renderer (prototype/android.js builds window.desktop on top of this) through the Storage
 * Access Framework: no storage permission, the user picks the folder (Downloads, Drive, an SD card...).
 *
 * Bytes never travel on a call that opens a system dialog: Capacitor parcels that call into the activity's saved
 * state while the dialog is up, and anything beyond ~1 MB kills the app with TransactionTooLargeException.
 *  - a picked / handed-in document is copied into the app cache and returned as a path; the renderer fetches it
 *    through Capacitor's local server (Capacitor.convertFileSrc) and then calls discard()
 *  - a save is: saveFile() (dialog only, gives the uri), beginWrite() (temp path), appendChunk(path, base64) x n,
 *    commit(path, uri) which streams the temp file into the document
 *
 *  openFiles({ mimes, multiple, persist })   : { files: [{ name, uri, path, size }] }
 *  discard({ path })                         : {}
 *  saveFile({ name, mime, persist })         : { uri, name } or {} when cancelled
 *  beginWrite()                              : { path }
 *  appendChunk({ path, data })               : {}
 *  commit({ path, uri })                     : { uri, name }
 *  getLaunchFile()                           : { file } or {}
 *  event "openFile" { name, uri, path, size }
 */
@CapacitorPlugin(name = "CaseFiles")
public class CaseFilesPlugin extends Plugin {

    private Intent launchIntent;
    private int seq = 0;

    @Override
    public void load() {
        launchIntent = getActivity().getIntent();
    }

    // ---- open -----------------------------------------------------------------------------------------------

    @PluginMethod
    public void openFiles(PluginCall call) {
        JSArray mimes = call.getArray("mimes");
        boolean multiple = Boolean.TRUE.equals(call.getBoolean("multiple", false));
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        if (mimes != null && mimes.length() > 0) {
            try {
                List<String> list = mimes.toList();
                intent.putExtra(Intent.EXTRA_MIME_TYPES, list.toArray(new String[0]));
                if (list.size() == 1) intent.setType(list.get(0));
            } catch (Exception ignored) {}
        }
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
        startActivityForResult(call, intent, "openResult");
    }

    @ActivityCallback
    private void openResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        JSArray files = new JSArray();
        Intent data = result.getData();
        if (result.getResultCode() == Activity.RESULT_OK && data != null) {
            boolean persist = Boolean.TRUE.equals(call.getBoolean("persist", false));
            List<Uri> uris = new ArrayList<>();
            ClipData clip = data.getClipData();
            if (clip != null) for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
            else if (data.getData() != null) uris.add(data.getData());
            for (Uri uri : uris) {
                if (persist) takePersistable(uri, data.getFlags());
                try { files.put(stage(uri)); }
                catch (Exception e) { call.reject("Could not read " + nameOf(uri) + ": " + e.getMessage()); return; }
            }
        }
        ret.put("files", files);
        call.resolve(ret);
    }

    @PluginMethod
    public void discard(PluginCall call) {
        String p = call.getString("path");
        if (p != null) {
            File f = new File(p);
            if (f.getParentFile() != null && f.getParentFile().equals(stageDir())) f.delete();
        }
        call.resolve();
    }

    // ---- save -----------------------------------------------------------------------------------------------

    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = call.getString("name", "file");
        String mime = call.getString("mime", "application/octet-stream");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "saveResult");
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) { call.resolve(new JSObject()); return; }
        Uri uri = data.getData();
        if (Boolean.TRUE.equals(call.getBoolean("persist", false))) takePersistable(uri, data.getFlags());
        call.resolve(fileRef(uri));
    }

    @PluginMethod
    public void beginWrite(PluginCall call) {
        try {
            File f = new File(stageDir(), "out-" + System.currentTimeMillis() + "-" + (seq++) + ".bin");
            if (f.exists()) f.delete();
            new FileOutputStream(f).close();
            JSObject o = new JSObject();
            o.put("path", f.getAbsolutePath());
            call.resolve(o);
        } catch (Exception e) { call.reject("beginWrite: " + e.getMessage()); }
    }

    @PluginMethod
    public void appendChunk(PluginCall call) {
        String p = call.getString("path");
        String data = call.getString("data");
        if (p == null || data == null) { call.reject("path and data are required"); return; }
        try (FileOutputStream out = new FileOutputStream(new File(p), true)) {
            out.write(Base64.decode(data, Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) { call.reject("appendChunk: " + e.getMessage()); }
    }

    @PluginMethod
    public void commit(PluginCall call) {
        String p = call.getString("path");
        String u = call.getString("uri");
        if (p == null || u == null) { call.reject("path and uri are required"); return; }
        File f = new File(p);
        try {
            Uri uri = Uri.parse(u);
            ContentResolver cr = getContext().getContentResolver();
            OutputStream out;
            try { out = cr.openOutputStream(uri, "wt"); }            // truncate: a shorter case must not leave old bytes behind
            catch (Exception e) { out = cr.openOutputStream(uri); }
            if (out == null) throw new Exception("no stream");
            try (InputStream in = new FileInputStream(f)) { copy(in, out); out.flush(); } finally { out.close(); }
            call.resolve(fileRef(uri));
        } catch (Exception e) {
            call.reject("Could not write: " + e.getMessage());
        } finally { f.delete(); }
    }

    // ---- a .lawcase handed to the app (VIEW intent) ----------------------------------------------------------

    @PluginMethod
    public void getLaunchFile(PluginCall call) {
        JSObject ret = new JSObject();
        Intent intent = launchIntent;
        launchIntent = null;                                   // delivered once
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            try { ret.put("file", stage(intent.getData())); } catch (Exception ignored) {}
        }
        call.resolve(ret);
    }

    /** MainActivity.onNewIntent: the renderer's onOpenFile callback */
    public void handleViewIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) return;
        try { notifyListeners("openFile", stage(intent.getData()), true); } catch (Exception ignored) {}
    }

    // ---- helpers ------------------------------------------------------------------------------------------

    private File stageDir() {
        File d = new File(getContext().getCacheDir(), "casefiles");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    /** copy the document into the cache; the renderer fetches it by path through Capacitor's local server */
    private JSObject stage(Uri uri) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        File f = new File(stageDir(), "in-" + System.currentTimeMillis() + "-" + (seq++) + ".bin");
        try (InputStream in = cr.openInputStream(uri); OutputStream out = new FileOutputStream(f)) {
            if (in == null) throw new Exception("no stream");
            copy(in, out);
        }
        JSObject o = fileRef(uri);
        o.put("path", f.getAbsolutePath());
        o.put("size", f.length());
        return o;
    }

    private static void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[1 << 16];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    private void takePersistable(Uri uri, int flags) {
        try {
            int f = flags & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (f != 0) getContext().getContentResolver().takePersistableUriPermission(uri, f);
        } catch (Exception ignored) {}
    }

    private JSObject fileRef(Uri uri) {
        JSObject o = new JSObject();
        o.put("uri", uri.toString());
        o.put("name", nameOf(uri));
        return o;
    }

    private String nameOf(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) { String n = c.getString(0); if (n != null && !n.isEmpty()) return n; }
        } catch (Exception ignored) {}
        String last = uri.getLastPathSegment();
        if (last == null) return "file";
        int i = last.lastIndexOf('/');
        return i >= 0 ? last.substring(i + 1) : last;
    }
}
