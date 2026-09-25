package expo.modules.alpinefilmdlna

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayInputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.SocketException
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.Locale
import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element
import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

/** Prefer Wi-Fi; respect system routing when a VPN forbids explicit binding. */
class AlpinefilmDlnaModule : Module() {
  private val io = CoroutineScope(SupervisorJob() + Dispatchers.IO.limitedParallelism(1))
  private data class Device(val id: String, val name: String, val ip: String,
    val network: Network, val explicitNetwork: Boolean, val service: String, val control: URL)
  private val devices = ConcurrentHashMap<String, Device>()
  @Volatile private var scanSocket: DatagramSocket? = null
  private var relay: VideoRelay? = null
  private var castDevice: Device? = null

  override fun definition() = ModuleDefinition {
    Name("AlpinefilmDlna")
    AsyncFunction("discover") { discover() }.runOnQueue(io)
    AsyncFunction("cast") { id: String, source: String, title: String, expiresAt: Double ->
      val device = devices[id] ?: error("Busca la TV de nuevo.")
      check(wifi() == device.network) { "Cambió el Wi-Fi. Busca la TV de nuevo." }
      val context = appContext.reactContext ?: error("Android no está disponible")
      val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val address = cm.getLinkProperties(device.network)?.linkAddresses
        ?.map { it.address }?.firstOrNull { it is Inet4Address && it.isSiteLocalAddress }
        ?: error("No encontramos la dirección Wi-Fi del teléfono.")
      val sourceUrl = URL(source)
      require(sourceUrl.protocol in listOf("http", "https") && sourceUrl.userInfo == null && sourceUrl.ref == null)
      // Check authorization/reachability before replacing what the TV is playing.
      val probe = sourceUrl.openConnection() as HttpURLConnection
      try {
        probe.instanceFollowRedirects = false
        probe.connectTimeout = 10000
        probe.readTimeout = 10000
        probe.requestMethod = "HEAD"
        check(probe.responseCode in 200..299) { "No se pudo abrir el video del servidor. Comprueba Tailscale y vuelve a intentarlo." }
      } finally { probe.disconnect() }
      val candidate = VideoRelay(address, InetAddress.getByName(device.ip), sourceUrl, expiresAt.toLong())
      try {
        val metadata = "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\"><item id=\"1\" parentID=\"0\" restricted=\"1\"><dc:title>${escape(title.take(200))}</dc:title><upnp:class>object.item.videoItem.movie</upnp:class><res protocolInfo=\"http-get:*:video/mp4:*\">${escape(candidate.url)}</res></item></DIDL-Lite>"
        soap(device, "SetAVTransportURI", "<CurrentURI>${escape(candidate.url)}</CurrentURI><CurrentURIMetaData>${escape(metadata)}</CurrentURIMetaData>")
        soap(device, "Play", "<Speed>1</Speed>")
        relay?.close()
        relay = candidate
        castDevice = device
        keepScreen(true)
      } catch (e: Exception) { candidate.close(); throw e }
    }.runOnQueue(io)
    AsyncFunction("renewCast") { source: String, expiresAt: Double ->
      (relay ?: error("El envío terminó")).updateSource(URL(source), expiresAt.toLong())
    }.runOnQueue(io)
    AsyncFunction("castStatus") {
      mapOf("active" to (relay?.active == true), "bytesSent" to (relay?.bytesSent?.get()?.toDouble() ?: 0.0),
        "error" to (relay?.lastError ?: ""))
    }.runOnQueue(io)
    AsyncFunction("endCast") {
      // Closing the capability URL revokes all subsequent reads even if SOAP fails.
      relay?.close(); relay = null
      val device = castDevice; castDevice = null
      keepScreen(false)
      if (device != null) runCatching { soap(device, "Stop", "") }
      Unit
    }.runOnQueue(io)
    AsyncFunction("command") { id: String, action: String, seconds: Double ->
      val device = devices[id] ?: castDevice?.takeIf { it.id == id } ?: error("La TV ya no está disponible. Busca de nuevo.")
      val args = when (action) {
        "GetTransportInfo", "GetPositionInfo", "Pause", "Stop" -> ""
        "Play" -> "<Speed>1</Speed>"
        "Seek" -> {
          require(seconds.isFinite() && seconds >= 0 && seconds <= 604800) { "Posición inválida" }
          val s = seconds.toLong()
          "<Unit>REL_TIME</Unit><Target>%02d:%02d:%02d</Target>".format(Locale.US, s / 3600, s / 60 % 60, s % 60)
        }
        else -> error("Control no admitido")
      }
      soap(device, action, args)
    }.runOnQueue(io)
    OnDestroy { scanSocket?.close(); relay?.close(); relay = null; keepScreen(false); io.cancel(); devices.clear() }
  }

