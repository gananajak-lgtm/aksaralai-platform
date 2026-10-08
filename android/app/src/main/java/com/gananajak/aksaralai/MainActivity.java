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
import android.webkit.JsResult;
import android.app.AlertDialog;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.print.PrintManager;
import android.print.PrintAttributes;
import android.widget.LinearLayout;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.util.Base64;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;
import java.util.Set;
import java.util.ArrayList;
import java.util.List;
import java.io.OutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.RandomAccessFile;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import io.vacco.libmp3lame.Jlame;
import io.vacco.libmp3lame.Jlame_global_flags;

public class MainActivity extends Activity {
    // Same Cloudflare-hosted app, users, permissions and R2 backend as the website.
    private static final String HOME = "https://aksaralai-platform.gananajak.workers.dev/";
    private static final String HOST = "aksaralai-platform.gananajak.workers.dev";
    private static final int SELECT_MP3 = 1050;
    private static final int MAX_BLOB_BYTES = 15 * 1024 * 1024;
    private WebView webView;
    private ValueCallback<Uri[]> uploadCallback;
    private TextToSpeech nativeTts;
    // -1 initializing, 0 unavailable for Thai, 1 ready.
    private volatile int nativeTtsStatus = -1;
    // Only the UI thread updates this. JavaScript bridge methods run on a separate
    // WebView thread and must not call webView.getUrl().
    private volatile boolean trustedTopLevelPage = false;
    private final Locale thaiLocale = new Locale("th", "TH");
    // Native queue keeps advancing from Android callbacks even when WebView JS is throttled.
    // Batch state is written on the UI thread; volatile scalars expose progress to the bridge.
    private List<String> batchPieces = new ArrayList<>();
    private volatile int batchSession = 0;
    private volatile int batchCursor = 0;
    private volatile int batchBaseIndex = 0;
    private volatile int batchTotal = 0;
    private volatile String batchChapter = "";
    private String batchSignature = "";
    private boolean appForeground = true;
    private String batchVoice = "";
    private float batchSpeed = 1f;

    // On-device file synthesis state. Android TTS creates short WAV chunks;
    // we stream their PCM into one temporary raw file and encode it to MP3 locally.
    private List<String> filePieces = new ArrayList<>();
    private volatile int fileSession = 0;
    private volatile int fileCursor = 0;
    private volatile int fileTotal = 0;
    private volatile int fileChapterId = 0;
    private volatile int fileSampleRate = 0;
    private volatile int fileChannels = 0;
    private volatile boolean fileBusy = false;
    private float fileSpeed = 1f;
    private String fileVoice = "";
    private String fileName = "";
    private File fileWorkDir;
    private File fileRaw;
    private File fileMp3;

    private void reportBatch(int session, int index, String event) {
        if (!appForeground || !trustedTopLevelPage || webView == null) return;
        webView.evaluateJavascript("if(window.AksaralaiNativeBatchFeedback)window.AksaralaiNativeBatchFeedback(" +
            session + "," + index + ",'" + event + "');", null);
    }

    private void clearBatch(boolean completed) {
        if (completed && !batchChapter.isEmpty()) {
            getSharedPreferences("aksaralai-tts", MODE_PRIVATE).edit()
                .remove("progress." + batchChapter).apply();
        }
        batchPieces.clear();
        batchSession = 0;
        batchCursor = 0;
        batchBaseIndex = 0;
        batchTotal = 0;
        batchChapter = "";
        batchSignature = "";
    }

