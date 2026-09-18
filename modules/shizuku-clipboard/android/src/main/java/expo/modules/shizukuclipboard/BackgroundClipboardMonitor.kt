package expo.modules.shizukuclipboard

import android.content.ComponentName
import android.content.Context
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Binder
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Log
import rikka.shizuku.Shizuku
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors

object BackgroundClipboardMonitor {
    private const val TAG = "ShizukuBackgroundMonitor"
    private const val POLL_INTERVAL_MS = 500L

    private val owners = CopyOnWriteArraySet<String>()
    private val listeners = mutableMapOf<String, (String) -> Unit>()
    private val listenerLock = Any()
    private val callerToken = Binder()
    private val persistenceExecutor = Executors.newSingleThreadExecutor()
    private val monitorThread = HandlerThread("clipboard-native-monitor").apply { start() }
    private val monitorHandler = Handler(monitorThread.looper)
    private val mainHandler = Handler(android.os.Looper.getMainLooper())

    @Volatile private var applicationContext: Context? = null
    @Volatile private var clipboardService: IClipboardUserService? = null
    @Volatile private var binding = false
    @Volatile private var listenersRegistered = false
    @Volatile private var lastSnapshot = ""
    @Volatile private var pollerActive = false

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            binding = false
            clipboardService = binder?.let(IClipboardUserService.Stub::asInterface)
            try {
                clipboardService?.init(callerToken)
            } catch (error: Exception) {
                Log.w(TAG, "Unable to initialize Shizuku clipboard worker", error)
            }
            Log.i(TAG, "Shizuku clipboard worker connected owners=${owners.size}")
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            clipboardService = null
            binding = false
            if (owners.isNotEmpty()) bindUserService()
        }
    }

    private val binderReceivedListener = Shizuku.OnBinderReceivedListener {
        if (owners.isNotEmpty()) bindUserService()
    }
    private val binderDeadListener = Shizuku.OnBinderDeadListener {
        clipboardService = null
        binding = false
    }

    private val pollRunnable = object : Runnable {
        override fun run() {
            if (owners.isEmpty()) {
                pollerActive = false
                return
            }

            pollerActive = true
            try {
                val service = clipboardService
                if (service == null) {
                    bindUserService()
                } else {
                    val snapshot = try {
                        service.primaryClipJson.orEmpty()
                    } catch (error: Exception) {
                        Log.w(TAG, "Clipboard worker read failed; reconnecting", error)
                        clipboardService = null
                        binding = false
                        ""
                    }
                    if (snapshot.isNotEmpty() && snapshot != lastSnapshot) {
                        lastSnapshot = snapshot
                        applicationContext?.let { context ->
                            persistenceExecutor.execute {
                                BackgroundClipboardHistoryWriter.persist(context, snapshot, service)
                            }
                        }
                        val callbacks = synchronized(listenerLock) { listeners.values.toList() }
                        if (callbacks.isNotEmpty()) {
                            mainHandler.post { callbacks.forEach { it(snapshot) } }
                        }
                    }
                }
            } finally {
                if (owners.isNotEmpty()) {
                    monitorHandler.postDelayed(this, POLL_INTERVAL_MS)
                } else {
                    pollerActive = false
                }
            }
        }
    }

    @JvmStatic
    fun start(context: Context, owner: String, listener: ((String) -> Unit)? = null): Boolean {
        applicationContext = context.applicationContext
        owners.add(owner)
        synchronized(listenerLock) {
            if (listener == null) listeners.remove(owner) else listeners[owner] = listener
        }
        registerListeners()
        if (!hasPermission()) {
            Log.w(TAG, "Shizuku permission unavailable; native clipboard monitor not started")
            return false
        }
        bindUserService()
        schedulePoller()
        return true
    }

    /**
     * Reconcile the native monitor after Shizuku or its user service has died.
     * This is intentionally idempotent so a watchdog can call it repeatedly.
     */
    @JvmStatic
    fun ensureRunning(context: Context, owner: String): Boolean {
        applicationContext = context.applicationContext
        if (!owners.contains(owner)) return start(context, owner)
        registerListeners()
        if (!hasPermission()) return false
        bindUserService()
        schedulePoller()
        return isRunning()
    }

    @JvmStatic
    fun stop(owner: String) {
        owners.remove(owner)
        synchronized(listenerLock) { listeners.remove(owner) }
        if (owners.isNotEmpty()) return
        monitorHandler.removeCallbacks(pollRunnable)
        pollerActive = false
        lastSnapshot = ""
        unbindUserService()
    }

    @JvmStatic
    fun isRunning(): Boolean = owners.isNotEmpty() && clipboardService != null && pollerActive

    private fun schedulePoller() {
        monitorHandler.removeCallbacks(pollRunnable)
        monitorHandler.post(pollRunnable)
    }

    private fun registerListeners() {
        if (listenersRegistered) return
        synchronized(this) {
            if (listenersRegistered) return
            Shizuku.addBinderReceivedListenerSticky(binderReceivedListener)
            Shizuku.addBinderDeadListener(binderDeadListener)
            listenersRegistered = true
        }
    }

    private fun hasPermission(): Boolean = try {
        Shizuku.pingBinder() &&
            Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED
    } catch (_: Exception) {
        false
    }

    private fun bindUserService() {
        val context = applicationContext ?: return
        if (clipboardService != null || binding || !hasPermission()) return
        binding = true
        try {
            Shizuku.bindUserService(userServiceArgs(context), serviceConnection)
        } catch (error: Exception) {
            binding = false
            Log.e(TAG, "Failed to bind Shizuku clipboard worker", error)
        }
    }

    private fun unbindUserService() {
        val context = applicationContext ?: return
        if (clipboardService == null && !binding) return
        try {
            Shizuku.unbindUserService(userServiceArgs(context), serviceConnection, true)
        } catch (error: Exception) {
            Log.w(TAG, "Failed to unbind Shizuku clipboard worker", error)
        }
        clipboardService = null
        binding = false
    }

    private fun userServiceArgs(context: Context) = Shizuku.UserServiceArgs(
        ComponentName(context.packageName, ClipboardUserService::class.java.name)
    )
        .daemon(false)
        .processNameSuffix("clipboard")
        .debuggable(BuildConfig.DEBUG)
        .version(4)
}
