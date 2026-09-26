package net.opentkd.freeplay.network

sealed interface TransportState {
    data object Disconnected : TransportState
    data object Connecting : TransportState
    data object AwaitingHelloAck : TransportState
    data object RegisteredIdle : TransportState
    data object RegisteredStreaming : TransportState
    data class Reconnecting(val attempt: Int) : TransportState
    data class Rejected(val reason: String) : TransportState
    data class Error(val message: String) : TransportState

    val wireName: String
        get() = when (this) {
            is Disconnected -> "disconnected"
            is Connecting -> "connecting"
            is AwaitingHelloAck -> "awaiting_hello_ack"
            is RegisteredIdle -> "registered"
            is RegisteredStreaming -> "registered"
            is Reconnecting -> "reconnecting"
            is Rejected -> "rejected"
            is Error -> "error"
        }
}
