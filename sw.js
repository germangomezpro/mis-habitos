/* =========================================================
   SERVICE WORKER — hace que la app funcione sin internet
   y se actualice sola.
   ---------------------------------------------------------
   Es un archivo JavaScript que el navegador corre "aparte" de la página.
   Se para en el medio de cada pedido de archivos.

   Estrategia: "mostrar lo guardado y actualizar por detrás"
   (en inglés le dicen "stale-while-revalidate"):

     1. La app abre SIEMPRE con la copia guardada en el celular → al instante.
     2. Al mismo tiempo, pide los archivos a internet y, si llegan,
        reemplaza la copia guardada.
     3. Si algún archivo cambió, le avisa a la página.
        La próxima vez que abras la app, ya usás la versión nueva.

   Ya no hace falta cambiar ningún número de versión: con subir los
   archivos nuevos a GitHub alcanza.
   ========================================================= */

const CACHE = 'mis-habitos';

// Todo lo que la app necesita para funcionar sin conexión
const ARCHIVOS = [
  './',
  './index.html',
  './css/estilos.css',
  './js/app.js',
  './js/tareas.js',
  './manifest.json',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/icono-maskable-512.png',
  './iconos/apple-touch-icon.png',
  './iconos/favicon.png'
];

// 1. INSTALACIÓN: descarga y guarda todos los archivos
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then(cache =>
      // cache: 'reload' = pedirlos frescos al servidor, sin usar copias viejas del navegador
      cache.addAll(ARCHIVOS.map(url => new Request(url, { cache: 'reload' })))
    )
  );
  self.skipWaiting(); // que este service worker se active sin esperar
});

// 2. ACTIVACIÓN: borra cachés de versiones anteriores (por ejemplo "mis-habitos-v1")
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then(nombres => Promise.all(
        nombres.filter(n => n !== CACHE).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim()) // tomar control de las pestañas abiertas
  );
});

// Le avisa a la app (todas las ventanas abiertas) que hay archivos nuevos
async function avisarVersionNueva() {
  const ventanas = await self.clients.matchAll({ type: 'window' });
  ventanas.forEach(ventana => ventana.postMessage({ tipo: 'version-nueva' }));
}

// Identificador de una versión de un archivo, según lo que manda el servidor
const huella = (respuesta) => respuesta.headers.get('etag') || respuesta.headers.get('last-modified');

// 3. CADA PEDIDO
self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;

  // Solo manejamos lecturas (GET) de nuestro propio sitio.
  // Lo demás (por ejemplo, el link a Google Calendar) pasa de largo.
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;

  evento.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardada = await cache.match(pedido, { ignoreSearch: true });

    // Pedimos la versión de internet (sin esperar a que llegue para responder)
    const deInternet = fetch(pedido, { cache: 'no-cache' })
      .then(async (respuesta) => {
        if (respuesta.ok) {
          const cambio = guardada && huella(guardada) && huella(guardada) !== huella(respuesta);
          await cache.put(pedido, respuesta.clone());
          if (cambio) avisarVersionNueva();
        }
        return respuesta;
      })
      .catch(() => guardada); // sin internet: nos quedamos con lo guardado

    // Le pedimos al navegador que no corte la descarga aunque ya respondimos
    evento.waitUntil(deInternet);

    // Si hay copia guardada, la usamos ya mismo; si no, esperamos a internet
    return guardada || deInternet;
  })());
});
