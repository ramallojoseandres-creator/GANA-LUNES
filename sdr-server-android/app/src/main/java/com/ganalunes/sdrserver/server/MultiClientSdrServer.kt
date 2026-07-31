package com.ganalunes.sdrserver.server

import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

data class ServerStats(
    val running: Boolean,
    val bindIp: String,
    val port: Int,
    val clients: Int,
    val bytesSent: Long,
    val lastEvent: String
)

/**
 * Servidor estilo rtl_tcp multi-cliente.
 * Un productor IQ alimenta a todos los sockets; fallos de un cliente
 * se aíslan y no derriban el acceptor ni al resto.
 */
class MultiClientSdrServer(
    private val port: Int,
    private val sampleRate: Int,
    private val centerFrequency: Long,
    private val onStats: (ServerStats) -> Unit,
    private val onLog: (String) -> Unit
) {
    companion object {
        private const val TUNER_R820T = 5
        private const val GAIN_COUNT = 29
        private const val CHUNK_SAMPLES = 16_384 // IQ pairs -> 32KB
    }

    private val running = AtomicBoolean(false)
    private val clients = ConcurrentHashMap<Int, ClientSession>()
    private val nextId = AtomicInteger(1)
    private val bytesSent = AtomicLong(0)
    private val source = IqSampleSource(sampleRate).also {
        it.centerFrequencyHz = centerFrequency
    }

    private var serverSocket: ServerSocket? = null
    private val acceptExecutor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "sdr-accept").apply { isDaemon = true }
    }
    private val streamExecutor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "sdr-stream").apply { isDaemon = true; priority = Thread.MAX_PRIORITY }
    }
    private val clientExecutor = Executors.newCachedThreadPool { r ->
        Thread(r, "sdr-client").apply { isDaemon = true }
    }

    @Volatile
    private var bindIp: String = "0.0.0.0"

    @Volatile
    private var lastEvent: String = "Iniciando…"

    fun start() {
        if (!running.compareAndSet(false, true)) return
        try {
            val ss = ServerSocket(port, 64, InetAddress.getByName("0.0.0.0")).also {
                it.reuseAddress = true
                it.soTimeout = 0
            }
            serverSocket = ss
            bindIp = detectLanIp()
            lastEvent = "Escuchando en $bindIp:$port"
            onLog(lastEvent)
            publish()
            acceptExecutor.execute { acceptLoop(ss) }
            streamExecutor.execute { streamLoop() }
        } catch (t: Throwable) {
            running.set(false)
            lastEvent = "Error al abrir puerto $port: ${t.message}"
            onLog(lastEvent)
            publish()
            throw t
        }
    }

    fun stop() {
        if (!running.compareAndSet(true, false)) return
        lastEvent = "Deteniendo…"
        onLog(lastEvent)
        publish()
        try {
            serverSocket?.close()
        } catch (_: Throwable) {
        }
        serverSocket = null
        clients.values.toList().forEach { dropClient(it.id, "servidor detenido") }
        clients.clear()
        lastEvent = "Detenido"
        onLog(lastEvent)
        publish()
    }

    fun shutdown() {
        stop()
        acceptExecutor.shutdownNow()
        streamExecutor.shutdownNow()
        clientExecutor.shutdownNow()
    }

    private fun acceptLoop(ss: ServerSocket) {
        while (running.get()) {
            try {
                val socket = ss.accept()
                socket.tcpNoDelay = true
                socket.keepAlive = true
                socket.soTimeout = 0
                val id = nextId.getAndIncrement()
                val session = ClientSession(id, socket)
                clients[id] = session
                lastEvent = "Cliente #$id ${socket.inetAddress.hostAddress} conectado"
                onLog(lastEvent)
                publish()
                clientExecutor.execute { handleClient(session) }
            } catch (_: SocketException) {
                if (!running.get()) break
            } catch (t: Throwable) {
                if (!running.get()) break
                onLog("Aviso accept: ${t.message}")
            }
        }
    }

    private fun handleClient(session: ClientSession) {
        try {
            val out = DataOutputStream(BufferedOutputStream(session.socket.getOutputStream(), 64 * 1024))
            val inp = DataInputStream(BufferedInputStream(session.socket.getInputStream(), 8 * 1024))
            session.out = out

            // Cabecera rtl_tcp: "RTL0" + tuner + gain count
            out.writeBytes("RTL0")
            out.writeInt(TUNER_R820T)
            out.writeInt(GAIN_COUNT)
            out.flush()

            while (running.get() && !session.closed.get()) {
                // Comandos rtl_tcp: 1 byte cmd + 4 bytes arg (big-endian)
                val cmd = inp.read()
                if (cmd < 0) break
                val arg = inp.readInt()
                applyCommand(session.id, cmd, arg)
            }
        } catch (_: Throwable) {
            // Desconexión / error de cliente: no tumba el servidor
        } finally {
            dropClient(session.id, "desconectado")
        }
    }

    private fun applyCommand(clientId: Int, cmd: Int, arg: Int) {
        when (cmd) {
            0x01 -> { // set frequency
                source.centerFrequencyHz = arg.toLong() and 0xFFFFFFFFL
                onLog("Cliente #$clientId freq=${source.centerFrequencyHz} Hz")
            }
            0x02 -> { // set sample rate
                source.updateSampleRate(arg)
                onLog("Cliente #$clientId rate=${source.sampleRateHz} Hz")
            }
            0x04 -> { // set gain
                source.gainTenthsDb = arg
                onLog("Cliente #$clientId gain=${arg / 10.0} dB")
            }
            0x05 -> { // freq correction ppm
                onLog("Cliente #$clientId ppm=$arg")
            }
            0x0e -> { // set bias tee
                onLog("Cliente #$clientId biasTee=$arg")
            }
            else -> {
                // Ignorar comandos desconocidos: evita crash por clientes raros
            }
        }
        publish()
    }

    private fun streamLoop() {
        val buffer = ByteArray(CHUNK_SAMPLES * 2)
        while (running.get()) {
            try {
                source.fill(buffer)
                val snapshot = clients.values.toList()
                if (snapshot.isEmpty()) {
                    Thread.sleep(20)
                    continue
                }
                for (session in snapshot) {
                    if (session.closed.get()) continue
                    try {
                        val out = session.out ?: continue
                        out.write(buffer)
                        out.flush()
                        bytesSent.addAndGet(buffer.size.toLong())
                    } catch (_: Throwable) {
                        dropClient(session.id, "escritura fallida")
                    }
                }
                // Ritmo aproximado según sample rate
                val bytesPerSec = source.sampleRateHz.toLong() * 2L
                val sleepMs = ((buffer.size.toLong() * 1000L) / bytesPerSec.coerceAtLeast(1)).coerceIn(1, 40)
                Thread.sleep(sleepMs)
                publish()
            } catch (t: Throwable) {
                if (!running.get()) break
                onLog("Aviso stream: ${t.message}")
                try {
                    Thread.sleep(50)
                } catch (_: InterruptedException) {
                    break
                }
            }
        }
    }

    private fun dropClient(id: Int, reason: String) {
        val session = clients.remove(id) ?: return
        session.closed.set(true)
        try {
            session.out?.flush()
        } catch (_: Throwable) {
        }
        try {
            session.socket.close()
        } catch (_: Throwable) {
        }
        lastEvent = "Cliente #$id $reason"
        onLog(lastEvent)
        publish()
    }

    private fun publish() {
        onStats(
            ServerStats(
                running = running.get(),
                bindIp = bindIp,
                port = port,
                clients = clients.size,
                bytesSent = bytesSent.get(),
                lastEvent = lastEvent
            )
        )
    }

    private fun detectLanIp(): String {
        return try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
            for (nif in interfaces) {
                if (!nif.isUp || nif.isLoopback) continue
                for (addr in nif.inetAddresses) {
                    if (addr is java.net.Inet4Address && !addr.isLoopbackAddress) {
                        return addr.hostAddress ?: continue
                    }
                }
            }
            "127.0.0.1"
        } catch (_: Throwable) {
            "127.0.0.1"
        }
    }

    private class ClientSession(
        val id: Int,
        val socket: Socket
    ) {
        val closed = AtomicBoolean(false)
        @Volatile var out: DataOutputStream? = null
    }
}
