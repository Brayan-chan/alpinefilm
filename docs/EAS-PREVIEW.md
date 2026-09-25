# APK preview con EAS Build

El perfil `preview` de `eas.json` genera un APK Android de distribución interna, con JavaScript empaquetado y el módulo nativo DLNA completo (descubrimiento, controles y puente de video). No necesita Metro, Expo Go ni conexión USB al Mac.

Desde la carpeta del proyecto, con Node 24:

```sh
cd /Users/brayanchan/Desktop/alpinefilm
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

También está disponible `npm run build:preview:android` después de iniciar sesión. En la primera compilación, EAS puede solicitar crear/vincular el proyecto y generar el keystore Android. Conserva el proyecto y la firma para poder instalar futuras actualizaciones sin desinstalar.

Al terminar, abre el enlace de EAS desde Android y descarga el APK. Permite instalar desde ese navegador cuando Android lo solicite.

## Qué se envía

`.easignore` excluye los directorios nativos generados en la raíz, cachés, `.env`, pruebas y documentación. Incluye `modules/alpinefilm-dlna`: EAS genera Android mediante prebuild y enlaza ese módulo automáticamente. Se usa `bun.lock`, no el antiguo `bun.lockb`.

## Conexión al servidor

El perfil incorpora `EXPO_PUBLIC_API_URL=http://100.98.115.100:3000/api/v1`. Es una URL pública en el sentido de que queda dentro del APK, no un secreto. El teléfono todavía necesita Tailscale autorizado para conectarse al servidor. EAS compila la app; no publica el backend ni hace accesible esa URL a la TV.

## Envío de video a la TV

El módulo nativo incluye el puente HTTP local (`VideoRelay`). Para enviar una película:

1. Teléfono y TV en la misma red Wi-Fi local; Compartir contenido activado en la TV.
2. Abrir una película publicada y pulsar el icono de TV en los controles del reproductor.
3. Buscar televisores, seleccionar la TV y pulsar «Enviar película desde el inicio».
4. El teléfono abre el puente, verifica el video con Tailscale y envía la URL local a la TV.
5. La TV descarga el video directamente del teléfono por la red local; no necesita acceso a Tailscale.
6. Mantener la app abierta durante el envío. Salir de la película cierra el puente y detiene la TV.

Consulta [ANDROID-DLNA.md](./ANDROID-DLNA.md) para el diseño completo, límites y pasos de prueba.
