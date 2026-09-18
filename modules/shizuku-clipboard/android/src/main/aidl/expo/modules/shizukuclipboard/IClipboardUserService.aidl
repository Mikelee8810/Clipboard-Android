package expo.modules.shizukuclipboard;

import android.os.IBinder;
import android.os.ParcelFileDescriptor;

interface IClipboardUserService {
    void init(in IBinder callerToken);
    String getPrimaryClipJson();
    boolean copyPrimaryClipToFile(in ParcelFileDescriptor destination);
    boolean setPrimaryClipText(String text);
    boolean resolveBackgroundClipboardRestriction();
    /** Puts the newest screenshot taken within maxAgeSeconds on the clipboard; returns its media id or -1. */
    long copyLatestScreenshotToClipboard(long afterMediaId, long maxAgeSeconds);
    void destroy();
}