  private fun keepScreen(enabled: Boolean) {
    appContext.currentActivity?.let { activity -> activity.runOnUiThread {
      if (enabled) activity.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      else activity.window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    } }
  }

  private fun escape(value: String) = value.replace("&", "&amp;").replace("<", "&lt;")
    .replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;")

  private fun wifi(): Network {
    val context = appContext.reactContext ?: error("Android no está disponible")
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    return cm.allNetworks.firstOrNull {
      val caps = cm.getNetworkCapabilities(it)
      caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true &&
        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
    } ?: error("Conecta el teléfono al Wi-Fi de la TV para buscarla.")
  }

  private fun discover(): List<Map<String, String>> {
    val network = wifi()
    val context = appContext.reactContext ?: error("Android no está disponible")
    val manager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val lock = manager.createMulticastLock("alpinefilm-dlna").apply { setReferenceCounted(false) }
    val found = mutableListOf<Map<String, String>>()
    val locations = linkedMapOf<String, String>()
    var socket = DatagramSocket(null)
    var explicitNetwork = true
    scanSocket?.close()
    scanSocket = socket
    try {
      lock.acquire()
      try {
        network.bindSocket(socket)
      } catch (e: SocketException) {
        // A VPN can forbid explicit network selection while allowing LAN routes.
        // Retry with normal routing, without changing or disabling the VPN.
        if (!e.message.orEmpty().contains("EPERM") && !e.message.orEmpty().contains("EACCES")) throw e
        socket.close()
        socket = DatagramSocket(null)
        scanSocket = socket
        explicitNetwork = false
      }
      socket.bind(java.net.InetSocketAddress(0))
      socket.soTimeout = 400
      val request = ("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\n" +
        "MAN: \"ssdp:discover\"\r\nMX: 2\r\nST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n\r\n").toByteArray()
      val packet = DatagramPacket(request, request.size, InetAddress.getByName("239.255.255.250"), 1900)
      socket.send(packet)
      val deadline = android.os.SystemClock.elapsedRealtime() + 5500
      var repeated = false
      while (!socket.isClosed && android.os.SystemClock.elapsedRealtime() < deadline) {
        if (!repeated && deadline - android.os.SystemClock.elapsedRealtime() < 3500) {
          socket.send(packet); repeated = true
        }
        try {
          val response = DatagramPacket(ByteArray(8192), 8192)
          socket.receive(response)
          if (response.address !is Inet4Address || !response.address.isSiteLocalAddress) continue
          val text = String(response.data, 0, response.length, Charsets.UTF_8)
          if (!text.startsWith("HTTP/1.1 200", ignoreCase = true)) continue
          val location = text.lineSequence().firstOrNull { it.startsWith("location:", true) }
            ?.substringAfter(':')?.trim() ?: continue
          if (locations.size < 24) locations[location] = response.address.hostAddress!!
        } catch (_: SocketTimeoutException) { /* Bounded receive window. */ }
      }
    } finally {
      socket.close()
      if (scanSocket === socket) scanSocket = null
      if (lock.isHeld) lock.release()
    }
    // Discard stale endpoints when changing Wi-Fi; control only discovered devices.
    devices.clear()
    for ((location, ip) in locations) {
      try {
        val url = localUrl(URL(location), ip)
        val root = xml(request(if (explicitNetwork) network else null, url)).documentElement
        val renderers = root.getElementsByTagNameNS("*", "device")
        for (i in 0 until renderers.length) {
          val renderer = renderers.item(i) as Element
          if (!child(renderer, "deviceType").contains(":MediaRenderer:")) continue
          val services = renderer.getElementsByTagNameNS("*", "service")
          for (j in 0 until services.length) {
            val service = services.item(j) as Element
            val type = child(service, "serviceType")
            if (!Regex("urn:schemas-upnp-org:service:AVTransport:[0-9]+").matches(type)) continue
            val baseText = child(root, "URLBase")
            val base = if (baseText.isBlank()) url else localUrl(URL(baseText), ip)
            val controlPath = child(service, "controlURL")
            require(controlPath.isNotBlank()) { "La TV no anunció un control AVTransport" }
            val control = localUrl(URL(base, controlPath), ip)
            val id = "$ip|${child(renderer, "UDN")}"
            val device = Device(id, child(renderer, "friendlyName").ifBlank { "TV DLNA" }.take(120), ip, network, explicitNetwork, type, control)
            devices[id] = device
            if (found.none { it["id"] == id }) found.add(mapOf("id" to id, "name" to device.name, "ip" to ip))
          }
        }
      } catch (_: Exception) { /* One malformed/offline device must not fail discovery. */ }
    }
    if (found.isEmpty() && !explicitNetwork) {
      error("Android bloqueó la selección directa del Wi-Fi y no encontramos TVs por la ruta normal. Comprueba el acceso a la red local de la VPN y que la TV esté encendida en tu misma red.")
    }
    return found
  }

