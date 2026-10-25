# Mis Hábitos

App de hábitos para el celular (PWA): check, temporizador, contador y límite,
con frecuencias diaria, días fijos o X veces por semana, rachas y calendario.

## Estructura

```
mis-habitos/
├── index.html          Pantallas (HTML)
├── manifest.json       Nombre, colores e íconos para instalarla
├── sw.js               Service worker: funciona sin internet
├── css/estilos.css
├── js/app.js           Toda la lógica
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

Subí el número de `VERSION` en `sw.js` (por ejemplo de `'v1'` a `'v2'`) y volvé a subir los archivos.
Si no, el celular sigue usando los archivos viejos guardados en la caché.

## Ojo con los datos

Los hábitos viven en el navegador del celular. Si desinstalás la app o borrás los datos
de Chrome, se pierden. La dirección (URL) también importa: los datos de
`localhost` y los de GitHub Pages son independientes.