    private void nativeNext(int session) {
        if (session != batchSession || !trustedTopLevelPage || nativeTtsStatus != 1 || nativeTts == null) return;
        while (batchCursor < batchTotal) {
            String words = batchPieces.get(batchCursor);
            if (words == null || words.trim().isEmpty()) { batchCursor++; continue; }
            if (!batchChapter.isEmpty()) {
                try {
                    JSONObject progress = new JSONObject();
                    progress.put("signature", batchSignature);
                    progress.put("index", batchBaseIndex + batchCursor);
                    getSharedPreferences("aksaralai-tts", MODE_PRIVATE).edit()
                        .putString("progress." + batchChapter, progress.toString()).apply();
                } catch (Exception ignored) {}
            }
            // Native Android TTS callback drives the next chunk; no JS timers/background throttling.
            int result = nativeTts.speak(words, TextToSpeech.QUEUE_ADD, null, "B-" + session + "-" + batchCursor);
            if (result == TextToSpeech.ERROR) {
                reportBatch(session, batchBaseIndex + batchCursor, "error");
                clearBatch(false);
            }
            return;
        }
        reportBatch(session, batchBaseIndex + batchTotal, "done");
        clearBatch(true);
    }


    private void reportSpeech(int id, String result) {
        runOnUiThread(() -> {
            if (webView != null && trustedTopLevelPage) {
                webView.evaluateJavascript("if(window.AksaralaiNativeSpeechFeedback)window.AksaralaiNativeSpeechFeedback(" +
                    id + ",'" + result + "');", null);
            }
        });
    }


    private void reportFile(int session, String event, int done, int total, String detail) {
        runOnUiThread(() -> {
            if (webView == null || !trustedTopLevelPage) return;
            String safeEvent = JSONObject.quote(event == null ? "" : event);
            String safeDetail = JSONObject.quote(detail == null ? "" : detail);
            webView.evaluateJavascript(
                "if(window.AksaralaiNativeFileFeedback)window.AksaralaiNativeFileFeedback(" +
                session + "," + safeEvent + "," + done + "," + total + "," + safeDetail + ");", null);
        });
    }

    private void cleanupFileJob() {
        fileBusy = false;
        filePieces.clear();
        fileSession = 0;
        fileCursor = 0;
        fileTotal = 0;
        fileChapterId = 0;
        fileSampleRate = 0;
        fileChannels = 0;
        if (fileWorkDir != null && fileWorkDir.exists()) {
            File[] children = fileWorkDir.listFiles();
            if (children != null) for (File child : children) child.delete();
            fileWorkDir.delete();
        }
        fileWorkDir = null;
        fileRaw = null;
        fileMp3 = null;
    }

    private static int le16(byte[] b, int off) {
        return (b[off] & 0xff) | ((b[off + 1] & 0xff) << 8);
    }

    private static long le32(byte[] b, int off) {
        return ((long)b[off] & 0xff) |
            (((long)b[off + 1] & 0xff) << 8) |
            (((long)b[off + 2] & 0xff) << 16) |
            (((long)b[off + 3] & 0xff) << 24);
    }

