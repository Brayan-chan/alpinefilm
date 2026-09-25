package expo.modules.alpinefilmdlna

import java.io.BufferedInputStream
import java.io.Closeable
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.util.UUID
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.SynchronousQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/** A single-movie, single-TV HTTP relay. No files or account credentials are served. */
internal class VideoRelay(
  address: InetAddress,
  private val receiver: InetAddress,
  source: URL,
  expiresAt: Long,
) : Closeable {
  private data class Source(val url: URL, val expiresAt: Long)
  @Volatile private var current = Source(validate(source), expiresAt)
  private val server = ServerSocket()
  private val clients = ConcurrentHashMap.newKeySet<Socket>()
  private val upstreams = ConcurrentHashMap.newKeySet<HttpURLConnection>()
  private val workers = ThreadPoolExecutor(0, 4, 30, TimeUnit.SECONDS, SynchronousQueue<Runnable>(),
    { task -> Thread(task, "AlpineFilm-video").apply { isDaemon = true } })
  private val expiry = Executors.newSingleThreadScheduledExecutor { task ->
    Thread(task, "AlpineFilm-expiry").apply { isDaemon = true }
  }
  private val route = "/${UUID.randomUUID()}/video.mp4"
  val bytesSent = AtomicLong(0)
  @Volatile var lastError = ""
    private set
  val url: String
  val active: Boolean get() = !server.isClosed

  init {
    require(expiresAt > System.currentTimeMillis()) { "El permiso de reproducción ya caducó" }
    try {
      server.reuseAddress = true
      server.bind(InetSocketAddress(address, 0), 8)
      url = "http://${address.hostAddress}:${server.localPort}$route"
      Thread({
        while (!server.isClosed) {
          try {
            val client = server.accept()
            if (client.inetAddress != receiver) { client.close(); continue }
            clients.add(client)
            try { workers.execute { serve(client) } }
            catch (_: Exception) { clients.remove(client); client.close() }
          } catch (_: Exception) { if (!server.isClosed) lastError = "No se pudo recibir la conexión de la TV." }
        }
      }, "AlpineFilm-listener").apply { isDaemon = true; start() }
      expiry.schedule({ close() }, 6, TimeUnit.HOURS)
    } catch (e: Exception) { close(); throw e }
  }

  fun updateSource(url: URL, expiresAt: Long) {
    val previous = current.url
    require(url.protocol == previous.protocol && url.host == previous.host &&
      url.port == previous.port && url.path == previous.path) { "La renovación cambió de película" }
    require(expiresAt > System.currentTimeMillis()) { "El permiso de reproducción ya caducó" }
    current = Source(validate(url), expiresAt)
  }

  private fun serve(client: Socket) {
    var upstream: HttpURLConnection? = null
    var headersSent = false
    try {
      client.soTimeout = 10000
      client.tcpNoDelay = true
      val input = BufferedInputStream(client.getInputStream())
      var headerBytes = 0
      fun line(): String {
        val result = StringBuilder()
        while (true) {
          val c = input.read()
          require(c >= 0 && ++headerBytes <= 16384) { "Invalid HTTP headers" }
          if (c == 10) return result.toString().removeSuffix("\r")
          require(c == 13 || c in 32..126) { "Invalid HTTP headers" }
          result.append(c.toChar())
        }
      }
      val first = line().split(' ')
      if (first.size != 3 || first[1] != route || first[2] !in listOf("HTTP/1.0", "HTTP/1.1")) {
        reject(client, 404); return
      }
      val method = first[0]
      if (method != "GET" && method != "HEAD") { reject(client, 405); return }
      val headers = mutableMapOf<String, String>()
      while (true) {
        val value = line()
        if (value.isEmpty()) break
        require(value.contains(':'))
        val key = value.substringBefore(':').lowercase(Locale.US)
        require(!headers.containsKey(key)) { "Duplicate header" }
        headers[key] = value.substringAfter(':').trim()
      }
      if (headers.containsKey("transfer-encoding") || headers["content-length"]?.let { it != "0" } == true) {
        reject(client, 400); return
      }
      val range = headers["range"]
      if (range != null && !Regex("bytes=(?:[0-9]+-[0-9]*|-[0-9]+)").matches(range)) {
        reject(client, 400); return
      }
      val source = current
      if (source.expiresAt <= System.currentTimeMillis()) {
        lastError = "Caducó el permiso del video. Vuelve a enviarlo a la TV."; reject(client, 410); return
      }
      // Intentionally use normal routing: the upstream is reachable through Tailscale.
      upstream = source.url.openConnection() as HttpURLConnection
      upstreams.add(upstream)
      upstream.instanceFollowRedirects = false
      upstream.connectTimeout = 10000
      upstream.readTimeout = 30000
      upstream.requestMethod = method
      upstream.setRequestProperty("Accept-Encoding", "identity")
      if (range != null) upstream.setRequestProperty("Range", range)
      headers["if-range"]?.let { upstream.setRequestProperty("If-Range", it) }
      val status = upstream.responseCode
      if (status !in listOf(200, 206, 416)) {
        lastError = if (status == 401 || status == 403) "El servidor rechazó el permiso del video. Vuelve a enviarlo." else "No se pudo obtener el video del servidor. Comprueba Tailscale."
        reject(client, 502); return
      }
      val response = StringBuilder("HTTP/1.1 $status ${if (status == 206) "Partial Content" else if (status == 416) "Range Not Satisfiable" else "OK"}\r\n")
      response.append("Connection: close\r\nContent-Type: video/mp4\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\n")
      response.append("transferMode.dlna.org: Streaming\r\ncontentFeatures.dlna.org: DLNA.ORG_OP=01;DLNA.ORG_CI=0\r\n")
      for (name in listOf("Content-Length", "Content-Range", "ETag", "Last-Modified")) {
        upstream.getHeaderField(name)?.let { value ->
          require(value.none { it == '\r' || it == '\n' })
          response.append("$name: $value\r\n")
        }
      }
      response.append("\r\n")
      val output = client.getOutputStream()
      output.write(response.toString().toByteArray(Charsets.US_ASCII))
      headersSent = true
      if (method == "GET" && status != 416) upstream.inputStream.use { body ->
        val buffer = ByteArray(64 * 1024)
        while (!server.isClosed) {
          val count = body.read(buffer)
          if (count < 0) break
          output.write(buffer, 0, count)
          bytesSent.addAndGet(count.toLong())
        }
      }
      output.flush()
    } catch (_: Exception) {
      if (!headersSent && !server.isClosed) {
        lastError = "No se pudo servir el video. Comprueba la red local y Tailscale."
        runCatching { reject(client, 502) }
      }
      // TVs routinely close an in-flight request when seeking; that is not a fatal error.
    } finally {
      upstream?.let { upstreams.remove(it); it.disconnect() }
      clients.remove(client)
      runCatching { client.close() }
    }
  }

  private fun reject(client: Socket, status: Int) {
    client.getOutputStream().write("HTTP/1.1 $status Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray(Charsets.US_ASCII))
  }

  override fun close() {
    runCatching { server.close() }
    clients.forEach { runCatching { it.close() } }
    upstreams.forEach { it.disconnect() }
    workers.shutdownNow()
    expiry.shutdownNow()
  }

  companion object {
    private fun validate(url: URL): URL {
      require(url.protocol in listOf("http", "https") && url.userInfo == null && url.ref == null) { "URL de video inválida" }
      return url
    }
  }
}
