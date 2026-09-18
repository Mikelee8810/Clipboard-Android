package expo.modules.foregroundservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.res.Configuration
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import expo.modules.nativeutil.NativeLogger
import expo.modules.shizukuclipboard.BackgroundClipboardMonitor
import expo.modules.shizukuclipboard.ScreenshotWatcher
import expo.modules.ucengine.BackgroundServiceDiagnostics

class SyncForegroundService : Service() {

    companion object {
        private const val TAG = "SyncForegroundService"
        const val CHANNEL_ID = "syncclipboard_foreground"
        const val NOTIFY_ID = 0x2020
        const val ACTION_START = "START"
        const val ACTION_STOP = "STOP"
        const val ACTION_TEMP_STOP = "TEMP_STOP"
        const val ACTION_UPDATE = "UPDATE"
        const val EXTRA_CONTENT = "content"
        private const val PREFS = "clipboard_background_service"
        private const val KEY_BACKGROUND_REQUESTED = "background_requested"
        private const val CLIPBOARD_MONITOR_OWNER = "foreground-service"
        private const val LEGACY_RESTART_CHANNEL_ID = "syncclipboard_restart"
        private const val WATCHDOG_INTERVAL_MS = 5_000L

        var isRunning = false
            private set

        /** Marks a user initiated stop so diagnostics can distinguish it from a system kill. */
        internal var stoppedByUser = false

        fun setBackgroundRequested(context: android.content.Context, requested: Boolean) {
            context.getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_BACKGROUND_REQUESTED, requested)
                .apply()
        }

