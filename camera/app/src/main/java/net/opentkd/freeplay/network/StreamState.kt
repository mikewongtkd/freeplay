package net.opentkd.freeplay.network

enum class StreamState(val wireName: String) {
    IDLE("idle"),
    STARTING("starting"),
    STREAMING("streaming"),
    STOPPING("stopping"),
    ERROR("error")
}
