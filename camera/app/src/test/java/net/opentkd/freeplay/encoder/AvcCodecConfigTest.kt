package net.opentkd.freeplay.encoder

import org.junit.Assert.*
import org.junit.Test

class AvcCodecConfigTest {

    @Test
    fun testStripStartCode4() {
        val input = byteArrayOf(0, 0, 0, 1, 7, 8, 9)
        val expected = byteArrayOf(7, 8, 9)
        assertArrayEquals(expected, AvcNormalization.stripStartCode(input))
    }

    @Test
    fun testStripStartCode3() {
        val input = byteArrayOf(0, 0, 1, 7, 8, 9)
        val expected = byteArrayOf(7, 8, 9)
        assertArrayEquals(expected, AvcNormalization.stripStartCode(input))
    }

    @Test
    fun testStripNoStartCode() {
        val input = byteArrayOf(7, 8, 9)
        val expected = byteArrayOf(7, 8, 9)
        assertArrayEquals(expected, AvcNormalization.stripStartCode(input))
    }

    @Test
    fun testParseCombined() {
        val sps = byteArrayOf(1, 2, 3)
        val pps = byteArrayOf(4, 5)
        val input = byteArrayOf(0, 0, 0, 1) + sps + byteArrayOf(0, 0, 0, 1) + pps
        
        val result = AvcNormalization.parseCombined(input)
        assertNotNull(result)
        assertArrayEquals(sps, result!!.first)
        assertArrayEquals(pps, result!!.second)
    }

    @Test
    fun testParseCombinedMixedStartCodes() {
        val sps = byteArrayOf(1, 2, 3)
        val pps = byteArrayOf(4, 5)
        val input = byteArrayOf(0, 0, 0, 1) + sps + byteArrayOf(0, 0, 1) + pps
        
        val result = AvcNormalization.parseCombined(input)
        assertNotNull(result)
        assertArrayEquals(sps, result!!.first)
        assertArrayEquals(pps, result!!.second)
    }

    @Test
    fun testToAnnexBPayload() {
        val sps = byteArrayOf(1, 2, 3)
        val pps = byteArrayOf(4, 5)
        val config = AvcCodecConfig(sps, pps)
        
        val expected = byteArrayOf(0, 0, 0, 1) + sps + byteArrayOf(0, 0, 0, 1) + pps
        assertArrayEquals(expected, config.toAnnexBPayload())
    }
}
