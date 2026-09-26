package net.opentkd.freeplay.network

import net.opentkd.freeplay.network.protocol.FreePlayControlMessage
import org.junit.Assert.*
import org.junit.Test

class CommandIdempotencyCacheTest {

    @Test
    fun testCacheAndRetrieveCommandAck() {
        val cache = CommandIdempotencyCache(ttlMs = 120_000L)
        val commandId = "cmd-12345"
        val ack = FreePlayControlMessage.CommandAck(
            commandId = commandId,
            accepted = true,
            streamState = "starting"
        )

        assertNull(cache.get(commandId))

        cache.put(commandId, ack)

        val retrieved = cache.get(commandId)
        assertNotNull(retrieved)
        assertEquals(commandId, retrieved!!.commandId)
        assertTrue(retrieved.accepted)
        assertEquals("starting", retrieved.streamState)
    }

    @Test
    fun testCacheExpiration() {
        // Fast TTL of 10ms for testing
        val cache = CommandIdempotencyCache(ttlMs = 10L)
        val commandId = "cmd-expired"
        val ack = FreePlayControlMessage.CommandAck(
            commandId = commandId,
            accepted = true,
            streamState = "starting"
        )

        cache.put(commandId, ack)
        assertNotNull(cache.get(commandId))

        Thread.sleep(20)

        assertNull(cache.get(commandId))
    }
}
