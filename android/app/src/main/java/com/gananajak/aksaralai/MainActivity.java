package com.gananajak.aksaralai;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.content.ContentValues;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.util.Base64;
import java.io.OutputStream;

public class MainActivity extends Activity {
    // Same Cloudflare-hosted app, users, permissions and R2 backend as the website.
    private static final String HOME = "https://aksaralai-platform.gananajak.workers.dev/";
    private static final String HOST = "aksaralai-platform.gananajak.workers.dev";
    private static final int SELECT_MP3 = 1050;
    private static final int MAX_BLOB_BYTES = 15 * 1024 * 1024;
    private WebView webView;
    private ValueCallback<Uri[]> uploadCallback;

    private boolean trusted(String url) {
        if (url == null) return false;
        try {
            Uri u = Uri.parse(url);
            return "https".equalsIgnoreCase(u.getScheme()) && HOST.equalsIgnoreCase(u.getHost());
        } catch (Exception ignored) { return false; }
    }

    private void message(String text) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, text, Toast.LENGTH_LONG).show());
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView,false);

        webView.addJavascriptInterface(new Mp3Saver(), "AksaralaiNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (trusted(url)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
                catch (Exception ignored) { message("ไม่สามารถเปิดลิงก์นี้ได้"); }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!trusted(url)) return;
                // The OpenAI studio returns a blob: MP3. Hand it to Android Downloads.
                // Only the trusted top-level app document receives this click listener.
                String hook = "(function(){if(window.__aksaralaiApkSave)return;window.__aksaralaiApkSave=true;" +
                    "document.addEventListener('click',async function(e){" +
                    "var a=e.target.closest('a[data-tts-download]');if(!a||!a.href.startsWith('blob:'))return;" +
                    "e.preventDefault();try{var r=await fetch(a.href);var b=await r.blob();" +
                    "if(b.size>15728640){alert('ไฟล์ใหญ่เกินขนาดดาวน์โหลดผ่านแอป กรุณาเปิดเว็บใน Chrome');return;}" +
                    "var reader=new FileReader();reader.onload=function(){AksaralaiNative.saveMp3(reader.result,a.download||'aksaralai.mp3');};" +
                    "reader.readAsDataURL(b);}catch(err){alert('ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่');}" +
                    "},true);})();";
                view.evaluateJavascript(hook, null);
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (uploadCallback != null) uploadCallback.onReceiveValue(null);
                uploadCallback=callback;
                try {
                    Intent pick=new Intent(Intent.ACTION_GET_CONTENT);
                    pick.addCategory(Intent.CATEGORY_OPENABLE);
                    pick.setType("audio/mpeg");
                    pick.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"audio/mpeg","audio/mp3","audio/*"});
                    startActivityForResult(Intent.createChooser(pick,"เลือกไฟล์ MP3"),SELECT_MP3);
                } catch (ActivityNotFoundException ex) {
                    uploadCallback=null;
                    callback.onReceiveValue(null);
                    message("ไม่มีตัวเลือกไฟล์บนอุปกรณ์");
                }
                return true;
            }
        });
        webView.setDownloadListener((url,userAgent,disposition,mimeType,length)->{
            if (!trusted(url)) {
                message("ลิงก์ไฟล์นี้ต้องเปิดผ่านเว็บไซต์ที่เชื่อถือได้");
                return;
            }
            try {
                DownloadManager.Request req=new DownloadManager.Request(Uri.parse(url));
                String filename=URLUtil.guessFileName(url,disposition,mimeType);
                req.setTitle(filename);
                req.setMimeType(mimeType);
                req.addRequestHeader("Cookie",CookieManager.getInstance().getCookie(url));
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,filename);
                ((DownloadManager)getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(req);
                message("กำลังดาวน์โหลดไฟล์...");
            } catch (Exception e) { message("เริ่มดาวน์โหลดไม่ได้"); }
        });
        webView.loadUrl(HOME);
    }

    private final class Mp3Saver {
        @JavascriptInterface public void saveMp3(String dataUrl, String requestedName) {
            if (!trusted(webView.getUrl())) { message("ไม่อนุญาตให้บันทึกจากเว็บไซต์อื่น"); return; }
            if (dataUrl == null || !dataUrl.startsWith("data:audio/") || !dataUrl.contains(";base64,")) {
                message("ข้อมูลเสียงไม่ถูกต้อง");return;
            }
            int marker=dataUrl.indexOf(";base64,");
            String encoded=dataUrl.substring(marker+8);
            if (encoded.length()>MAX_BLOB_BYTES*4L/3L+32) { message("ไฟล์เสียงใหญ่เกินกำหนด");return; }
            String filename = requestedName != null && requestedName.matches("[a-zA-Z0-9._-]{1,100}\\.mp3")
                ? requestedName : "aksaralai-"+System.currentTimeMillis()+".mp3";
            try {
                byte[] data=Base64.decode(encoded,Base64.DEFAULT);
                if (data.length<128 || data.length>MAX_BLOB_BYTES) throw new IllegalArgumentException("invalid MP3");
                if (Build.VERSION.SDK_INT>=29) {
                    ContentValues values=new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME,filename);
                    values.put(MediaStore.Downloads.MIME_TYPE,"audio/mpeg");
                    values.put(MediaStore.Downloads.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/Aksaralai");
                    Uri dest=getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
                    if(dest==null)throw new IllegalStateException("cannot create output");
                    try(OutputStream out=getContentResolver().openOutputStream(dest)) {
                        if(out==null)throw new IllegalStateException("cannot open output");
                        out.write(data);
                    }
                }else{
                    java.io.File dir=getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if(dir==null)throw new IllegalStateException("cannot open downloads");
                    try(java.io.FileOutputStream out=new java.io.FileOutputStream(new java.io.File(dir,filename))){out.write(data);}
                }
                message("บันทึก MP3 สำเร็จ: "+filename);
            }catch(Exception e){message("บันทึก MP3 ไม่สำเร็จ");}
        }
    }

    @Override protected void onActivityResult(int code,int result,Intent data) {
        super.onActivityResult(code,result,data);
        if(code!=SELECT_MP3||uploadCallback==null)return;
        Uri[] files=null;
        if(result==RESULT_OK && data!=null) {
            if(data.getData()!=null)files=new Uri[]{data.getData()};
            else if(data.getClipData()!=null){
                ClipData clips=data.getClipData();
                files=new Uri[clips.getItemCount()];
                for(int i=0;i<files.length;i++)files[i]=clips.getItemAt(i).getUri();
            }
        }
        uploadCallback.onReceiveValue(files);
        uploadCallback=null;
    }

    @Override public void onBackPressed() {
        if(webView!=null&&webView.canGoBack())webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if(uploadCallback!=null){uploadCallback.onReceiveValue(null);uploadCallback=null;}
        if(webView!=null)webView.destroy();
        super.onDestroy();
    }
}