    // Android TTS engines normally emit PCM WAV for synthesizeToFile().
    // Parse RIFF chunks instead of assuming a fixed 44-byte header.
    private void appendWavPcm(File wav) throws IOException {
        try (RandomAccessFile in = new RandomAccessFile(wav, "r")) {
            byte[] head = new byte[12];
            if (in.read(head) != 12 ||
                head[0] != 'R' || head[1] != 'I' || head[2] != 'F' || head[3] != 'F' ||
                head[8] != 'W' || head[9] != 'A' || head[10] != 'V' || head[11] != 'E') {
                throw new IOException("TTS engine did not create PCM WAV");
            }
            int format = -1, channels = -1, rate = -1, bits = -1;
            long dataOffset = -1, dataSize = -1;
            byte[] chunkHead = new byte[8];
            while (in.getFilePointer() + 8 <= in.length()) {
                if (in.read(chunkHead) != 8) break;
                String id = new String(chunkHead, 0, 4, java.nio.charset.StandardCharsets.US_ASCII);
                long size = le32(chunkHead, 4);
                long next = in.getFilePointer() + size + (size & 1L);
                if (size < 0 || next > in.length() + 1) throw new IOException("Invalid WAV chunk");
                if ("fmt ".equals(id)) {
                    if (size < 16 || size > 256) throw new IOException("Unsupported WAV format");
                    byte[] fmt = new byte[(int)size];
                    in.readFully(fmt);
                    format = le16(fmt, 0);
                    channels = le16(fmt, 2);
                    rate = (int)le32(fmt, 4);
                    bits = le16(fmt, 14);
                } else if ("data".equals(id)) {
                    dataOffset = in.getFilePointer();
                    dataSize = size;
                }
                in.seek(Math.min(next, in.length()));
            }
            if (format != 1 || bits != 16 || channels < 1 || channels > 2 || rate < 8000 ||
                dataOffset < 0 || dataSize < 2) throw new IOException("Unsupported TTS WAV format");
            if (fileSampleRate == 0) {
                fileSampleRate = rate;
                fileChannels = channels;
            } else if (fileSampleRate != rate || fileChannels != channels) {
                throw new IOException("TTS audio format changed between chunks");
            }
            in.seek(dataOffset);
            byte[] buffer = new byte[32768];
            long remaining = dataSize;
            try (FileOutputStream out = new FileOutputStream(fileRaw, true)) {
                while (remaining > 0) {
                    int n = in.read(buffer, 0, (int)Math.min(buffer.length, remaining));
                    if (n < 0) throw new IOException("Unexpected end of WAV");
                    out.write(buffer, 0, n);
                    remaining -= n;
                }
            }
        }
    }

    private void encodeRawToMp3(File raw, File mp3, int sampleRate, int channels) throws IOException {
        Jlame_global_flags flags = Jlame.lame_init();
        if (flags == null) throw new IOException("Cannot initialize MP3 encoder");
        try {
            if (flags.lame_set_num_channels(channels)) throw new IOException("Unsupported channel count");
            if (flags.lame_set_in_samplerate(sampleRate) != 0) throw new IOException("Unsupported sample rate");
            if (flags.lame_set_out_samplerate(sampleRate) != 0) throw new IOException("Unsupported MP3 sample rate");
            flags.lame_set_VBR(Jlame.vbr_off);
            flags.lame_set_brate(64);
            flags.lame_set_mode(channels == 1 ? Jlame.MONO : Jlame.JOINT_STEREO);
            flags.lame_set_quality(5);
            flags.lame_set_write_id3tag_automatic(false);
            if (Jlame.lame_init_params(flags) < 0) throw new IOException("MP3 encoder setup failed");

            final int samplesPerChannel = 1152;
            byte[] pcmBytes = new byte[samplesPerChannel * channels * 2];
            short[] pcm = new short[samplesPerChannel * channels];
            byte[] mp3Buffer = new byte[16384];
            try (FileInputStream in = new FileInputStream(raw);
                 FileOutputStream out = new FileOutputStream(mp3)) {
                int n;
                while ((n = in.read(pcmBytes)) > 0) {
                    int usable = n - (n % (channels * 2));
                    if (usable <= 0) continue;
                    ByteBuffer.wrap(pcmBytes, 0, usable).order(ByteOrder.LITTLE_ENDIAN)
                        .asShortBuffer().get(pcm, 0, usable / 2);
                    int perChannel = usable / (channels * 2);
                    int wrote;
                    if (channels == 2) {
                        wrote = Jlame.lame_encode_buffer_interleaved(
                            flags, pcm, perChannel, mp3Buffer, 0, mp3Buffer.length);
                    } else {
                        wrote = Jlame.lame_encode_buffer(
                            flags, pcm, pcm, perChannel, mp3Buffer, 0, mp3Buffer.length);
                    }
                    if (wrote < 0) throw new IOException("MP3 encoding failed");
                    if (wrote > 0) out.write(mp3Buffer, 0, wrote);
                }
                int tail = Jlame.lame_encode_flush(flags, mp3Buffer, mp3Buffer.length);
                if (tail < 0) throw new IOException("MP3 finalization failed");
                if (tail > 0) out.write(mp3Buffer, 0, tail);
            }
        } finally {
            Jlame.lame_close(flags);
        }
    }

