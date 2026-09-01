package net.opentkd.freeplay.network.protocol

object FreePlayProtocol {
    const val PROTOCOL_NAME = "freeplay-ingest"
    const val PROTOCOL_VERSION = 1
    const val HEADER_SIZE = 32
    const val MAGIC = 0x46505631 // "FPV1"
}
