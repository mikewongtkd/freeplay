package net.opentkd.freeplay.network

sealed interface TransportState {
    data object STOPPED : TransportState // Keeping name compatible with previous enum where possible
    data object CONNECTING : TransportState
    data object AWAITING_HELLO_ACK : TransportState
    data object AWAITING_CODEC_CONFIG : TransportState
    data object STREAMING : TransportState
    data class RECONNECTING(val attempt: Int) : TransportState
    data class REJECTED(val reason: String) : TransportState
    data class ERROR(val message: String) : TransportState
    data object WARNING : TransportState // For compatibility
}
