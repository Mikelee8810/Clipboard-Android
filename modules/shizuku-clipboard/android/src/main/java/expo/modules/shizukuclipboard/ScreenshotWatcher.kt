package expo.modules.shizukuclipboard

import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log

/**
 * Watches the media store for new screenshots and puts each one on the
 * clipboard through the Shizuku worker, so the normal clipboard sync path
 * carries it to peers without the user touching anything.
 */
object ScreenshotWatcher {
    private const val TAG = "ScreenshotWatcher"
    private const val DEBOUNCE_MS = 1_200L
    private const val MAX_AGE_SECONDS = 60L
    private const val PREFS = "clipboard_screenshot_watcher"
    private const val KEY_LAST_ID = "last_media_id"

    private val handler = Handler(Looper.getMainLooper())
    @Volatile private var context: Context? = null
    @Volatile private var observer: ContentObserver? = null

    private val check = Runnable {
        val appContext = context ?: return@Runnable
        val service = BackgroundClipboardMonitor.currentService()
        if (service == null) {
            Log.w(TAG, "Shizuku worker unavailable; screenshot not captured")
            return@Runnable
        }
        val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val lastId = prefs.getLong(KEY_LAST_ID, 0)
        val id = try {
            service.copyLatestScreenshotToClipboard(lastId, MAX_AGE_SECONDS)
        } catch (error: Exception) {
            Log.w(TAG, "Screenshot capture failed", error)
            -1L
        }
        if (id > 0) prefs.edit().putLong(KEY_LAST_ID, id).apply()
    }

    @JvmStatic
    fun start(context: Context) {
        if (observer != null) return
        this.context = context.applicationContext
        val contentObserver = object : ContentObserver(handler) {
            override fun onChange(selfChange: Boolean, uri: Uri?) {
                handler.removeCallbacks(check)
                handler.postDelayed(check, DEBOUNCE_MS)
            }
        }
        context.applicationContext.contentResolver.registerContentObserver(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true, contentObserver
        )
        observer = contentObserver
        Log.i(TAG, "Screenshot watcher started")
    }

    @JvmStatic
    fun stop() {
        val contentObserver = observer ?: return
        handler.removeCallbacks(check)
        context?.contentResolver?.unregisterContentObserver(contentObserver)
        observer = null
        Log.i(TAG, "Screenshot watcher stopped")
    }

    @JvmStatic
    fun isRunning(): Boolean = observer != null
}
