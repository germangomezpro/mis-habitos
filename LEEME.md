# Mis Hábitos

App de hábitos y tareas para el celular (PWA).

- **Hábitos**: check, sesiones, contador y límite, con frecuencias diaria, días fijos
  o X veces por semana, rachas, calendario y edición.
- **Tareas únicas**: día, hora opcional, check/sesiones/contador, vencidas, sección Hechas
  y botón para agregarlas a Google Calendar.
- **Ajustes**: categorías y respaldo (exportar/importar).

## Estructura

```
mis-habitos/
├── index.html          Pantallas (HTML)
├── manifest.json       Nombre, colores e íconos para instalarla
├── sw.js               Service worker: funciona sin internet
├── css/estilos.css
├── js/app.js           Hábitos, ajustes, respaldo y lo compartido
├── js/tareas.js        Tareas únicas
└── iconos/
```

Los datos se guardan en el navegador del celular (localStorage), con la clave `misHabitos.v1`.

## Probar en la compu

El service worker no funciona abriendo `index.html` con doble clic: necesita un servidor.

- Con XAMPP: copiá la carpeta en `htdocs` y abrí `http://localhost/mis-habitos/`
- O con Python, desde la carpeta: `python -m http.server 8000` y abrí `http://localhost:8000`

## Publicar en GitHub Pages (gratis, con https)

1. Creá un repositorio público en GitHub, por ejemplo `mis-habitos`.
2. Subí el contenido de esta carpeta a la raíz del repositorio (que `index.html` quede en la raíz).
3. En el repositorio: **Settings → Pages → Branch: main / (root) → Save**.
4. En uno o dos minutos queda en `https://TU-USUARIO.github.io/mis-habitos/`.

## Instalar en el celular

- **Android (Chrome):** abrí la dirección, tocá el botón "Instalar app"
  (o menú ⋮ → "Instalar app" / "Agregar a la pantalla principal").
- **iPhone (Safari):** botón Compartir → "Agregar a inicio".

## Cuando cambies algo

Subí los archivos nuevos a GitHub y listo. La app abre con la copia guardada y,
por detrás, descarga lo nuevo: avisa "Hay una versión nueva" y la próxima vez
que la abras ya la usás. (Si agregás un archivo nuevo, sumalo a la lista
`ARCHIVOS` de `sw.js` para que funcione sin internet.)

Para subir archivos que van dentro de una carpeta, usá la dirección
`github.com/TU-USUARIO/mis-habitos/upload/main/NOMBRE-CARPETA`.

## Ojo con los datos

Los hábitos y tareas viven en el navegador del celular. Si desinstalás la app o borrás
los datos de Chrome, se pierden. Hacé un respaldo de vez en cuando desde ⚙ → Exportar respaldo. La dirección (URL) también importa: los datos de
`localhost` y los de GitHub Pages son independientes.
