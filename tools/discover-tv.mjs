// Read-only SSDP discovery. Run on the Alpine server while TV is on the same LAN.
// No playback commands, credentials, filesystem mutations or installed packages.
import dgram from 'node:dgram';
import os from 'node:os';
const interfaces = Object.entries(os.networkInterfaces()).flatMap(([name, values]) =>
  values.filter(v => v.family === 'IPv4' && !v.internal && !/tailscale|tun|docker|veth/.test(name)).map(v => ({ name, address: v.address })));
console.log('Interfaces locales:', interfaces);
const targets = ['urn:schemas-upnp-org:device:MediaRenderer:1', 'urn:schemas-upnp-org:service:AVTransport:1', 'ssdp:all'];
const seen = new Set();
const jobs = [];
async function inspect(address, location, type) {
  try {
    const url = new URL(location);
    // Only read the responding device itself. Never follow redirects or XML entities.
    if (url.protocol !== 'http:' || url.hostname !== address || url.username || url.password) return;
    const response = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: 'error' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const reader = response.body.getReader();
    let xml = '', size = 0;
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 128 * 1024) { await reader.cancel(); throw new Error('Descripción demasiado grande'); }
      xml += decoder.decode(chunk.value, { stream: true });
    }
    const tag = name => xml.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`, 'i'))?.[1]?.trim();
    console.log(JSON.stringify({ ip: address, name: tag('friendlyName'), manufacturer: tag('manufacturer'), model: tag('modelName'), type, receivesVideoViaAVTransport: /urn:schemas-upnp-org:service:AVTransport:/i.test(xml), renderingControl: /urn:schemas-upnp-org:service:RenderingControl:/i.test(xml) }, null, 2));
  } catch (e) { console.log(`Dispositivo ${address}: ${e.message}`); }
}
await Promise.all(interfaces.map(({ name, address }) => new Promise(resolve => {
  const socket = dgram.createSocket('udp4');
  let timer;
  const finish = () => { clearTimeout(timer); try { socket.close(); } catch {} resolve(); };
  socket.on('error', e => { console.log(`${name}: ${e.message}`); finish(); });
  socket.on('message', (buffer, sender) => {
    const message = buffer.toString();
    const location = message.match(/^location:\s*(.+)$/im)?.[1]?.trim();
    if (!location || seen.has(location) || seen.size >= 30) return;
    seen.add(location);
    const type = message.match(/^st:\s*(.+)$/im)?.[1]?.trim();
    jobs.push(inspect(sender.address, location, type));
  });
  socket.bind(0, address, () => {
    socket.setMulticastInterface(address);
    socket.setMulticastTTL(2);
    for (const target of targets) {
      const request = `M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 3\r\nST: ${target}\r\n\r\n`;
      socket.send(request, 1900, '239.255.255.250');
    }
    timer = setTimeout(finish, 6500);
  });
})));
await Promise.allSettled(jobs);
if (!seen.size) console.log('No hubo respuestas SSDP. Esto no demuestra incompatibilidad: comprueba red local, TV encendida, compartir contenido y aislamiento Wi-Fi.');
console.log('Diagnóstico terminado. No se inició ninguna reproducción.');
