package net.opentkd.freeplay.network

import android.os.SystemClock
import net.opentkd.freeplay.network.protocol.FreePlayControlMessage
import java.util.concurrent.ConcurrentHashMap

class CommandIdempotencyCache(private val ttlMs: Long = 120_000L) {
    private data class CachedEntry(
        val timestamp: Long,
        val ack: FreePlayControlMessage.CommandAck
    )

    private val cache = ConcurrentHashMap<String, CachedEntry>()

    fun get(commandId: String): FreePlayControlMessage.CommandAck? {
        cleanUp()
        return cache[commandId]?.ack
    }

    fun put(commandId: String, ack: FreePlayControlMessage.CommandAck) {
        cleanUp()
        cache[commandId] = CachedEntry(getMonotonicTimeMs(), ack)
    }

    private fun cleanUp() {
        val now = getMonotonicTimeMs()
        cache.entries.removeIf { now - it.value.timestamp > ttlMs }
    }

    private fun getMonotonicTimeMs(): Long {
        return try {
            SystemClock.elapsedRealtime()
        } catch (e: Exception) {
            System.currentTimeMillis()
        }
    }
}
