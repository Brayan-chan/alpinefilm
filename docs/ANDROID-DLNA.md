# DLNA desde Android

## Flujo implementado

1. Android descubre la TV por SSDP y consulta AVTransport.
2. «Enviar película desde el inicio» solicita al backend un permiso de reproducción temporal para esa película.
3. Android comprueba el acceso al video y abre un puente HTTP en su IP Wi-Fi y un puerto aleatorio.
4. Se envía `SetAVTransportURI` con metadatos DIDL-Lite y la URL del puente, seguido de `Play`.
5. La TV descarga el video desde el teléfono. El teléfono lo obtiene del servidor mediante la ruta normal, que permite usar Tailscale. No se descarga un archivo completo ni se almacena el video en disco.

La Lenovo puede seguir conectada por USB. Teléfono y TV deben compartir red local y el router debe permitir conexiones entre ellos. La TV no necesita Tailscale. El Android sí necesita acceso al servidor; para otras personas todavía será necesario autorizarlo en Tailscale mientras el backend no tenga otro origen accesible.

## Límites de esta versión

- Mantener la app en la pantalla de reproducción, en primer plano. Durante el envío se mantiene la pantalla encendida. No se implementó un servicio de segundo plano: bloquear el teléfono o cambiar de app puede interrumpirlo.
- Cerrar el panel de TV mantiene el envío. Salir de la película o pulsar «Terminar envío» revoca la URL y solicita Stop.
- La película empieza desde cero. No hay sincronización del progreso de la TV con el historial de la app. El progreso local previo se conserva.
- Pausa/reproducción/parada consultan el estado antes de enviar controles; los controles incompatibles con ese estado se deshabilitan. La TV puede rechazar transiciones que no soporte.
- El archivo no se transcodifica. Que el teléfono reproduzca un códec no garantiza que la TV pueda hacerlo.
- La app muestra por separado el estado AVTransport y si la TV ha recibido bytes. Recibir bytes no demuestra que la TV los haya decodificado.
- Sesión máxima de seis horas; los permisos del backend se renuevan mientras la app permanece activa. La URL local permanece estable.
- Chromecast y AirPlay no están incluidos.

## Red y protección del puente

- SSDP UDP multicast 239.255.255.250:1900; dos solicitudes y ventana de 5,5 segundos.
- Preferencia por Wi-Fi para SSDP/SOAP. Ante EPERM/EACCES al seleccionar la red, se usa la ruta normal permitida por Android. No se cambia ni se desactiva la VPN. Restricciones de VPN/aislamiento LAN todavía pueden impedir la conexión.
- Descriptores y controles HTTP limitados a la IP privada que respondió; sin redirecciones, credenciales ni nombres DNS. XML sin DTD y profundidad máxima 32.
- El puente escucha sólo en la dirección IPv4 Wi-Fi del teléfono. Sólo acepta conexiones de la IP de la TV seleccionada y una ruta aleatoria por sesión.
- Únicamente GET y HEAD; no es un proxy general. El origen es un único video autorizado y la renovación sólo puede cambiar su query, no la película ni el servidor.
- Se conservan Range, If-Range, Content-Length, Content-Range, ETag y Last-Modified. No se siguen redirecciones del origen ni se reenvían cookies/bearers de la TV.
- Cuatro conexiones simultáneas como máximo, cabeceras limitadas a 16 KiB y buffer de transferencia de 64 KiB por conexión. Al finalizar se cierran sockets, peticiones al origen y ejecutores.
- El permiso firmado del backend permanece en el Android, no se entrega a la TV. La URL local temporal no se registra ni se publica.
- HTTP local sin TLS es necesario para estos receptores DLNA; el módulo declara usesCleartextTraffic.

## Compilación y prueba

La distribución se realiza con [EAS Build preview](./EAS-PREVIEW.md). Expo Go no incluye el módulo nativo. Un cambio Kotlin requiere un nuevo APK.

Pruebas locales del módulo (no generan un APK):

```sh
cd android
./gradlew :alpinefilm-dlna:testDebugUnitTest
```

Las pruebas JVM usan un servidor HTTP simulado y sockets reales de loopback para comprobar GET/HEAD/rangos, restricciones de ruta/método/receptor, renovación y cierre, y rechazo de redirecciones. No reemplazan la prueba con Android/Tailscale/VIDAA.

Validación del puente: cinco pruebas JVM aprobadas ejecutando Kotlin 2.1.20 y JUnit de forma aislada, nueve pruebas JavaScript aprobadas y TypeScript sin errores. La tarea Gradle local no pudo iniciarse por una caché de transformaciones incompleta; la integración Android completa se valida con EAS.

Prueba física pendiente del puente:

1. Instalar el APK actualizado sobre el anterior, con teléfono y TV en la misma LAN y Tailscale conectado.
2. Abrir una película, tocar TV, buscar y seleccionar «TV de la sala».
3. Pulsar «Enviar película desde el inicio». Confirmar imagen y audio en la TV, no sólo que aparece PLAYING.
4. Probar pausa/reanudación, adelantar desde el mando de la TV, cerrar/reabrir el panel y terminar el envío.
5. Comprobar un video largo, desconexión de red y renovación del permiso. Verificar que salir de la pantalla termina el puente.

El descubrimiento y GetTransportInfo ya fueron confirmados por el usuario en la VIDAA. La entrega y decodificación del video requieren la prueba anterior.
