package expo.modules.alpinefilmdlna

import com.sun.net.httpserver.HttpServer
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.*
import org.junit.Test

class VideoRelayTest {
  private val loopback = InetAddress.getByName("127.0.0.1")
  private val payload = "0123456789abcdefghijklmnopqrstuvwxyz".toByteArray()

  private fun origin(block: (URL, AtomicInteger) -> Unit) {
    val server = HttpServer.create(InetSocketAddress(loopback, 0), 0)
    val requests = AtomicInteger()
    server.createContext("/movie") { exchange ->
      requests.incrementAndGet()
      if (exchange.requestURI.query == "redirect") {
        exchange.responseHeaders.set("Location", "/private")
        exchange.sendResponseHeaders(302, -1)
      } else {
        val range = exchange.requestHeaders.getFirst("Range")
        val start = if (range == "bytes=10-15") 10 else 0
        val end = if (range == "bytes=10-15") 15 else payload.size - 1
        val body = payload.copyOfRange(start, end + 1)
        if (range != null) exchange.responseHeaders.set("Content-Range", "bytes $start-$end/${payload.size}")
        exchange.responseHeaders.set("Content-Type", "video/mp4")
        exchange.responseHeaders.set("Content-Length", body.size.toString())
        exchange.sendResponseHeaders(if (range == null) 200 else 206, if (exchange.requestMethod == "HEAD") -1 else body.size.toLong())
        if (exchange.requestMethod != "HEAD") exchange.responseBody.use { it.write(body) }
      }
      exchange.close()
    }
    server.createContext("/private") { requests.addAndGet(100); it.sendResponseHeaders(200, -1); it.close() }
    server.start()
    try { block(URL("http://127.0.0.1:${server.address.port}/movie?token=private"), requests) }
    finally { server.stop(0) }
  }

  private fun fetch(url: String, method: String = "GET", extra: String = ""): Pair<String, ByteArray> {
    val target = URL(url)
    Socket(loopback, target.port).use { socket ->
      socket.soTimeout = 3000
      socket.getOutputStream().write("$method ${target.file} HTTP/1.1\r\nHost: ${target.host}\r\n${extra}Connection: close\r\n\r\n".toByteArray())
      val all = socket.getInputStream().readBytes()
      val text = String(all, Charsets.ISO_8859_1)
      val split = text.indexOf("\r\n\r\n")
      check(split >= 0)
      return text.substring(0, split) to all.copyOfRange(split + 4, all.size)
    }
  }

  @Test fun getHeadAndRangePreserveVideoBytes() = origin { url, requests ->
    VideoRelay(loopback, loopback, url, System.currentTimeMillis() + 60000).use { relay ->
      val get = fetch(relay.url)
      assertTrue(get.first.startsWith("HTTP/1.1 200"))
      assertArrayEquals(payload, get.second)
      val head = fetch(relay.url, "HEAD")
      assertTrue(head.first.contains("Content-Length: ${payload.size}"))
      assertEquals(0, head.second.size)
      val range = fetch(relay.url, extra = "Range: bytes=10-15\r\n")
      assertTrue(range.first.startsWith("HTTP/1.1 206"))
      assertTrue(range.first.contains("Content-Range: bytes 10-15/${payload.size}"))
      assertArrayEquals(payload.copyOfRange(10, 16), range.second)
      assertFalse(relay.url.contains("token=private"))
      assertEquals(3, requests.get())
    }
  }

  @Test fun arbitraryPathsMethodsAndMalformedRangesNeverReachOrigin() = origin { url, requests ->
    VideoRelay(loopback, loopback, url, System.currentTimeMillis() + 60000).use { relay ->
      assertTrue(fetch(relay.url + "?url=http://other/").first.startsWith("HTTP/1.1 404"))
      assertTrue(fetch(relay.url, "POST").first.startsWith("HTTP/1.1 405"))
      assertTrue(fetch(relay.url, extra = "Range: bytes=0-1,2-3\r\n").first.startsWith("HTTP/1.1 400"))
      assertEquals(0, requests.get())
    }
  }

  @Test fun renewalKeepsLocalUrlAndCannotChangeMovie() = origin { url, _ ->
    VideoRelay(loopback, loopback, url, System.currentTimeMillis() + 60000).use { relay ->
      val stable = relay.url
      relay.updateSource(URL(url.toString().replace("private", "renewed")), System.currentTimeMillis() + 120000)
      assertEquals(stable, relay.url)
      assertArrayEquals(payload, fetch(relay.url).second)
      assertThrows(IllegalArgumentException::class.java) {
        relay.updateSource(URL(url, "/private"), System.currentTimeMillis() + 120000)
      }
    }
  }

  @Test fun redirectsAreNotFollowed() = origin { url, requests ->
    VideoRelay(loopback, loopback, URL(url.toString().substringBefore('?') + "?redirect"), System.currentTimeMillis() + 60000).use { relay ->
      assertTrue(fetch(relay.url).first.startsWith("HTTP/1.1 502"))
      assertEquals(1, requests.get())
    }
  }

  @Test fun onlySelectedTvCanReadAndCloseRevokesListener() = origin { url, requests ->
    val relay = VideoRelay(loopback, InetAddress.getByName("127.0.0.2"), url, System.currentTimeMillis() + 60000)
    try {
      assertThrows(Exception::class.java) { fetch(relay.url) }
      assertEquals(0, requests.get())
    } finally { relay.close() }
    assertFalse(relay.active)
    assertThrows(Exception::class.java) { fetch(relay.url) }
  }
}