  private fun localUrl(url: URL, ip: String): URL {
    require(url.protocol == "http" && url.host == ip && url.userInfo == null && url.ref == null) {
      "La TV anunció una dirección local inválida"
    }
    return url
  }

  private fun request(network: Network?, url: URL, body: String? = null, soapAction: String? = null): ByteArray {
    val connection = (network?.openConnection(url) ?: url.openConnection()) as HttpURLConnection
    try {
      connection.connectTimeout = 1500
      connection.readTimeout = if (body == null) 2000 else 10000
      connection.instanceFollowRedirects = false
      if (body != null) {
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "text/xml; charset=utf-8")
        connection.setRequestProperty("SOAPACTION", "\"$soapAction\"")
        val bytes = body.toByteArray(Charsets.UTF_8)
        connection.setFixedLengthStreamingMode(bytes.size)
        connection.outputStream.use { it.write(bytes) }
      }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val bytes = stream?.use {
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(4096)
        val deadline = android.os.SystemClock.elapsedRealtime() + 3000
        while (true) {
          check(android.os.SystemClock.elapsedRealtime() <= deadline) { "La TV tardó demasiado en responder" }
          val count = it.read(buffer)
          if (count < 0) break
          check(output.size() + count <= 131072) { "Respuesta de TV demasiado grande" }
          output.write(buffer, 0, count)
        }
        output.toByteArray()
      } ?: ByteArray(0)
      check(status in 200..299) {
        val code = runCatching { xml(bytes).getElementsByTagNameNS("*", "errorCode").item(0)?.textContent }.getOrNull()
        "La TV rechazó el control (HTTP $status${if (code != null) ", UPnP $code" else ""})."
      }
      return bytes
    } finally { connection.disconnect() }
  }

  private fun xml(bytes: ByteArray): org.w3c.dom.Document {
    val parser = Xml.newPullParser()
    parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
    parser.setInput(ByteArrayInputStream(bytes), null)
    val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument()
    var parent: org.w3c.dom.Node = doc
    var event = parser.eventType
    while (event != XmlPullParser.END_DOCUMENT) {
      when (event) {
        XmlPullParser.DOCDECL -> error("DTD no admitido")
        XmlPullParser.START_TAG -> {
          require(parser.depth <= 32) { "XML demasiado profundo" }
          val element = doc.createElementNS(parser.namespace.ifEmpty { null }, parser.name)
          parent.appendChild(element)
          parent = element
        }
        XmlPullParser.END_TAG -> parent = parent.parentNode
        XmlPullParser.TEXT, XmlPullParser.CDSECT, XmlPullParser.ENTITY_REF -> {
          val value = parser.text ?: error("Entidad XML no admitida")
          if (parent !== doc) parent.appendChild(doc.createTextNode(value))
        }
      }
      event = parser.nextToken()
    }
    require(doc.documentElement != null) { "XML vacío" }
    return doc
  }

  private fun child(parent: Element, name: String): String {
    val children = parent.childNodes
    for (i in 0 until children.length) {
      val node = children.item(i)
      if (node.localName == name) return node.textContent.trim()
    }
    return ""
  }

  private fun soap(device: Device, action: String, args: String): Map<String, String> {
    check(wifi() == device.network) { "Cambió la red Wi-Fi. Busca la TV de nuevo." }
    val body = "<?xml version=\"1.0\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body><u:$action xmlns:u=\"${device.service}\"><InstanceID>0</InstanceID>$args</u:$action></s:Body></s:Envelope>"
    val doc = xml(request(if (device.explicitNetwork) device.network else null, device.control, body, "${device.service}#$action"))
    val response = doc.getElementsByTagNameNS("*", "${action}Response").item(0)
      ?: error("La TV devolvió una respuesta inesperada")
    val result = mutableMapOf<String, String>()
    for (i in 0 until response.childNodes.length) {
      val node = response.childNodes.item(i)
      if (node is Element && node.localName in listOf("CurrentTransportState", "CurrentTransportStatus", "TrackDuration", "RelTime"))
        result[node.localName] = node.textContent.take(120)
    }
    return result
  }
}
