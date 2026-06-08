
package com.example.webrtcserver
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.widget.TextView
import java.net.ServerSocket
import kotlin.concurrent.thread

class MainActivity: AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        val tv=findViewById<TextView>(R.id.tv)
        tv.text="HTTP API on :8080"
        thread {
            val server=ServerSocket(8080)
            while(true){
                val s=server.accept()
                val out=s.getOutputStream()
                val body="{\"status\":\"running\",\"note\":\"starter project\"}"
                val resp="HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.toByteArray().size}\r\n\r\n$body"
                out.write(resp.toByteArray())
                out.flush()
                s.close()
            }
        }
    }
}