    private void saveGeneratedMp3(File source, String filename) throws IOException {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, "audio/mpeg");
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Aksaralai");
            Uri dest = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (dest == null) throw new IOException("Cannot create download");
            try (FileInputStream in = new FileInputStream(source);
                 OutputStream out = getContentResolver().openOutputStream(dest)) {
                if (out == null) throw new IOException("Cannot open download");
                byte[] buffer = new byte[65536]; int n;
                while ((n = in.read(buffer)) >= 0) if (n > 0) out.write(buffer, 0, n);
            }
        } else {
            File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) throw new IOException("Downloads unavailable");
            try (FileInputStream in = new FileInputStream(source);
                 FileOutputStream out = new FileOutputStream(new File(dir, filename))) {
                byte[] buffer = new byte[65536]; int n;
                while ((n = in.read(buffer)) >= 0) if (n > 0) out.write(buffer, 0, n);
            }
        }
    }

    private boolean uploadGeneratedMp3(File source, int chapterId, String cookie) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(HOME + "api/writer/chapters/" + chapterId + "/audio");
            conn = (HttpURLConnection)url.openConnection();
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(45000);
            conn.setRequestMethod("PUT");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "audio/mpeg");
            if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
            long length = source.length();
            if (length < 128 || length > 40L * 1024L * 1024L) return false;
            conn.setFixedLengthStreamingMode(length);
            try (FileInputStream in = new FileInputStream(source);
                 OutputStream out = conn.getOutputStream()) {
                byte[] buffer = new byte[65536]; int n;
                while ((n = in.read(buffer)) >= 0) if (n > 0) out.write(buffer, 0, n);
            }
            int code = conn.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void finishFileEncoding(int session) {
        if (session != fileSession || fileRaw == null || fileMp3 == null) return;
        final File raw = fileRaw, mp3 = fileMp3;
        final int sampleRate = fileSampleRate, channels = fileChannels, chapterId = fileChapterId;
        final String filename = fileName;
        final String cookie = CookieManager.getInstance().getCookie(HOME);
        reportFile(session, "encoding", fileTotal, fileTotal, "กำลังเข้ารหัสเป็น MP3");
        new Thread(() -> {
            boolean saved = false, uploaded = false;
            String error = "";
            try {
                encodeRawToMp3(raw, mp3, sampleRate, channels);
                if (mp3.length() < 128) throw new IOException("Empty MP3");
                if (mp3.length() > 40L * 1024L * 1024L)
                    throw new IOException("ไฟล์เสียงเกิน 40 MB กรุณาแบ่งตอนให้สั้นลง");
                saveGeneratedMp3(mp3, filename);
                saved = true;
                uploaded = uploadGeneratedMp3(mp3, chapterId, cookie);
            } catch (Exception e) {
                error = e.getMessage() == null ? "สร้าง MP3 ไม่สำเร็จ" : e.getMessage();
            }
            final boolean doneSaved = saved, doneUploaded = uploaded;
            final String doneError = error;
            runOnUiThread(() -> {
                if (session != fileSession) return;
                if (!doneError.isEmpty()) {
                    reportFile(session, "error", fileCursor, fileTotal, doneError);
                } else if (doneUploaded) {
                    reportFile(session, "done", fileTotal, fileTotal,
                        "สร้าง MP3 และอัปโหลดเข้าตอนนี้สำเร็จ · บันทึกสำเนาไว้ใน Downloads/Aksaralai");
                } else if (doneSaved) {
                    reportFile(session, "saved", fileTotal, fileTotal,
                        "สร้าง MP3 สำเร็จและบันทึกใน Downloads/Aksaralai แต่การอัปโหลดอัตโนมัติไม่สำเร็จ");
                }
                cleanupFileJob();
            });
        }, "AksaralaiMp3Encoder").start();
    }

    private void synthesizeNextFilePart(int session) {
        if (session != fileSession || !fileBusy || nativeTts == null || nativeTtsStatus != 1) return;
        while (fileCursor < fileTotal && filePieces.get(fileCursor).trim().isEmpty()) fileCursor++;
        if (fileCursor >= fileTotal) {
            finishFileEncoding(session);
            return;
        }
        File part = new File(fileWorkDir, String.format(Locale.US, "part-%05d.wav", fileCursor));
        int result = nativeTts.synthesizeToFile(
            filePieces.get(fileCursor), null, part, "F-" + session + "-" + fileCursor);
        if (result == TextToSpeech.ERROR) {
            reportFile(session, "error", fileCursor, fileTotal, "ระบบเสียง Android สร้างไฟล์ไม่ได้");
            cleanupFileJob();
        }
    }

    private final class NativeSpeech {
        @JavascriptInterface public String batchState() {
            if (!trustedTopLevelPage) return "{}";
            JSONObject state = new JSONObject();
            try {
                state.put("session", batchSession);
                state.put("index", batchBaseIndex + batchCursor);
                state.put("total", batchTotal);
                state.put("chapter", batchChapter);
            } catch (Exception ignored) {}
            return state.toString();
        }

        // The bridge chapter ID is a strict numeric account:chapter pair. Do not resume
        // an older account's checkpoint when a different reader uses this device.
        @JavascriptInterface public int savedBatchIndex(String chapter, String signature) {
            if (!trustedTopLevelPage || chapter == null || !chapter.matches("[0-9]{1,12}:[0-9]{1,12}")) return 0;
            String value = getSharedPreferences("aksaralai-tts", MODE_PRIVATE)
                .getString("progress." + chapter, "");
            try {
                JSONObject record = new JSONObject(value);
                return signature.equals(record.optString("signature")) ? Math.max(0, record.optInt("index")) : 0;
            } catch (Exception ignored) { return 0; }
        }

        @JavascriptInterface public void speakBatch(String json, double speed, String selected,
                                                      int session, String chapter, String signature, int startIndex) {
            if (!trustedTopLevelPage) return;
            if (json == null || json.length() > 600000 || session < 1 ||
                !Double.isFinite(speed) || speed < 0.5 || speed > 2 ||
                chapter == null || !chapter.matches("[0-9]{1,12}:[0-9]{1,12}") || startIndex < 0 || startIndex > 4000 ||
                signature == null || signature.length() > 512) return;
            final List<String> pieces = new ArrayList<>();
            try {
                JSONArray arr = new JSONArray(json);
                if (arr.length() < 1 || arr.length() > 4000) return;
                int totalChars = 0;
                for (int i = 0; i < arr.length(); i++) {
                    String words = arr.getString(i);
                    if (words.length() > 3000) return;
                    totalChars += words.length();
                    if (totalChars > 350000) return;
                    pieces.add(words);
                }
            } catch (Exception ignored) { return; }
            runOnUiThread(() -> {
                if (!trustedTopLevelPage || nativeTtsStatus != 1 || nativeTts == null) {
                    reportBatch(session, 0, "error");
                    return;
                }
                nativeTts.stop();
                clearBatch(false);
                batchSession = session;
                batchPieces = pieces;
                batchCursor = 0;
                batchBaseIndex = startIndex;
                batchTotal = pieces.size();
                batchChapter = chapter;
                batchSignature = signature;
                batchSpeed = (float) speed;
                batchVoice = selected == null ? "" : selected;
                if (!batchVoice.isEmpty()) {
                    Set<Voice> available = nativeTts.getVoices();
                    Voice chosen = null;
                    if (available != null) for (Voice v : available)
                        if (batchVoice.equals(v.getName()) &&
                            "th".equals(v.getLocale().getLanguage())) {chosen = v; break;}
                    if (chosen != null) nativeTts.setVoice(chosen);
                    else nativeTts.setLanguage(thaiLocale);
                } else nativeTts.setLanguage(thaiLocale);
                nativeTts.setSpeechRate(batchSpeed);
                nativeNext(session);
            });
        }
        @JavascriptInterface public int status() {
            return trustedTopLevelPage ? nativeTtsStatus : 0;
        }

        @JavascriptInterface public String voices() {
            if (!trustedTopLevelPage || nativeTtsStatus != 1 || nativeTts == null) return "[]";
            JSONArray list = new JSONArray();
            Set<Voice> all = nativeTts.getVoices();
            if (all == null) return "[]";
            for (Voice voice : all) {
                if (voice.getLocale() == null || !voice.getLocale().getLanguage().equals("th")) continue;
                JSONObject item = new JSONObject();
                try {
                    item.put("voiceURI", voice.getName());
                    item.put("name", voice.getName());
                    item.put("lang", voice.getLocale().toLanguageTag());
                    list.put(item);
                } catch (Exception ignored) {}
            }
            return list.toString();
        }

        @JavascriptInterface public void stop() {
            if (!trustedTopLevelPage) return;
            runOnUiThread(() -> { clearBatch(false); if (nativeTts != null) nativeTts.stop(); });
        }

        @JavascriptInterface public void speak(String words, double speed, String selected, int id) {
            if (!trustedTopLevelPage) return;
            if (words == null || words.isEmpty() || words.length() > 3000 ||
                !Double.isFinite(speed) || speed < 0.5 || speed > 2.0 || id < 1) {
                reportSpeech(id, "error");
                return;
            }
            runOnUiThread(() -> {
                if (nativeTts == null || nativeTtsStatus != 1) { reportSpeech(id, "error"); return; }
                clearBatch(false);
                if (selected != null && !selected.isEmpty()) {
                    Voice chosen = null;
                    Set<Voice> all = nativeTts.getVoices();
                    if (all != null) for (Voice candidate : all) {
                        if (candidate.getName().equals(selected) &&
                            candidate.getLocale() != null &&
                            "th".equals(candidate.getLocale().getLanguage())) { chosen = candidate; break; }
                    }
                    if (chosen != null) nativeTts.setVoice(chosen);
                    else nativeTts.setLanguage(thaiLocale);
                } else nativeTts.setLanguage(thaiLocale);
                nativeTts.setSpeechRate((float)speed);
                int result = nativeTts.speak(words, TextToSpeech.QUEUE_FLUSH, null, String.valueOf(id));
                if (result == TextToSpeech.ERROR) reportSpeech(id, "error");
            });
        }
    }

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

        // On Android 15+ the app draws behind system bars by default.
        // Reserve the *actual* device status/navigation inset heights in native
        // layout rather than adding a guessed 28px CSS spacer to the web page.
        final int paper = Color.rgb(255,253,249);
        final int border = Color.rgb(232,224,237);
        getWindow().setStatusBarColor(paper);
        getWindow().setNavigationBarColor(paper);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        LinearLayout frame = new LinearLayout(this);
        frame.setOrientation(LinearLayout.VERTICAL);
        frame.setBackgroundColor(paper);

        View statusStrip = new View(this);
        statusStrip.setBackgroundColor(paper);
        frame.addView(statusStrip, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0));

        View statusDivider = new View(this);
        statusDivider.setBackgroundColor(border);
        frame.addView(statusDivider, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0));

        webView = new WebView(this);
        frame.addView(webView, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        View navStrip = new View(this);
        navStrip.setBackgroundColor(paper);
        frame.addView(navStrip, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0));

        setContentView(frame);
        if (Build.VERSION.SDK_INT >= 35) {
            frame.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets status = insets.getInsets(WindowInsets.Type.statusBars());
                Insets navigation = insets.getInsets(WindowInsets.Type.navigationBars());
                int topHeight = Math.max(0, status.top);
                int bottomHeight = Math.max(0, navigation.bottom);
                LinearLayout.LayoutParams statusLayout =
                    (LinearLayout.LayoutParams) statusStrip.getLayoutParams();
                if (statusLayout.height != topHeight) {
                    statusLayout.height = topHeight;
                    statusStrip.setLayoutParams(statusLayout);
                }
                LinearLayout.LayoutParams dividerLayout =
                    (LinearLayout.LayoutParams) statusDivider.getLayoutParams();
                int dividerHeight = topHeight > 0 ? Math.max(1, Math.round(getResources()
                    .getDisplayMetrics().density)) : 0;
                if (dividerLayout.height != dividerHeight) {
                    dividerLayout.height = dividerHeight;
                    statusDivider.setLayoutParams(dividerLayout);
                }
                LinearLayout.LayoutParams navLayout =
                    (LinearLayout.LayoutParams) navStrip.getLayoutParams();
                if (navLayout.height != bottomHeight) {
                    navLayout.height = bottomHeight;
                    navStrip.setLayoutParams(navLayout);
                }
                return insets;
            });
            frame.requestApplyInsets();
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        // Distinguish trusted Android app from browser to invoke the native PDF print dialog.
        settings.setUserAgentString(settings.getUserAgentString() + " AksaralaiAndroid/0.1.6");
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
        webView.addJavascriptInterface(new NativeSpeech(), "AksaralaiTts");
        nativeTts = new TextToSpeech(getApplicationContext(), status -> {
            if (status != TextToSpeech.SUCCESS || nativeTts == null) {
                nativeTtsStatus = 0;
                return;
            }
            int languageSupport = nativeTts.setLanguage(thaiLocale);
            nativeTtsStatus = languageSupport == TextToSpeech.LANG_MISSING_DATA ||
                languageSupport == TextToSpeech.LANG_NOT_SUPPORTED ? 0 : 1;
            nativeTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) {
                    if (utteranceId != null && utteranceId.startsWith("B-")) {
                        String[] ids=utteranceId.split("-");
                        if (ids.length == 3) try {
                            int session=Integer.parseInt(ids[1]),pos=Integer.parseInt(ids[2]);
                            runOnUiThread(() -> {
                                if (batchSession==session && batchCursor==pos)
                                    reportBatch(session,batchBaseIndex+pos,"progress");
                            });
                        } catch (NumberFormatException ignored) {}
                    }
                }
                @Override public void onDone(String utteranceId) {
                    if (utteranceId != null && utteranceId.startsWith("B-")) {
                        String[] ids=utteranceId.split("-");
                        if (ids.length == 3) try {
                            int session=Integer.parseInt(ids[1]),pos=Integer.parseInt(ids[2]);
                            runOnUiThread(() -> {
                                if(batchSession!=session || batchCursor!=pos) return;
                                batchCursor=pos+1;
                                nativeNext(session);
                            });
                        } catch (NumberFormatException ignored) {}
                        return;
                    }
                    try { reportSpeech(Integer.parseInt(utteranceId), "done"); }
                    catch (NumberFormatException ignored) {}
                }
                @Override public void onError(String utteranceId) {
                    if (utteranceId != null && utteranceId.startsWith("B-")) {
                        String[] ids=utteranceId.split("-");
                        if (ids.length == 3) try {
                            int session=Integer.parseInt(ids[1]),pos=Integer.parseInt(ids[2]);
                            runOnUiThread(() -> {
                                if(batchSession!=session || batchCursor!=pos) return;
                                reportBatch(session,batchBaseIndex+pos,"error");
                                clearBatch(false);
                            });
                        } catch (NumberFormatException ignored) {}
                        return;
                    }
                    if (utteranceId != null && utteranceId.startsWith("P-")) {
                        String[] ids=utteranceId.split("-");
                        if (ids.length == 3) try {
                            int session=Integer.parseInt(ids[1]),pos=Integer.parseInt(ids[2]);
                            runOnUiThread(() -> {
                                if(batchSession!=session || batchCursor!=pos) return;
                                // A failed silent gap should not stop the reader.
                                batchCursor=pos+1;
                                nativeNext(session);
                            });
                        } catch (NumberFormatException ignored) {}
                        return;
                    }
                    try { reportSpeech(Integer.parseInt(utteranceId), "error"); }
                    catch (NumberFormatException ignored) {}
                }
            });
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                trustedTopLevelPage = false;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if ("aksaralai-print".equalsIgnoreCase(request.getUrl().getScheme())) {
                    // Only the owner's authenticated printable manuscript page can invoke printing.
                    String currentUrl = view.getUrl();
                    if ("aksaralai-print://document".equals(url) &&
                        trusted(currentUrl) &&
                        Uri.parse(currentUrl).getPath().matches("/api/admin/novels/[0-9]+/manuscript")) {
                        PrintManager manager=(PrintManager)getSystemService(Context.PRINT_SERVICE);
                        if(manager!=null) {
                            manager.print("อักษราลัย - ต้นฉบับ",
                                view.createPrintDocumentAdapter("ต้นฉบับอักษราลัย"),
                                new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS).build());
                        } else message("ระบบพิมพ์ PDF ไม่พร้อมใช้งาน");
                    }
                    return true;
                }
                if (trusted(url)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
                catch (Exception ignored) { message("ไม่สามารถเปิดลิงก์นี้ได้"); }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                trustedTopLevelPage = trusted(url);
                if (!trustedTopLevelPage) return;
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
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                if (!trusted(url)) return false;
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton("ยืนยัน", (dialog, which) -> result.confirm())
                    .setNegativeButton("ยกเลิก", (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel())
                    .show();
                return true;
            }
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

    private boolean closePromptShowing = false;

    private void confirmCloseApp() {
        if (isFinishing() || isDestroyed() || closePromptShowing) return;
        closePromptShowing = true;
        new AlertDialog.Builder(this)
            .setTitle("ปิดแอปอักษราลัย")
            .setMessage("ต้องการปิดแอปหรือไม่? ระบบจะเก็บการเข้าสู่ระบบไว้")
            .setNegativeButton("ยกเลิก", (dialog, which) -> { })
            .setPositiveButton("ปิดแอป", (dialog, which) -> finish())
            .setOnDismissListener(dialog -> closePromptShowing = false)
            .show();
    }

    @Override public void onBackPressed() {
        if (webView == null) { super.onBackPressed(); return; }
        if (!trustedTopLevelPage) {
            if (webView.canGoBack()) webView.goBack();
            else super.onBackPressed();
            return;
        }
        // Aksaralai is a single-document app. WebView.canGoBack() alone cannot
        // reliably tell which novel/chapter screen was previously visited.
        webView.evaluateJavascript(
            "(function(){if(typeof window.aksaralaiAndroidBack!=='function')return 'fallback';" +
            "return window.aksaralaiAndroidBack()?'handled':'exit';})()",
            response -> {
                if ("\"handled\"".equals(response)) return;
                if ("\"exit\"".equals(response)) { confirmCloseApp(); return; }
                if (webView.canGoBack()) webView.goBack();
                else confirmCloseApp();
            }
        );
    }

    @Override protected void onResume() {
        super.onResume();
        appForeground=true;
        if(webView!=null&&trustedTopLevelPage&&batchSession>0) {
            reportBatch(batchSession,batchBaseIndex+batchCursor,"progress");
        }
    }
    @Override protected void onPause() {
        appForeground=false;
        super.onPause();
    }
    @Override protected void onDestroy() {
        trustedTopLevelPage = false;
        clearBatch(false);
        if(uploadCallback!=null){uploadCallback.onReceiveValue(null);uploadCallback=null;}
        if(nativeTts!=null){nativeTts.stop();nativeTts.shutdown();nativeTts=null;}
        if(webView!=null)webView.destroy();
        super.onDestroy();
    }
}
