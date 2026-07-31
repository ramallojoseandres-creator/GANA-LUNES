package com.ganalunes.sdrserver.server

import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/**
 * Generador IQ unsigned-8 compatible con rtl_tcp.
 * Produce un tono CW + ruido para que clientes reales puedan conectar
 * y verificar multi-cliente sin hardware USB.
 */
class IqSampleSource(
    sampleRateHz: Int,
    private val toneOffsetHz: Double = 50_000.0
) {
    @Volatile
    var sampleRateHz: Int = sampleRateHz.coerceIn(250_000, 3_200_000)
        private set

    @Volatile
    var centerFrequencyHz: Long = 100_000_000L

    @Volatile
    var gainTenthsDb: Int = 200

    private val phase = AtomicLong(0)
    private val rnd = Random(7)
    private val frames = AtomicInteger(0)

    fun updateSampleRate(rate: Int) {
        sampleRateHz = rate.coerceIn(250_000, 3_200_000)
    }

    fun fill(buffer: ByteArray) {
        val rate = sampleRateHz.toDouble().coerceAtLeast(1.0)
        val omega = 2.0 * PI * toneOffsetHz / rate
        val amp = (40 + (gainTenthsDb.coerceIn(0, 496) / 10)).coerceAtMost(110)
        var p = phase.get()
        var i = 0
        while (i + 1 < buffer.size) {
            val angle = omega * p
            val iSample = (127 + amp * cos(angle) + rnd.nextInt(-6, 7)).toInt().coerceIn(0, 255)
            val qSample = (127 + amp * sin(angle) + rnd.nextInt(-6, 7)).toInt().coerceIn(0, 255)
            buffer[i] = iSample.toByte()
            buffer[i + 1] = qSample.toByte()
            p++
            i += 2
        }
        phase.set(p)
        frames.incrementAndGet()
    }
}
