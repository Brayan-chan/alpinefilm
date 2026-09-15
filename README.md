# AlpineFilm

Aplicación móvil privada para explorar y reproducir las películas almacenadas en el servidor Alpine.

## Desarrollo

```bash
git clone https://github.com/Brayan-chan/alpinefilm.git
cd alpinefilm
cp .env.example .env
bun install
bun start
```

Conecta Tailscale y escanea el QR con Expo Go. Mientras no exista el backend, pulsa **Explorar diseño sin backend**.

La API predeterminada es `http://100.98.115.100:3000/api/v1`; puedes cambiarla en `.env`.

## Incluido

- Expo SDK 57, React Native y TypeScript.
- Login preparado para `POST /auth/login`.
- Sesión cifrada con `expo-secure-store`.
- Catálogo demostrativo, búsqueda, detalle y perfil.
- Cliente API con timeout y configuración por entorno.
- `expo-video` instalado para la siguiente etapa.
