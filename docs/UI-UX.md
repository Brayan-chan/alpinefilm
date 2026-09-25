# AlpineFilm · UI/UX

Dirección elegida: cine oscuro, acento rojo, portadas reales y superficies redondeadas.

- Fondo carbón #0C0C0F, tarjetas #19191F y acción principal #DA263B.
- Márgenes de pantalla de 24 puntos; tarjetas de 22–30 puntos de radio.
- Inicio: película publicada destacada, continuar viendo y biblioteca.
- Buscar: consulta al servidor con paginación. Mi lista: favoritos reales.
- Detalle: portada, título, metadatos disponibles, reproducción, favoritos y sinopsis.
- Administración: Películas, Agregar, Subidas y Usuarios. Las acciones de cada película se despliegan desde su tarjeta.
- SafeAreaProvider y áreas seguras para Android/iOS; navegación inferior separada del área de gestos.
- Controles con etiquetas accesibles y estados; formularios adaptados al teclado, contraseña visible opcional y descripción multilínea.
- No se agregaron calificaciones, reparto, tendencias o contenido ficticio.

Validación: TypeScript y exportación Android. Falta revisión visual en dispositivo físico; no había dispositivo conectado durante el rediseño.

Pendientes funcionales conservados: almacenamiento residual, carga/posición inicial del reproductor y ajuste de pantalla por gestos. Los controles personalizados del reproductor se harán después.

## Reproducción inmersiva

Reproducción en pantalla dedicada con orientación horizontal automática y barras del sistema ocultas. Una sola capa de controles incluye volver, reiniciar, pausa, saltos de 10 segundos y barra de progreso. Se oculta tras 3.5 segundos al reproducir y reaparece al tocar. Se conserva visible durante carga, errores, pausa, ajuste de la barra o uso de lector de pantalla. Pellizco alterna imagen completa y recorte proporcional. El cierre restaura el bloqueo de orientación anterior. Validado con TypeScript, pruebas de lógica y exportación Android; falta prueba física.
