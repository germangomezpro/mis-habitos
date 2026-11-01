/* =========================================================
   SERVICE WORKER — hace que la app funcione sin internet
   y se actualice sola.
   ---------------------------------------------------------
   Es un archivo JavaScript que el navegador corre "aparte" de la página.
   Se para en el medio de cada pedido de archivos.

   Estrategia:
     1. La app abre SIEMPRE con la copia guardada en el celular → al instante.
     2. Cada vez que abrís la app, por detrás, revisa en internet si cambió
        algún archivo.
     3. Si cambió aunque sea uno, baja TODOS juntos y recién ahí reemplaza
        la copia guardada. Así el celu nunca queda con una mezcla de
        archivos viejos y nuevos.
     4. Le avisa a la página, y la próxima vez que abras la app ya usás
        la versión nueva.

   No hace falta cambiar ningún número de versión: con subir los
   archivos nuevos a GitHub alcanza.
   ========================================================= */

const CACHE = 'mis-habitos-archivos';

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
//    (addAll es "todo o nada": si falla uno, no guarda ninguno)
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then(cache =>
      // cache: 'reload' = pedirlos frescos al servidor, sin usar copias viejas del navegador
      cache.addAll(ARCHIVOS.map(url => new Request(url, { cache: 'reload' })))
    )
  );
  self.skipWaiting(); // que este service worker se active sin esperar
});

// 2. ACTIVACIÓN: borra cachés de versiones anteriores
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then(nombres => Promise.all(
        nombres.filter(n => n !== CACHE).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim()) // tomar control de las pestañas abiertas
  );
});

// Le manda un mensaje a la app (a todas las ventanas abiertas)
async function avisarALaApp(tipo) {
  const ventanas = await self.clients.matchAll({ type: 'window' });
  ventanas.forEach(ventana => ventana.postMessage({ tipo }));
}

// Identificador de una versión de un archivo. GitHub manda un "etag" que cambia
// cuando cambia el archivo; si no viene, comparamos el contenido.
async function huella(respuesta) {
  return respuesta.headers.get('etag')
      || respuesta.headers.get('last-modified')
      || await respuesta.clone().text();
}

// 3. REVISAR SI HAY VERSIÓN NUEVA Y BAJAR TODO JUNTO
//    forzar = true: guarda todo aunque no haya cambiado nada (lo pide la app si hubo un error)
let revisando = null; // para no revisar dos veces al mismo tiempo

function revisarActualizacion(forzar = false) {
  if (revisando) return revisando;

  revisando = (async () => {
    // a) Bajamos todos los archivos a la vez. Si falla alguno (por ejemplo,
    //    sin internet), Promise.all falla y no tocamos nada.
    const nuevas = await Promise.all(ARCHIVOS.map(async (url) => {
      const respuesta = await fetch(new Request(url, { cache: 'no-cache' }));
      if (!respuesta.ok) throw new Error(`No se pudo bajar ${url}`);
      return [url, respuesta];
    }));

    // b) ¿Cambió alguno respecto de lo guardado?
    const cache = await caches.open(CACHE);
    let cambioAlguno = forzar;
    for (const [url, respuesta] of nuevas) {
      const guardada = await cache.match(url);
      if (!guardada || await huella(guardada) !== await huella(respuesta)) {
        cambioAlguno = true;
        break;
      }
    }
    if (!cambioAlguno) return;

    // c) Reemplazamos TODOS juntos
    await Promise.all(nuevas.map(([url, respuesta]) => cache.put(url, respuesta)));
    await avisarALaApp(forzar ? 'resincronizado' : 'version-nueva');
  })()
    .catch(() => { /* sin internet o servidor caído: seguimos con lo guardado */ })
    .finally(() => { revisando = null; });

  return revisando;
}

// 4. CADA PEDIDO
self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;

  // Solo manejamos lecturas (GET) de nuestro propio sitio.
  // Lo demás (por ejemplo, el link a Google Calendar) pasa de largo.
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;

  // Cuando se abre la app (se pide la página), revisamos por detrás si hay versión nueva
  if (pedido.mode === 'navigate') {
    evento.waitUntil(revisarActualizacion());
  }

  // Respondemos con lo guardado; si no está guardado, lo buscamos en internet
  evento.respondWith(
    caches.match(pedido, { ignoreSearch: true })
      .then(guardada => guardada || fetch(pedido))
  );
});

// 5. MENSAJES DE LA APP
//    Si la app tuvo un error, nos pide que volvamos a bajar todo junto.
self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.tipo === 'resincronizar') {
    evento.waitUntil(revisarActualizacion(true));
  }
});
