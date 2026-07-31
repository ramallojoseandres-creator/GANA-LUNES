package com.ganalunes.sdrserver.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.ganalunes.sdrserver.R
import com.ganalunes.sdrserver.server.MultiClientSdrServer
import com.ganalunes.sdrserver.server.ServerStats
import com.ganalunes.sdrserver.ui.MainActivity
import java.util.concurrent.CopyOnWriteArrayList

class SdrServerService : Service() {
    companion object {
        const val CHANNEL_ID = "sdr_server_channel"
        const val NOTIFICATION_ID = 42
        const val ACTION_START = "com.ganalunes.sdrserver.START"
        const val ACTION_STOP = "com.ganalunes.sdrserver.STOP"
        const val EXTRA_PORT = "port"
        const val EXTRA_SAMPLE_RATE = "sample_rate"
        const val EXTRA_FREQUENCY = "frequency"

        @Volatile
        var latestStats: ServerStats? = null
            private set

        @Volatile
        var latestLogs: List<String> = emptyList()
            private set
    }

    private val binder = LocalBinder()
    private var server: MultiClientSdrServer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val listeners = CopyOnWriteArrayList<(ServerStats) -> Unit>()
    private val logBuffer = ArrayDeque<String>(64)

    inner class LocalBinder : Binder() {
        fun getService(): SdrServerService = this@SdrServerService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopServerInternal()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            ACTION_START, null -> {
                val port = intent?.getIntExtra(EXTRA_PORT, 1234) ?: 1234
                val rate = intent?.getIntExtra(EXTRA_SAMPLE_RATE, 2_048_000) ?: 2_048_000
                val freq = intent?.getLongExtra(EXTRA_FREQUENCY, 100_000_000L) ?: 100_000_000L
                startServerInternal(port, rate, freq)
            }
        }
        return START_STICKY
    }

    fun addListener(listener: (ServerStats) -> Unit) {
        listeners.add(listener)
        latestStats?.let(listener)
    }

    fun removeListener(listener: (ServerStats) -> Unit) {
        listeners.remove(listener)
    }

    fun isRunning(): Boolean = server != null

    private fun startServerInternal(port: Int, sampleRate: Int, frequency: Long) {
        if (server != null) return
        acquireWakeLock()
        val notification = buildNotification("0.0.0.0", port, 0)
        startForeground(NOTIFICATION_ID, notification)

        val s = MultiClientSdrServer(
            port = port,
            sampleRate = sampleRate,
            centerFrequency = frequency,
            onStats = { stats ->
                latestStats = stats
                listeners.forEach { runCatching { it(stats) } }
                updateNotification(stats)
            },
            onLog = { msg ->
                synchronized(logBuffer) {
                    if (logBuffer.size >= 40) logBuffer.removeFirst()
                    logBuffer.addLast(msg)
                    latestLogs = logBuffer.toList()
                }
            }
        )
        try {
            s.start()
            server = s
        } catch (t: Throwable) {
            appendLog("Fallo al iniciar: ${t.message}")
            s.shutdown()
            server = null
            releaseWakeLock()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    private fun stopServerInternal() {
        server?.shutdown()
        server = null
        releaseWakeLock()
        val stopped = ServerStats(
            running = false,
            bindIp = latestStats?.bindIp ?: "—",
            port = latestStats?.port ?: 0,
            clients = 0,
            bytesSent = latestStats?.bytesSent ?: 0L,
            lastEvent = "Detenido"
        )
        latestStats = stopped
        listeners.forEach { runCatching { it(stopped) } }
        appendLog("Servidor detenido")
    }

    private fun appendLog(msg: String) {
        synchronized(logBuffer) {
            if (logBuffer.size >= 40) logBuffer.removeFirst()
            logBuffer.addLast(msg)
            latestLogs = logBuffer.toList()
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notification_channel),
            NotificationManager.IMPORTANCE_LOW
        )
        mgr.createNotificationChannel(channel)
    }

    private fun buildNotification(ip: String, port: Int, clients: Int): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stop = PendingIntent.getService(
            this,
            1,
            Intent(this, SdrServerService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text, ip, port, clients))
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentIntent(open)
            .addAction(0, getString(R.string.stop_server), stop)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
    }

    private fun updateNotification(stats: ServerStats) {
        if (!stats.running) return
        val mgr = getSystemService(NotificationManager::class.java)
        mgr.notify(
            NOTIFICATION_ID,
            buildNotification(stats.bindIp, stats.port, stats.clients)
        )
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SdrServer::Iq").also {
            it.setReferenceCounted(false)
            it.acquire(6 * 60 * 60 * 1000L)
        }
    }

    private fun releaseWakeLock() {
        runCatching {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        }
        wakeLock = null
    }

    override fun onDestroy() {
        stopServerInternal()
        super.onDestroy()
    }
}
