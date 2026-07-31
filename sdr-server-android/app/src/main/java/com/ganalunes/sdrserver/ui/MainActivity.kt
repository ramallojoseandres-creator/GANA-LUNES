package com.ganalunes.sdrserver.ui

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.ganalunes.sdrserver.R
import com.ganalunes.sdrserver.databinding.ActivityMainBinding
import com.ganalunes.sdrserver.server.ServerStats
import com.ganalunes.sdrserver.service.SdrServerService
import java.util.Locale

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private var service: SdrServerService? = null
    private var bound = false
    private var running = false

    private val statsListener: (ServerStats) -> Unit = { stats ->
        runOnUiThread { render(stats) }
    }

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            val local = binder as SdrServerService.LocalBinder
            service = local.getService()
            bound = true
            service?.addListener(statsListener)
            running = service?.isRunning() == true
            updateToggleUi()
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            service?.removeListener(statsListener)
            service = null
            bound = false
            running = false
            updateToggleUi()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        requestNotificationPermission()

        binding.toggleButton.setOnClickListener {
            if (running) stopServer() else startServer()
        }
        binding.copyButton.setOnClickListener { copyEndpoint() }

        SdrServerService.latestStats?.let { render(it) }
        updateToggleUi()
    }

    override fun onStart() {
        super.onStart()
        bindService(
            Intent(this, SdrServerService::class.java),
            connection,
            Context.BIND_AUTO_CREATE
        )
    }

    override fun onStop() {
        if (bound) {
            service?.removeListener(statsListener)
            unbindService(connection)
            bound = false
        }
        super.onStop()
    }

    private fun startServer() {
        val port = binding.portInput.text.toString().toIntOrNull() ?: 1234
        val rate = binding.sampleRateInput.text.toString().toIntOrNull() ?: 2_048_000
        val freq = binding.frequencyInput.text.toString().toLongOrNull() ?: 100_000_000L

        if (port !in 1024..65535) {
            Toast.makeText(this, "Puerto inválido (1024-65535)", Toast.LENGTH_SHORT).show()
            return
        }

        val intent = Intent(this, SdrServerService::class.java).apply {
            action = SdrServerService.ACTION_START
            putExtra(SdrServerService.EXTRA_PORT, port)
            putExtra(SdrServerService.EXTRA_SAMPLE_RATE, rate)
            putExtra(SdrServerService.EXTRA_FREQUENCY, freq)
        }
        ContextCompat.startForegroundService(this, intent)
        running = true
        updateToggleUi()
        binding.logText.text = "Iniciando servidor…"
        setInputsEnabled(false)
    }

    private fun stopServer() {
        val intent = Intent(this, SdrServerService::class.java).apply {
            action = SdrServerService.ACTION_STOP
        }
        startService(intent)
        running = false
        updateToggleUi()
        setInputsEnabled(true)
        binding.statusText.text = getString(R.string.status_stopped)
        binding.statusText.setTextColor(ContextCompat.getColor(this, R.color.warn))
        binding.clientsText.text = "Clientes conectados: 0"
    }

    private fun render(stats: ServerStats) {
        running = stats.running
        updateToggleUi()
        setInputsEnabled(!stats.running)

        if (stats.running) {
            binding.statusText.text = getString(R.string.status_running)
            binding.statusText.setTextColor(ContextCompat.getColor(this, R.color.accent))
            binding.endpointText.text = "${stats.bindIp}:${stats.port}"
            binding.portInput.setText(stats.port.toString())
        } else {
            binding.statusText.text = getString(R.string.status_stopped)
            binding.statusText.setTextColor(ContextCompat.getColor(this, R.color.warn))
            if (stats.port > 0 && stats.bindIp != "—") {
                binding.endpointText.text = "${stats.bindIp}:${stats.port}"
            }
        }

        binding.clientsText.text = "Clientes conectados: ${stats.clients}"
        val mb = stats.bytesSent / (1024.0 * 1024.0)
        binding.bytesText.text = String.format(Locale.US, "IQ enviados: %.2f MB", mb)
        val logs = SdrServerService.latestLogs.takeLast(6).joinToString("\n")
        binding.logText.text = if (logs.isBlank()) stats.lastEvent else logs
    }

    private fun updateToggleUi() {
        if (running) {
            binding.toggleButton.text = getString(R.string.stop_server)
            binding.toggleButton.setBackgroundResource(R.drawable.bg_button_stop)
            binding.toggleButton.setTextColor(ContextCompat.getColor(this, R.color.danger))
        } else {
            binding.toggleButton.text = getString(R.string.start_server)
            binding.toggleButton.setBackgroundResource(R.drawable.bg_button_primary)
            binding.toggleButton.setTextColor(ContextCompat.getColor(this, R.color.bg_deep))
        }
    }

    private fun setInputsEnabled(enabled: Boolean) {
        binding.portInput.isEnabled = enabled
        binding.sampleRateInput.isEnabled = enabled
        binding.frequencyInput.isEnabled = enabled
    }

    private fun copyEndpoint() {
        val text = binding.endpointText.text?.toString().orEmpty()
        if (text.isBlank() || text == "—") {
            Toast.makeText(this, "No hay IP:puerto aún", Toast.LENGTH_SHORT).show()
            return
        }
        val clipboard = getSystemService(ClipboardManager::class.java)
        clipboard.setPrimaryClip(ClipData.newPlainText("SDR endpoint", text))
        Toast.makeText(this, R.string.copied, Toast.LENGTH_SHORT).show()
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED
        ) return
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            1001
        )
    }
}
