package com.ganalunes.sdrserver.server

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.DataInputStream
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class MultiClientSdrServerTest {
    @Test
    fun multipleClientsConnectAndDisconnectWithoutKillingServer() {
        val port = 19191
        val events = mutableListOf<String>()
        val server = MultiClientSdrServer(
            port = port,
            sampleRate = 250_000,
            centerFrequency = 100_000_000L,
            onStats = {},
            onLog = { events.add(it) }
        )
        server.start()
        try {
            val connected = AtomicInteger(0)
            val latch = CountDownLatch(4)
            val threads = (1..4).map {
                Thread {
                    try {
                        Socket("127.0.0.1", port).use { sock ->
                            sock.soTimeout = 3000
                            val inp = DataInputStream(sock.getInputStream())
                            val magic = ByteArray(4)
                            inp.readFully(magic)
                            assertTrue(String(magic) == "RTL0")
                            inp.readInt()
                            inp.readInt()
                            connected.incrementAndGet()
                            // Read some IQ then disconnect
                            val buf = ByteArray(4096)
                            inp.read(buf)
                            Thread.sleep(80)
                        }
                    } finally {
                        latch.countDown()
                    }
                }.also { it.start() }
            }
            assertTrue(latch.await(8, TimeUnit.SECONDS))
            threads.forEach { it.join(2000) }
            assertTrue("expected >=4 connects, got ${connected.get()}", connected.get() >= 4)

            // Server must still accept after mass disconnect
            Socket("127.0.0.1", port).use { sock ->
                sock.soTimeout = 3000
                val inp = DataInputStream(sock.getInputStream())
                val magic = ByteArray(4)
                inp.readFully(magic)
                assertTrue(String(magic) == "RTL0")
            }
        } finally {
            server.shutdown()
        }
    }
}
