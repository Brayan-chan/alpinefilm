# AlpineFilm

App privada para el backend hermano `alpinefilm-backend`. Expo SDK 57, React Native y TypeScript. Android/iOS; la persistencia segura y las subidas están diseñadas para dispositivos nativos.

## Desarrollo

```sh
bun install
cp .env.example .env # solo si no existe
bun start --clear
```

`EXPO_PUBLIC_API_URL` debe terminar en `/api/v1`. Contiene únicamente una dirección pública para la app, nunca claves JWT, contraseñas ni códigos de invitación. Reinicia Metro después de cambiarla.

La configuración de desarrollo usa `http://100.98.115.100:3000/api/v1` mediante Tailscale. El backend debe escuchar en esa interfaz. Para builds móviles usa HTTPS privado con Tailscale Serve; reemplaza la variable por el dominio real que entregue `tailscale serve status`. No se ha inventado un dominio para el servidor.

## Integración

- Login, registro por invitación, restauración segura, renovación de tokens y cierre de sesiones remoto.
- Catálogo paginado, búsqueda, portadas autenticadas, detalle, favoritos y continuar viendo.
- Reproductor `expo-video` con URL temporal, renovación, avance y guardado de progreso.
- Administración de fichas, video, portadas, publicación, eliminación y subtítulos WebVTT.
- Subida por fragmentos; puede pausarse y reanudarse seleccionando el mismo archivo, nombre y tamaño. No se carga el video completo en RAM. Se copia temporalmente al almacenamiento de la app para compatibilidad con proveedores de documentos.
- Usuarios: creación de espectadores, activación y desactivación. El cliente API también expone edición, cambio de roles y reset de contraseñas.

No hay catálogo ficticio ni bypass de administrador. El backend nuevo invalida las sesiones antiguas: inicia sesión otra vez después del despliegue.

Los subtítulos externos se administran mediante la API; su selección/renderizado en el reproductor móvil todavía requiere integración específica. Los controles nativos pueden mostrar pistas incluidas en el propio video.

## Verificación

```sh
bunx tsc --noEmit
bunx expo export --platform android --platform ios --output-dir /tmp/alpinefilm-export
```

La compilación no sustituye una prueba en teléfono: valida login, portada, reproducción, avance, pausa, renovación de sesión y una subida interrumpida en la red Tailscale antes de distribuir builds.