        private fun isBackgroundRequested(context: android.content.Context): Boolean =
            context.getSharedPreferences(PREFS, MODE_PRIVATE)
                .getBoolean(KEY_BACKGROUND_REQUESTED, false)
    }

    private var notificationManager: NotificationManager? = null
    private var lastContent: String? = null
    private val watchdogHandler = Handler(Looper.getMainLooper())
    private val monitorWatchdog = object : Runnable {
        override fun run() {
            if (!isRunning || stoppedByUser) return

            if (!BackgroundClipboardMonitor.isRunning()) {
                NativeLogger.w(TAG, "Clipboard monitor is not healthy; attempting native recovery")
                BackgroundClipboardMonitor.ensureRunning(this@SyncForegroundService, CLIPBOARD_MONITOR_OWNER)
            }
            watchdogHandler.postDelayed(this, WATCHDOG_INTERVAL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        NativeLogger.d(TAG, "Service onCreate")
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        NativeLogger.d(TAG, "onStartCommand action=${intent?.action} flags=$flags startId=$startId")
        when (intent?.action) {
            ACTION_START, null -> {
                NativeLogger.d(TAG, "Starting foreground, intent action=${intent?.action}")

                // 系统 START_STICKY 重启时：
                //   - intent 为 null：系统直接重启
                //   - intent.action == ACTION_START 但 jsInitiatedService == false：
                //     系统重投了上次的 ACTION_START intent，JS 并未实际运行
                // A stale system restart is ignored when the user has not enabled background work.
                if (
                    (intent == null || !ForegroundServiceModule.isJsRuntimeAlive()) &&
                    !isBackgroundRequested(this)
                ) {
                    NativeLogger.w(TAG, "Service restarted without an active background request; stopping")
                    BackgroundServiceDiagnostics.systemRestarted(this)
                    stoppedByUser = true
                    stopSelf()
                    return START_NOT_STICKY
                }

                val notification = createNotification()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    startForeground(NOTIFY_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
                } else {
                    startForeground(NOTIFY_ID, notification)
                }
                NativeLogger.d(TAG, "startForeground called successfully")
                isRunning = true
                BackgroundServiceDiagnostics.started(this)
                BackgroundClipboardMonitor.start(this, CLIPBOARD_MONITOR_OWNER)
                ScreenshotWatcher.start(this)
                startMonitorWatchdog()
            }
            ACTION_STOP -> {
                NativeLogger.d(TAG, "Stopping foreground service (permanent)")
                stoppedByUser = true
                setBackgroundRequested(this, false)
                BackgroundClipboardMonitor.stop(CLIPBOARD_MONITOR_OWNER)
                ScreenshotWatcher.stop()
                if (!isRunning) {
                    val notification = createNotification(getString(R.string.foreground_service_stopping))
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        startForeground(NOTIFY_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
                    } else {
                        startForeground(NOTIFY_ID, notification)
                    }
                }
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopMonitorWatchdog()
                stopSelf()
                isRunning = false
                BackgroundServiceDiagnostics.stoppedPermanently(this)
                // Send event to JS to disable background tasks permanently
                ForegroundServiceModule.sendStopEvent()
            }
            ACTION_TEMP_STOP -> {
                NativeLogger.d(TAG, "Stopping foreground service (temporary)")
                stoppedByUser = true
                setBackgroundRequested(this, false)
                BackgroundClipboardMonitor.stop(CLIPBOARD_MONITOR_OWNER)
                ScreenshotWatcher.stop()
                if (!isRunning) {
                    val notification = createNotification(getString(R.string.foreground_service_stopping))
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        startForeground(NOTIFY_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
                    } else {
                        startForeground(NOTIFY_ID, notification)
                    }
                }
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopMonitorWatchdog()
                stopSelf()
                isRunning = false
                BackgroundServiceDiagnostics.stoppedTemporarily(this)
                // Send temp stop event to JS (no settings change, service restarts next time)
                ForegroundServiceModule.sendTempStopEvent()
            }
            ACTION_UPDATE -> {
                updateNotification(intent.getStringExtra(EXTRA_CONTENT))
            }
            else -> {
                // Unknown action - still need to call startForeground to prevent crash
                val notification = createNotification()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    startForeground(NOTIFY_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
                } else {
                    startForeground(NOTIFY_ID, notification)
                }
                isRunning = true
                BackgroundServiceDiagnostics.started(this)
                BackgroundClipboardMonitor.start(this, CLIPBOARD_MONITOR_OWNER)
                ScreenshotWatcher.start(this)
                startMonitorWatchdog()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        createNotificationChannels()
        if (isRunning) {
            notificationManager?.notify(NOTIFY_ID, createNotification(lastContent))
        }
    }

    /**
     * Android 14+ 回调：dataSync 类型前台服务 6小时/24小时配额耗尽时由系统调用。
     * 若不在此回调中及时停止，系统会强制 ANR 终止进程（不经过 onDestroy 优雅路径）。
     * 处理同用户临时停止：通知 JS 侧重新调度，下次 App 进入前台时重启服务。
     */
    @androidx.annotation.RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    override fun onTimeout(startId: Int) {
        NativeLogger.w(TAG, "dataSync foreground service timed out (6h/24h quota exhausted), stopping gracefully")
        stoppedByUser = true
        stopMonitorWatchdog()
        BackgroundClipboardMonitor.stop(CLIPBOARD_MONITOR_OWNER)
        ScreenshotWatcher.stop()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        isRunning = false
        BackgroundServiceDiagnostics.timedOut(this)
        // 不调用 sendTempStopEvent()：此为系统强制超时，非用户主动停止。
        // 保持 JS 侧 isTempDisabledBackgroundTasks=false，
        // 用户打开 App 后 start() 可自动重试启动服务。
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        NativeLogger.d(TAG, "onTaskRemoved: keeping native clipboard monitor active")
    }

    override fun onDestroy() {
        NativeLogger.d(TAG, "onDestroy called, stoppedByUser=$stoppedByUser, isRunning=$isRunning")
        val wasRunning = isRunning
        stopMonitorWatchdog()
        isRunning = false
        BackgroundClipboardMonitor.stop(CLIPBOARD_MONITOR_OWNER)
        ScreenshotWatcher.stop()
        if (!stoppedByUser && wasRunning) {
            NativeLogger.w(TAG, "Service destroyed unexpectedly; native watchdog will recover on restart")
        }
        BackgroundServiceDiagnostics.destroyed(this, expected = stoppedByUser)
        stoppedByUser = false
        super.onDestroy()
    }

    private fun createNotificationChannels() {
        notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val foregroundChannel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.foreground_service_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.foreground_service_channel_description)
                setShowBadge(false)
            }
            notificationManager?.createNotificationChannel(foregroundChannel)
            // Remove the high-priority recovery channel used by older builds.
            notificationManager?.deleteNotificationChannel(LEGACY_RESTART_CHANNEL_ID)
        }
    }

    private fun startMonitorWatchdog() {
        watchdogHandler.removeCallbacks(monitorWatchdog)
        watchdogHandler.post(monitorWatchdog)
    }

    private fun stopMonitorWatchdog() {
        watchdogHandler.removeCallbacks(monitorWatchdog)
    }

    private fun createNotification(content: String? = null): Notification {
        lastContent = content

        // PendingIntent to open the app when notification is tapped
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingLaunchIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Temp stop action
        val tempStopIntent = Intent(this, SyncForegroundService::class.java).apply {
            action = ACTION_TEMP_STOP
        }
        val tempStopPendingIntent = PendingIntent.getService(
            this, 2, tempStopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Stop action
        val stopIntent = Intent(this, SyncForegroundService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val iconResId = notificationIconResId()

        NativeLogger.d(TAG, "Notification icon resId=$iconResId")

        // 内容以 \n 分割为标题和正文
        val resolvedContent = content ?: getString(R.string.foreground_service_running)
        val lines = resolvedContent.split("\n", limit = 2)
        val title = lines[0]
        val body = if (lines.size > 1) lines[1] else ""

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(iconResId)
            .setContentIntent(pendingLaunchIntent)
            .setOngoing(true)
            .setSilent(true)
            .addAction(
                0,
                getString(R.string.foreground_service_action_temp_stop),
                tempStopPendingIntent
            )
            .addAction(
                0,
                getString(R.string.foreground_service_action_stop),
                stopPendingIntent
            )
            .setStyle(NotificationCompat.BigTextStyle()
                .setBigContentTitle(title)
                .bigText(body)
            )
            .build()
    }

    private fun updateNotification(content: String?) {
        val notification = createNotification(content)
        notificationManager?.notify(NOTIFY_ID, notification)
    }

    private fun notificationIconResId(): Int {
        val resources = applicationContext.resources
        return resources.getIdentifier(
            "ic_launcher_monochrome", "mipmap", packageName
        ).takeIf { it != 0 }
            ?: resources.getIdentifier("ic_notification", "drawable", packageName)
                .takeIf { it != 0 }
            ?: android.R.drawable.ic_menu_info_details
    }
}
