/* =========================================================
   MIS HÁBITOS — app.js
   Hábitos, cosas compartidas (datos, fechas, menú, avisos),
   ajustes, respaldo y PWA. Las tareas únicas están en tareas.js.
   ========================================================= */


/* ---------------------------------------------------------
   1. CONSTANTES
   --------------------------------------------------------- */

// Nombre con el que se guardan los datos en el navegador.
const CLAVE_GUARDADO = 'misHabitos.v1';

const CATEGORIAS_INICIALES = ['Salud', 'Estudio', 'Trabajo', 'Personal'];

const colores = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'];

// Nombres de los días, en el mismo orden que getDay(): 0 = domingo
const nombresDias = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];


/* ---------------------------------------------------------
   2. MODELO DE DATOS
   ---------------------------------------------------------
   Todo lo que se guarda vive en un solo objeto "datos":

   datos = {
     version: 1,
     categorias: ['Salud', 'Estudio', ...],
     habitos: [ { id, nombre, categoria, color, tipo, frecuencia, config, creado, inicio, fin } ],
       (inicio = desde qué día cuenta; fin = último día, o null si es permanente)
     registros: {
       '2026-10-25': { 1730000000000: 1, 1730000000001: 5 },   // id del hábito → valor
     },
     tareas: [ ... ],          // ver tareas.js
     ultimoRespaldo: null      // fecha del último "Exportar respaldo"
   }

   El "valor" de un día significa:
     - check:        1 = hecho
     - temporizador: cantidad de sesiones hechas (en pantalla se llama "Sesiones")
     - contador:     cuánto sumaste (vasos, páginas...)
     - límite:       cuántas veces lo hiciste

   Separar la DEFINICIÓN del hábito (habitos) de lo que HICISTE cada día
   (registros) es la clave: con el historial completo podemos calcular
   progreso, rachas y estadísticas sin guardar nada calculado.
   --------------------------------------------------------- */

let datos = cargarDatos();
let filtroActual = 'Todas';


/* ---------------------------------------------------------
   3. GUARDAR Y CARGAR
   --------------------------------------------------------- */

function datosVacios() {
  return {
    version: 1,
    categorias: [...CATEGORIAS_INICIALES],
    habitos: [],
    registros: {},
    tareas: [],
    ultimoRespaldo: null
  };
}

// Completa lo que falte (por ejemplo, datos guardados antes de que existieran las tareas)
function normalizarDatos(leidos) {
  return { ...datosVacios(), ...leidos };
}

function cargarDatos() {
  try {
    const texto = localStorage.getItem(CLAVE_GUARDADO);
    if (!texto) return datosVacios();          // primera vez que se abre la app
    return normalizarDatos(JSON.parse(texto)); // texto → objeto
  } catch (error) {
    console.error('No se pudieron leer los datos guardados', error);
    return datosVacios();
  }
}

function guardarDatos() {
  try {
    localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(datos)); // objeto → texto
  } catch (error) {
    console.error('No se pudieron guardar los datos', error);
    avisar('No se pudo guardar. Revisá el espacio del navegador.');
  }
}


/* ---------------------------------------------------------
   4. FECHAS
   ---------------------------------------------------------
   OJO: no usamos toISOString() porque devuelve la fecha en hora UTC.
   En Argentina (UTC-3), a partir de las 21 hs ya te daría el día siguiente.
   --------------------------------------------------------- */

// Date → '2026-10-25' (en hora local)
function claveFecha(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes  = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia  = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

// '2026-10-25' → Date (en hora local)
function fechaDesdeClave(clave) {
  const [anio, mes, dia] = clave.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

function sumarDias(fecha, cantidad) {
  const nueva = new Date(fecha);
  nueva.setDate(nueva.getDate() + cantidad);
  return nueva;
}

// Las 7 claves de la semana de una fecha, de lunes a domingo
function clavesDeLaSemana(fecha = new Date()) {
  const lunes = sumarDias(fecha, -((fecha.getDay() + 6) % 7)); // lunes=0 ... domingo=6
  const claves = [];
  for (let i = 0; i < 7; i++) claves.push(claveFecha(sumarDias(lunes, i)));
  return claves;
}

// Guardamos qué día es "hoy" para detectar cuando pasa la medianoche
let hoy = claveFecha();

// '2026-10-27' → 'mar 27/10'
function fechaCorta(clave) {
  const fecha = fechaDesdeClave(clave);
  const diaSemana = fecha.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '');
  return `${diaSemana} ${fecha.getDate()}/${fecha.getMonth() + 1}`;
}

// La más chica de dos claves de fecha
const menorFecha = (a, b) => (a < b ? a : b);


/* ---------------------------------------------------------
   5. LEER Y ESCRIBIR REGISTROS DE HÁBITOS
   --------------------------------------------------------- */

// Valor de un hábito en un día (0 si no hay nada)
function valorDia(id, clave = hoy) {
  return datos.registros[clave]?.[id] ?? 0;
}

// Cambia el valor de un hábito en un día y guarda
function ponerValor(id, valor, clave = hoy) {
  if (!datos.registros[clave]) datos.registros[clave] = {};

  if (valor > 0) {
    datos.registros[clave][id] = valor;
  } else {
    delete datos.registros[clave][id]; // no guardamos ceros
    if (Object.keys(datos.registros[clave]).length === 0) delete datos.registros[clave];
  }
  guardarDatos();
}

// Suma de los valores de toda la semana actual (para límites semanales)
function valorSemana(id) {
  return clavesDeLaSemana().reduce((total, clave) => total + valorDia(id, clave), 0);
}


/* ---------------------------------------------------------
   6. LÓGICA DE CUMPLIMIENTO
   --------------------------------------------------------- */

// Cuánto hay que hacer en UN día para que ese día cuente como hecho.
// (tareas.js también la usa: las tareas tienen los mismos tipos y config)
function metaDiaria(item) {
  if (item.tipo === 'temporizador') return item.config.sesiones;
  if (item.tipo === 'contador') return item.config.meta;
  return 1; // check
}

// ¿Ese día quedó cumplido? (no aplica a límites)
function diaCumplido(habito, clave = hoy) {
  return valorDia(habito.id, clave) >= metaDiaria(habito);
}

// Cuántos días de esta semana se cumplió (para los "X veces por semana")
function diasCumplidosSemana(habito) {
  return clavesDeLaSemana().filter(clave => diaCumplido(habito, clave)).length;
}

const esSemanal = (h) => h.tipo !== 'limite' && h.frecuencia.modo === 'semanal';

// Lo que llevás del período del límite (hoy o esta semana)
function consumoLimite(habito) {
  return habito.config.periodo === 'semana' ? valorSemana(habito.id) : valorDia(habito.id);
}

/* --- Duración del hábito --- */

// Desde cuándo cuenta. Los hábitos creados antes de existir "inicio" usan su fecha de creación.
const inicioDe = (habito) => habito.inicio || habito.creado;

// Hasta qué día se evalúa: hoy, o el último día si ya terminó
const ultimoDiaEvaluado = (habito) => (habito.fin ? menorFecha(hoy, habito.fin) : hoy);

// 'proximo' (todavía no empezó) | 'activo' | 'finalizado' (ya pasó su último día)
function estadoHabito(habito) {
  if (inicioDe(habito) > hoy) return 'proximo';
  if (habito.fin && habito.fin < hoy) return 'finalizado';
  return 'activo';
}

// ¿El hábito "toca" hoy? (los de días fijos solo tocan esos días)
function tocaHoy(habito) {
  if (estadoHabito(habito) !== 'activo') return false;
  if (habito.tipo === 'limite') return true;
  if (habito.frecuencia.modo === 'dias') {
    return habito.frecuencia.dias.includes(new Date().getDay());
  }
  return true;
}

// ¿Está cumplido? Los semanales miran la semana; el resto, el día.
function estaCumplido(habito) {
  if (habito.tipo === 'limite') return false; // se define cuando termina el período
  if (esSemanal(habito)) return diasCumplidosSemana(habito) >= habito.frecuencia.veces;
  return diaCumplido(habito);
}


/* ---------------------------------------------------------
   7. RACHAS
   ---------------------------------------------------------
   Recorremos la historia del hábito desde que se creó hasta hoy,
   período por período (días o semanas, según el hábito), y a cada
   período le ponemos una etiqueta:

     'ok'   → se cumplió: suma a la racha
     'mal'  → no se cumplió: corta la racha
     'nada' → no cuenta ni corta (un día que no toca, o el período
              actual que todavía no terminó)

   Con esa lista, la racha actual es la seguidilla de 'ok' al final,
   y la mejor racha es la seguidilla más larga de toda la lista.
   --------------------------------------------------------- */

// ¿La racha de este hábito se cuenta en semanas?
function rachaEnSemanas(habito) {
  return esSemanal(habito) || (habito.tipo === 'limite' && habito.config.periodo === 'semana');
}

// Etiquetas de cada DÍA, desde el inicio hasta hoy (o hasta el fin, si ya terminó)
function estadosPorDia(habito) {
  const estados = [];
  const hasta = ultimoDiaEvaluado(habito);
  // Las claves 'AAAA-MM-DD' se pueden comparar como texto: '2026-10-24' < '2026-10-25'
  for (let fecha = fechaDesdeClave(inicioDe(habito)); claveFecha(fecha) <= hasta; fecha = sumarDias(fecha, 1)) {
    const clave = claveFecha(fecha);
    const esHoy = clave === hoy;

    if (habito.tipo === 'limite') {
      // Si te pasaste, se corta en el momento; si no, hoy queda pendiente
      const pasado = valorDia(habito.id, clave) > habito.config.maximo;
      estados.push(pasado ? 'mal' : esHoy ? 'nada' : 'ok');
      continue;
    }

    // Días que no tocan: no cuentan ni cortan
    if (habito.frecuencia.modo === 'dias' && !habito.frecuencia.dias.includes(fecha.getDay())) {
      estados.push('nada');
      continue;
    }

    // Hoy sin hacer todavía no corta la racha: el día no terminó
    const cumplido = diaCumplido(habito, clave);
    estados.push(cumplido ? 'ok' : esHoy ? 'nada' : 'mal');
  }
  return estados;
}

// Etiquetas de cada SEMANA (lunes a domingo), desde el inicio hasta hoy (o hasta el fin)
function estadosPorSemana(habito) {
  const estados = [];
  const inicio = fechaDesdeClave(inicioDe(habito));
  const primerLunes = sumarDias(inicio, -((inicio.getDay() + 6) % 7));
  const hasta = ultimoDiaEvaluado(habito);

  for (let lunes = primerLunes; claveFecha(lunes) <= hasta; lunes = sumarDias(lunes, 7)) {
    // Solo miramos los días que están dentro de la duración del hábito
    const claves = clavesDeLaSemana(lunes).filter(c => c >= inicioDe(habito) && c <= hasta);
    const esActual = claves.includes(hoy);
    // La primera y la última semana pueden estar incompletas
    const esPrimera = lunes.getTime() === primerLunes.getTime();
    const esUltima = Boolean(habito.fin) && claves.includes(habito.fin);

    if (habito.tipo === 'limite') {
      const total = claves.reduce((suma, clave) => suma + valorDia(habito.id, clave), 0);
      const pasado = total > habito.config.maximo;
      estados.push(pasado ? 'mal' : esActual ? 'nada' : 'ok');
      continue;
    }

    // X veces por semana
    const hechos = claves.filter(clave => diaCumplido(habito, clave)).length;
    const cumplida = hechos >= habito.frecuencia.veces;
    // La semana en curso no corta (todavía hay tiempo), y la primera y la
    // última tampoco, porque pueden estar incompletas
    estados.push(cumplida ? 'ok' : (esActual || esPrimera || esUltima) ? 'nada' : 'mal');
  }
  return estados;
}

function calcularRachas(habito) {
  const estados = rachaEnSemanas(habito) ? estadosPorSemana(habito) : estadosPorDia(habito);

  let seguidilla = 0;
  let mejor = 0;
  for (const estado of estados) {
    if (estado === 'ok') {
      seguidilla++;
      mejor = Math.max(mejor, seguidilla);
    } else if (estado === 'mal') {
      seguidilla = 0;
    }
    // 'nada' no hace nada: ni suma ni corta
  }
  // Al terminar el recorrido, la seguidilla que quedó es la racha actual
  return { actual: seguidilla, mejor };
}

function textoRacha(habito) {
  const { actual, mejor } = calcularRachas(habito);
  if (mejor === 0) return '';

  const enSemanas = rachaEnSemanas(habito);
  const unidad = (n) => enSemanas ? (n === 1 ? 'semana' : 'semanas') : (n === 1 ? 'día' : 'días');

  if (actual === 0) return `<p class="habito__racha habito__racha--apagada">Récord: ${mejor} ${unidad(mejor)}</p>`;
  if (actual === mejor) return `<p class="habito__racha">🔥 ${actual} ${unidad(actual)} · ¡tu récord!</p>`;
  return `<p class="habito__racha">🔥 ${actual} ${unidad(actual)} <span class="habito__record">· récord ${mejor}</span></p>`;
}


/* ---------------------------------------------------------
   8. ELEMENTOS DEL HTML Y AYUDAS GENERALES
   --------------------------------------------------------- */
const $ = (selector) => document.querySelector(selector);

const pantallaHoy     = $('#pantalla-hoy');
const pantallaNuevo   = $('#pantalla-nuevo');
const pantallaDetalle = $('#pantalla-detalle');
const pantallaAjustes = $('#pantalla-ajustes');
const lista           = $('#lista-habitos');
const filtros         = $('#filtros');
const formulario      = $('#form-habito');

// Evita que un texto con < o > se interprete como HTML (como htmlspecialchars en PHP)
function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

// Muestra un aviso abajo durante unos segundos
function avisar(mensaje, segundos = 2) {
  const aviso = $('#aviso');
  aviso.textContent = mensaje;
  aviso.classList.add('visible');
  clearTimeout(avisar.timer);
  avisar.timer = setTimeout(() => aviso.classList.remove('visible'), segundos * 1000);
}

// Barra de progreso
function barra(porcentaje, clases = '') {
  return `<div class="progreso ${clases}"><div class="progreso__barra" style="width:${porcentaje}%"></div></div>`;
}


/* ---------------------------------------------------------
   9. NAVEGACIÓN: pantallas y pestañas
   --------------------------------------------------------- */

// La pestaña principal en la que estás (Hábitos o Tareas).
// Los botones "←" vuelven a esta.
let pestanaActual = pantallaHoy;

function irA(pantalla) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  pantalla.classList.add('activa');

  // La barra de pestañas solo se ve en las pantallas principales
  const esPrincipal = pantalla.classList.contains('principal');
  $('#pestanas').hidden = !esPrincipal;
  if (esPrincipal) {
    pestanaActual = pantalla;
    document.querySelectorAll('.pestana').forEach(b => {
      b.classList.toggle('activa', b.dataset.pestana === pantalla.id);
    });
  }
  window.scrollTo(0, 0);
}

$('#pestanas').addEventListener('click', (evento) => {
  const boton = evento.target.closest('.pestana');
  if (!boton) return;
  dibujarTodo();
  irA(document.getElementById(boton.dataset.pestana));
});

// Todos los botones "←" vuelven a la pestaña en la que estabas, actualizada
document.querySelectorAll('[data-volver]').forEach(boton => {
  boton.addEventListener('click', () => {
    dibujarTodo();
    irA(pestanaActual);
  });
});

// Botones ⚙ de ambas pestañas
document.querySelectorAll('[data-ajustes]').forEach(boton => {
  boton.addEventListener('click', abrirAjustes);
});


/* ---------------------------------------------------------
   10. MENÚ INFERIOR (lo usan hábitos y tareas)
   ---------------------------------------------------------
   abrirMenu('Título', [
     { texto: 'Editar', accion: () => {...} },
     { texto: 'Eliminar', accion: () => {...}, peligro: true }
   ])
   --------------------------------------------------------- */
const hoja = $('#hoja');
let opcionesMenu = [];

function abrirMenu(titulo, opciones) {
  opcionesMenu = opciones;
  $('#hoja-titulo').textContent = titulo;
  $('#hoja-opciones').innerHTML = opciones.map((o, i) =>
    `<button class="hoja__boton ${o.peligro ? 'hoja__boton--peligro' : ''}" data-opcion="${i}">${escapar(o.texto)}</button>`
  ).join('');
  hoja.hidden = false;
}

function cerrarMenu() {
  hoja.hidden = true;
}

$('#hoja-opciones').addEventListener('click', (evento) => {
  const boton = evento.target.closest('[data-opcion]');
  if (!boton) return;
  const opcion = opcionesMenu[boton.dataset.opcion];
  cerrarMenu();
  opcion.accion();
});

$('#hoja-cancelar').addEventListener('click', cerrarMenu);
hoja.addEventListener('click', (evento) => {
  if (evento.target === hoja) cerrarMenu(); // tocar el fondo oscuro también cierra
});


/* ---------------------------------------------------------
   11. DIBUJAR LA PESTAÑA HÁBITOS
   --------------------------------------------------------- */

function textoFrecuencia(habito) {
  if (habito.tipo === 'limite') {
    return habito.config.periodo === 'dia' ? 'Límite diario' : 'Límite semanal';
  }
  const f = habito.frecuencia;
  if (f.modo === 'diario') return 'Todos los días';
  if (f.modo === 'semanal') return f.veces === 1 ? '1 vez por semana' : `${f.veces} veces por semana`;
  const orden = [1, 2, 3, 4, 5, 6, 0];
  return orden.filter(d => f.dias.includes(d)).map(d => nombresDias[d]).join(' ');
}

function htmlProgreso(habito) {
  const { tipo, config } = habito;
  const valor = valorDia(habito.id);
  let html = '';

  if (tipo === 'temporizador') {
    html = `<p class="habito__progreso-texto">Hoy: ${valor} de ${config.sesiones} sesiones de ${config.minutos} min</p>`
         + barra(Math.min(100, valor / config.sesiones * 100));
  }

  if (tipo === 'contador') {
    html = `<p class="habito__progreso-texto">Hoy: ${valor} de ${config.meta} ${escapar(config.unidad)}</p>`
         + barra(Math.min(100, valor / config.meta * 100));
  }

  if (tipo === 'limite') {
    const consumo = consumoLimite(habito);
    const excedido = consumo > config.maximo;
    const porcentaje = config.maximo === 0 ? (consumo > 0 ? 100 : 0)
                                           : Math.min(100, consumo / config.maximo * 100);
    const cuando = config.periodo === 'semana' ? 'Esta semana' : 'Hoy';
    const texto = excedido
      ? `<span class="texto-peligro">${cuando}: ${consumo} de ${config.maximo} ${escapar(config.unidad)} · te pasaste</span>`
      : `${cuando}: ${consumo} de ${config.maximo} ${escapar(config.unidad)} permitidos`;
    html = `<p class="habito__progreso-texto">${texto}</p>`
         + barra(porcentaje, `progreso--limite ${excedido ? 'progreso--excedido' : ''}`);
  }

  // Los "X veces por semana" muestran además cómo va la semana
  if (esSemanal(habito)) {
    html += `<p class="habito__semana">Esta semana: ${diasCumplidosSemana(habito)} de ${habito.frecuencia.veces}</p>`;
  }

  return html;
}

function htmlBoton(habito) {
  const hechoHoy = habito.tipo !== 'limite' && diaCumplido(habito);
  if (habito.tipo === 'check') {
    return `<button class="accion ${hechoHoy ? 'hecho' : ''}" data-id="${habito.id}"
              aria-label="${hechoHoy ? 'Desmarcar' : 'Marcar como hecho'}">✓</button>`;
  }
  if (habito.tipo === 'temporizador' && hechoHoy) {
    return `<button class="accion hecho" disabled aria-label="Completado hoy">✓</button>`;
  }
  // Sesiones, contador y límite: se suman de a uno
  return `<button class="accion ${hechoHoy ? 'hecho' : ''}" data-id="${habito.id}" aria-label="Sumar uno">+1</button>`;
}

function mostrarFecha() {
  const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
  const texto = new Date().toLocaleDateString('es-AR', opciones);
  document.querySelectorAll('[data-fecha-hoy]').forEach(p => { p.textContent = texto; });
}

// Cuántos hábitos tiene cada categoría
const cantidadEn = (categoria) => datos.habitos.filter(h => h.categoria === categoria).length;

function dibujarFiltros() {
  // Solo mostramos las categorías que tienen hábitos, con su cantidad
  const conHabitos = datos.categorias.filter(c => cantidadEn(c) > 0);

  // Si el filtro elegido se quedó sin hábitos (o se borró), volvemos a "Todas"
  if (filtroActual !== 'Todas' && !conHabitos.includes(filtroActual)) filtroActual = 'Todas';

  const chip = (valor, texto) =>
    `<button class="chip ${valor === filtroActual ? 'activo' : ''}" data-categoria="${escapar(valor)}">${texto}</button>`;

  filtros.innerHTML = chip('Todas', 'Todas')
    + conHabitos.map(c => chip(c, `${escapar(c)} <span class="chip__cantidad">${cantidadEn(c)}</span>`)).join('');
}

let finalizadosAbiertos = false; // recuerda si la sección "Finalizados" estaba desplegada

// La tarjeta de un hábito, según si está activo, por empezar o finalizado
function htmlHabito(h) {
  const estado = estadoHabito(h);
  let detalle = `${escapar(h.categoria)} · ${textoFrecuencia(h)}`;
  let contenido = '';

  if (estado === 'proximo') {
    detalle += ` · empieza el ${fechaCorta(inicioDe(h))}`;
  } else if (estado === 'finalizado') {
    const { mejor } = calcularRachas(h);
    const unidad = rachaEnSemanas(h) ? 'semanas' : 'días';
    detalle += ` · terminó el ${fechaCorta(h.fin)}`;
    if (mejor) contenido = `<p class="habito__racha habito__racha--apagada">Récord: ${mejor} ${unidad}</p>`;
  } else {
    if (h.fin) detalle += ` · hasta el ${fechaCorta(h.fin)}`;
    if (!tocaHoy(h)) detalle += ' · hoy no toca';
    contenido = htmlProgreso(h) + textoRacha(h);
  }

  const apagado = estado !== 'activo' || !tocaHoy(h);
  return `
    <article class="habito ${estado === 'activo' && estaCumplido(h) ? 'cumplido' : ''} ${apagado ? 'no-toca' : ''}"
             style="--color-habito:${h.color}">
      <div class="habito__info" data-menu="${h.id}">
        <p class="habito__nombre">${escapar(h.nombre)}</p>
        <p class="habito__detalle">${detalle}</p>
        ${contenido}
      </div>
      ${tocaHoy(h) ? htmlBoton(h) : ''}
    </article>`;
}

// Recordamos si "Finalizados" quedó abierta (el evento "toggle" no burbujea: usamos captura)
lista.addEventListener('toggle', (evento) => {
  if (evento.target.id === 'seccion-finalizados') finalizadosAbiertos = evento.target.open;
}, true);

function dibujarLista() {
  // Sin ningún hábito todavía: ofrecemos cargar ejemplos
  if (datos.habitos.length === 0) {
    lista.innerHTML = `
      <div class="vacio">
        <p>Todavía no tenés hábitos.<br>Tocá + para crear el primero.</p>
        <button class="boton-principal" id="btn-ejemplos">Cargar hábitos de ejemplo</button>
      </div>`;
    $('#resumen-dia').textContent = '';
    return;
  }

  const visibles = datos.habitos.filter(h => filtroActual === 'Todas' || h.categoria === filtroActual);

  // Separamos según la duración
  const activos     = visibles.filter(h => estadoHabito(h) === 'activo');
  const proximos    = visibles.filter(h => estadoHabito(h) === 'proximo');
  const finalizados = visibles.filter(h => estadoHabito(h) === 'finalizado');

  // Activos: primero los pendientes de hoy, después los cumplidos, al final los que no tocan
  const peso = (h) => !tocaHoy(h) ? 2 : estaCumplido(h) ? 1 : 0;
  activos.sort((a, b) => peso(a) - peso(b));
  proximos.sort((a, b) => inicioDe(a).localeCompare(inicioDe(b)));   // el que empieza antes, primero
  finalizados.sort((a, b) => b.fin.localeCompare(a.fin));            // el que terminó último, primero

  let html = activos.map(htmlHabito).join('') + proximos.map(htmlHabito).join('');

  if (activos.length + proximos.length === 0) {
    html = `<p class="vacio">No hay hábitos activos${filtroActual === 'Todas' ? '' : ' en esta categoría'}.</p>`;
  }

  // Los finalizados van en una sección plegable, como las tareas hechas
  if (finalizados.length) {
    html += `
      <details class="hechas" id="seccion-finalizados" ${finalizadosAbiertos ? 'open' : ''}>
        <summary>Finalizados (${finalizados.length})</summary>
        <div class="lista-habitos">${finalizados.map(htmlHabito).join('')}</div>
      </details>`;
  }

  lista.innerHTML = html;

  // (tocaHoy ya deja afuera los que no empezaron o terminaron)
  const deHoy = datos.habitos.filter(h => tocaHoy(h) && h.tipo !== 'limite');
  const hechos = deHoy.filter(estaCumplido).length;
  $('#resumen-dia').textContent = deHoy.length ? `${hechos} de ${deHoy.length} cumplidos` : '';
}

// Redibuja las dos pestañas
function dibujarTodo() {
  mostrarFecha();
  dibujarFiltros();
  dibujarLista();
  dibujarTareas(); // está en tareas.js
}


/* ---------------------------------------------------------
   12. ACCIONES EN LA LISTA DE HÁBITOS
   --------------------------------------------------------- */

lista.addEventListener('click', (evento) => {
  // Botón "Cargar hábitos de ejemplo"
  if (evento.target.closest('#btn-ejemplos')) {
    cargarEjemplos();
    return;
  }

  // Tocar el nombre/info del hábito abre su menú
  const info = evento.target.closest('[data-menu]');
  if (info) {
    abrirMenuHabito(Number(info.dataset.menu));
    return;
  }

  // Botón de acción (✓ o +1)
  const boton = evento.target.closest('.accion[data-id]');
  if (!boton) return;

  const habito = datos.habitos.find(h => h.id === Number(boton.dataset.id));
  const valor = valorDia(habito.id);

  if (habito.tipo === 'check') {
    ponerValor(habito.id, valor ? 0 : 1); // marcar / desmarcar
  } else {
    ponerValor(habito.id, valor + 1);     // sesiones, contador y límite

    if (habito.tipo === 'temporizador') {
      const total = habito.config.sesiones;
      avisar(valor + 1 >= total
        ? `¡Completaste las ${total} sesiones de hoy!`
        : `Sesión ${valor + 1} de ${total} registrada`);
    }
    if (habito.tipo === 'limite' && consumoLimite(habito) === habito.config.maximo + 1) {
      avisar(`Te pasaste del límite de ${habito.nombre}`);
    }
  }

  dibujarLista();
});

filtros.addEventListener('click', (evento) => {
  const chip = evento.target.closest('.chip');
  if (!chip) return;
  filtroActual = chip.dataset.categoria;
  dibujarTodo();
});

function abrirMenuHabito(id) {
  const habito = datos.habitos.find(h => h.id === id);
  const opciones = [
    { texto: 'Ver historial y calendario', accion: () => abrirDetalle(id) },
    { texto: 'Editar hábito', accion: () => abrirFormularioHabito(habito) }
  ];
  // "Restar 1" solo tiene sentido si hoy hay algo registrado y no es un check
  if (habito.tipo !== 'check' && valorDia(id) > 0) {
    opciones.push({
      texto: 'Restar 1 al registro de hoy',
      accion: () => { ponerValor(id, valorDia(id) - 1); dibujarLista(); }
    });
  }
  opciones.push({ texto: 'Eliminar hábito', peligro: true, accion: () => eliminarHabito(habito) });

  abrirMenu(habito.nombre, opciones);
}

function eliminarHabito(habito) {
  if (!confirm(`¿Eliminar "${habito.nombre}" y todo su historial?`)) return;

  datos.habitos = datos.habitos.filter(h => h.id !== habito.id);
  // Borramos también sus registros de todos los días
  for (const clave of Object.keys(datos.registros)) {
    delete datos.registros[clave][habito.id];
    if (Object.keys(datos.registros[clave]).length === 0) delete datos.registros[clave];
  }
  guardarDatos();
  dibujarTodo();
  irA(pantallaHoy);
  avisar('Hábito eliminado');
}


/* ---------------------------------------------------------
   13. HÁBITOS DE EJEMPLO
   --------------------------------------------------------- */

function cargarEjemplos() {
  const base = Date.now();
  const ejemplos = [
    { nombre: 'Lavarme los dientes', categoria: 'Salud', color: '#0ea5e9',
      tipo: 'check', frecuencia: { modo: 'diario' }, config: {} },
    { nombre: 'Pomodoros de Gestión de Proyectos', categoria: 'Estudio', color: '#4f46e5',
      tipo: 'temporizador', frecuencia: { modo: 'dias', dias: [1, 2, 3, 4, 5] },
      config: { sesiones: 2, minutos: 25, descanso: 5 } },
    { nombre: 'Tomar agua', categoria: 'Salud', color: '#10b981',
      tipo: 'contador', frecuencia: { modo: 'diario' }, config: { meta: 8, unidad: 'vasos' } },
    { nombre: 'Café', categoria: 'Salud', color: '#f59e0b',
      tipo: 'limite', frecuencia: null, config: { maximo: 3, unidad: 'cafés', periodo: 'dia' } },
    { nombre: 'Pasear por el parque', categoria: 'Personal', color: '#ec4899',
      tipo: 'check', frecuencia: { modo: 'semanal', veces: 1 }, config: {} }
  ];

  // Los ejemplos "se crearon" hace 35 días, para que tengan historia
  const DIAS_DE_HISTORIA = 35;
  const creado = claveFecha(sumarDias(new Date(), -DIAS_DE_HISTORIA));
  datos.habitos = ejemplos.map((h, i) => ({ id: base + i, creado, inicio: creado, fin: null, ...h }));

  // Inventamos un historial con algunas fallas, para ver rachas cortadas.
  // n = cuántos días atrás. Hoy (n = 0) queda vacío para que lo marques vos.
  const [dientes, pomodoros, agua, cafe, parque] = datos.habitos;
  for (let n = DIAS_DE_HISTORIA; n >= 1; n--) {
    const fecha = sumarDias(new Date(), -n);
    const clave = claveFecha(fecha);
    const diaSemana = fecha.getDay();

    if (n !== 13 && n !== 27) ponerValor(dientes.id, 1, clave);
    if (diaSemana >= 1 && diaSemana <= 5) ponerValor(pomodoros.id, n === 18 ? 1 : 2, clave);
    ponerValor(agua.id, n % 9 === 4 ? 5 : 8, clave);
    ponerValor(cafe.id, n === 6 ? 5 : (n % 3) + 1, clave);
    if (diaSemana === 6 && (n < 21 || n > 27)) ponerValor(parque.id, 1, clave);
  }

  guardarDatos();
  dibujarTodo();
}


/* ---------------------------------------------------------
   14. FORMULARIO DE HÁBITO (nuevo y editar)
   --------------------------------------------------------- */

// null = creando uno nuevo; un id = editando ese hábito
let editandoHabitoId = null;

// Opciones del select de categoría, con una última opción para crear una nueva
function dibujarSelectCategorias(elegida) {
  $('#select-categoria').innerHTML =
      datos.categorias.map(c => `<option ${c === elegida ? 'selected' : ''}>${escapar(c)}</option>`).join('')
    + `<option value="__nueva__">+ Nueva categoría…</option>`;
}

// Si elige "+ Nueva categoría…", la pedimos y la dejamos seleccionada
$('#select-categoria').addEventListener('change', (evento) => {
  if (evento.target.value !== '__nueva__') return;
  const nueva = agregarCategoria(prompt('Nombre de la nueva categoría:'));
  dibujarSelectCategorias(nueva || datos.categorias[0]);
});

function prepararFormulario() {
  dibujarSelectCategorias();
  $('#selector-colores').innerHTML = colores.map((c, i) => `
    <label class="color">
      <input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''}>
      <span style="--c:${c}" aria-label="Color ${i + 1}"></span>
    </label>`).join('');
}

// Muestra/oculta las partes del formulario según tipo y frecuencia elegidos
function actualizarFormulario() {
  const tipo = formulario.tipo.value;
  const frecuencia = formulario.frecuencia.value;

  document.querySelectorAll('[data-tipo]').forEach(div => {
    div.hidden = div.dataset.tipo !== tipo;
  });

  // El tipo Límite tiene su propio período, así que oculta la frecuencia
  $('#bloque-frecuencia').hidden = (tipo === 'limite');

  document.querySelectorAll('[data-frecuencia]').forEach(div => {
    div.hidden = div.dataset.frecuencia !== frecuencia;
  });
}

formulario.addEventListener('change', actualizarFormulario);

document.querySelectorAll('.atajos .chip').forEach(boton => {
  boton.addEventListener('click', () => {
    const elegidos = boton.dataset.dias.split(',');
    formulario.querySelectorAll('input[name="dias"]').forEach(casilla => {
      casilla.checked = elegidos.includes(casilla.value);
    });
  });
});

// Abre el formulario vacío (habito = undefined) o cargado con un hábito para editarlo
function abrirFormularioHabito(habito) {
  formulario.reset();
  editandoHabitoId = habito ? habito.id : null;

  $('#titulo-form').textContent = habito ? 'Editar hábito' : 'Nuevo hábito';
  $('#btn-guardar-habito').textContent = habito ? 'Guardar cambios' : 'Guardar hábito';

  // Al editar, el tipo queda fijo
  formulario.querySelectorAll('input[name="tipo"]').forEach(radio => { radio.disabled = Boolean(habito); });
  $('#ayuda-tipo-fijo').hidden = !habito;

  if (!habito) {
    // Si estás filtrando una categoría, el hábito nuevo arranca en esa
    dibujarSelectCategorias(filtroActual !== 'Todas' ? filtroActual : undefined);
  } else {
    // Cargamos los valores del hábito en cada campo
    formulario.nombre.value = habito.nombre;
    dibujarSelectCategorias(habito.categoria);
    formulario.color.value = habito.color;
    formulario.tipo.value = habito.tipo;

    const c = habito.config;
    if (habito.tipo === 'temporizador') {
      formulario.sesiones.value = c.sesiones;
      formulario.minutos.value = c.minutos;
      formulario.descanso.value = c.descanso;
    } else if (habito.tipo === 'contador') {
      formulario.meta.value = c.meta;
      formulario.unidadContador.value = c.unidad;
    } else if (habito.tipo === 'limite') {
      formulario.maximo.value = c.maximo;
      formulario.unidadLimite.value = c.unidad;
      formulario.periodo.value = c.periodo;
    }

    if (habito.frecuencia) {
      formulario.frecuencia.value = habito.frecuencia.modo;
      if (habito.frecuencia.modo === 'dias') {
        formulario.querySelectorAll('input[name="dias"]').forEach(casilla => {
          casilla.checked = habito.frecuencia.dias.includes(Number(casilla.value));
        });
      }
      if (habito.frecuencia.modo === 'semanal') formulario.veces.value = habito.frecuencia.veces;
    }
  }

  // --- Duración ---
  // El inicio no puede ser en el pasado. Si el hábito ya empezó, queda fijo.
  const yaEmpezo = Boolean(habito) && inicioDe(habito) <= hoy;
  formulario.inicio.value = habito ? inicioDe(habito) : hoy;
  formulario.inicio.min = yaEmpezo ? '' : hoy;
  formulario.inicio.disabled = yaEmpezo;
  formulario.fin.value = habito && habito.fin ? habito.fin : '';
  formulario.fin.min = formulario.inicio.value;
  $('#ayuda-duracion').textContent = yaEmpezo
    ? 'Ya empezó, así que el inicio queda fijo. Podés cambiar o quitar la fecha de fin.'
    : 'Dejá "Termina el" vacío para un hábito permanente.';

  actualizarFormulario();
  irA(pantallaNuevo);
  if (!habito) formulario.nombre.focus();
}

// Si cambia el inicio, el fin no puede quedar antes
formulario.inicio.addEventListener('change', () => {
  formulario.fin.min = formulario.inicio.value;
});

$('#btn-nuevo').addEventListener('click', () => abrirFormularioHabito());

// Lee un número de un campo, con un valor por defecto si está vacío
const numero = (form, nombre, porDefecto) => {
  const valor = parseInt(form[nombre].value, 10);
  return Number.isNaN(valor) ? porDefecto : valor;
};

formulario.addEventListener('submit', (evento) => {
  evento.preventDefault();

  const nombre = formulario.nombre.value.trim();
  if (!nombre) {
    avisar('Poné un nombre para el hábito');
    formulario.nombre.focus();
    return;
  }

  const tipo = formulario.tipo.value;

  let config = {};
  if (tipo === 'temporizador') {
    config = {
      sesiones: numero(formulario, 'sesiones', 1),
      minutos: numero(formulario, 'minutos', 25),
      descanso: numero(formulario, 'descanso', 0)
    };
  } else if (tipo === 'contador') {
    config = { meta: numero(formulario, 'meta', 1), unidad: formulario.unidadContador.value.trim() || 'veces' };
  } else if (tipo === 'limite') {
    config = {
      maximo: numero(formulario, 'maximo', 0),
      unidad: formulario.unidadLimite.value.trim() || 'veces',
      periodo: formulario.periodo.value
    };
  }

  let frecuencia = null;
  if (tipo !== 'limite') {
    const modo = formulario.frecuencia.value;
    if (modo === 'diario') {
      frecuencia = { modo };
    } else if (modo === 'dias') {
      const dias = [...formulario.querySelectorAll('input[name="dias"]:checked')].map(c => Number(c.value));
      if (dias.length === 0) {
        avisar('Elegí al menos un día');
        return;
      }
      frecuencia = { modo, dias };
    } else {
      frecuencia = { modo, veces: numero(formulario, 'veces', 1) };
    }
  }

  // Duración (un campo deshabilitado igual se puede leer con .value)
  const inicio = formulario.inicio.value || hoy;
  const fin = formulario.fin.value || null;
  if (!formulario.inicio.disabled && inicio < hoy) {
    avisar('La fecha de inicio no puede ser en el pasado');
    return;
  }
  if (fin && fin < inicio) {
    avisar('La fecha de fin no puede ser anterior al inicio');
    return;
  }

  const campos = {
    nombre,
    categoria: formulario.categoria.value,
    color: formulario.color.value,
    frecuencia,
    config,
    inicio,
    fin
  };

  if (editandoHabitoId) {
    // Editar: pisamos los campos, pero conservamos id, tipo y fecha de creación
    const habito = datos.habitos.find(h => h.id === editandoHabitoId);
    Object.assign(habito, campos);
    avisar('Cambios guardados');
  } else {
    datos.habitos.push({ id: Date.now(), tipo, creado: hoy, ...campos });
    filtroActual = 'Todas';
    avisar('Hábito creado');
  }
  guardarDatos();
  dibujarTodo();
  irA(pantallaHoy);
});


/* ---------------------------------------------------------
   15. DETALLE DEL HÁBITO: estadísticas y calendario
   --------------------------------------------------------- */

const detalle = { habito: null, mes: null }; // mes = Date del día 1 del mes que se ve

function abrirDetalle(id) {
  detalle.habito = datos.habitos.find(h => h.id === id);
  const ahora = new Date();
  detalle.mes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  dibujarDetalle();
  irA(pantallaDetalle);
}

$('#detalle-editar').addEventListener('click', () => abrirFormularioHabito(detalle.habito));

// Cómo quedó un día puntual, para pintarlo en el calendario
function estadoDelDia(habito, clave) {
  if (clave > hoy) return 'futuro';
  if (clave < inicioDe(habito) || (habito.fin && clave > habito.fin)) return 'fuera';

  const fecha = fechaDesdeClave(clave);
  const valor = valorDia(habito.id, clave);

  if (habito.tipo === 'limite') {
    // En los límites semanales, un día queda "mal" si su semana se pasó
    const consumo = habito.config.periodo === 'semana'
      ? clavesDeLaSemana(fecha)
          .filter(c => c >= inicioDe(habito) && (!habito.fin || c <= habito.fin))
          .reduce((suma, c) => suma + valorDia(habito.id, c), 0)
      : valor;
    if (consumo > habito.config.maximo) return 'mal';
    return clave === hoy ? 'hoy' : 'ok';
  }

  if (habito.frecuencia.modo === 'dias' && !habito.frecuencia.dias.includes(fecha.getDay())) return 'no-toca';
  if (valor >= metaDiaria(habito)) return 'ok';
  if (valor > 0) return 'parcial';
  if (clave === hoy) return 'hoy';
  // En los "X veces por semana", un día sin hacer no es una falla
  if (esSemanal(habito)) return 'libre';
  return 'mal';
}

function dibujarDetalle() {
  const h = detalle.habito;
  const grilla = $('#calendario');
  pantallaDetalle.style.setProperty('--color-habito', h.color);

  $('#detalle-nombre').textContent = h.nombre;
  const periodo = h.fin
    ? `del ${fechaCorta(inicioDe(h))} al ${fechaCorta(h.fin)}`
    : `desde el ${fechaCorta(inicioDe(h))}`;
  $('#detalle-info').textContent = `${h.categoria} · ${textoFrecuencia(h)} · ${periodo}`;

  // --- Estadísticas ---
  const { actual, mejor } = calcularRachas(h);
  const unidad = rachaEnSemanas(h) ? 'semanas' : 'días';
  let diasOk = 0;
  for (let f = fechaDesdeClave(inicioDe(h)); claveFecha(f) <= ultimoDiaEvaluado(h); f = sumarDias(f, 1)) {
    if (estadoDelDia(h, claveFecha(f)) === 'ok') diasOk++;
  }
  const textoOk = h.tipo === 'limite' ? 'días dentro del límite' : 'días cumplidos';

  $('#detalle-estadisticas').innerHTML = `
    <div class="estadistica"><strong>${actual}</strong><span>racha actual (${unidad})</span></div>
    <div class="estadistica"><strong>${mejor}</strong><span>récord (${unidad})</span></div>
    <div class="estadistica"><strong>${diasOk}</strong><span>${textoOk}</span></div>`;

  // --- Calendario del mes ---
  const anio = detalle.mes.getFullYear();
  const mes = detalle.mes.getMonth();
  $('#mes-titulo').textContent = detalle.mes.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  const huecos = (detalle.mes.getDay() + 6) % 7;         // celdas vacías antes del día 1 (semana arranca el lunes)
  const diasDelMes = new Date(anio, mes + 1, 0).getDate(); // el "día 0" del mes siguiente es el último de este

  let html = '<span></span>'.repeat(huecos);
  for (let d = 1; d <= diasDelMes; d++) {
    const clave = claveFecha(new Date(anio, mes, d));
    const estado = estadoDelDia(h, clave);
    const editable = !['futuro', 'fuera', 'no-toca'].includes(estado);
    html += `<button class="dia-cal dia-cal--${estado}" data-clave="${clave}" ${editable ? '' : 'disabled'}
               aria-label="${d}, ${estado}">${d}</button>`;
  }
  grilla.innerHTML = html;

  // No se puede ir antes del mes de inicio ni después del mes actual
  const claveMes = claveFecha(detalle.mes).slice(0, 7); // '2026-10'
  $('#mes-anterior').disabled = claveMes <= inicioDe(h).slice(0, 7);
  $('#mes-siguiente').disabled = claveMes >= hoy.slice(0, 7);
}

$('#mes-anterior').addEventListener('click', () => {
  detalle.mes = new Date(detalle.mes.getFullYear(), detalle.mes.getMonth() - 1, 1);
  dibujarDetalle();
});

$('#mes-siguiente').addEventListener('click', () => {
  detalle.mes = new Date(detalle.mes.getFullYear(), detalle.mes.getMonth() + 1, 1);
  dibujarDetalle();
});

// Tocar un día permite corregir su registro
$('#calendario').addEventListener('click', (evento) => {
  const celda = evento.target.closest('.dia-cal[data-clave]');
  if (!celda) return;

  const h = detalle.habito;
  const clave = celda.dataset.clave;
  const actual = valorDia(h.id, clave);

  if (h.tipo === 'check') {
    ponerValor(h.id, actual ? 0 : 1, clave);
  } else {
    const fechaTexto = fechaDesdeClave(clave).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
    const queSeCarga = h.tipo === 'temporizador' ? 'Sesiones hechas' : `Cantidad de ${h.config.unidad}`;
    const respuesta = prompt(`${queSeCarga} el ${fechaTexto}:`, actual);
    if (respuesta === null) return; // tocó Cancelar
    const valor = parseInt(respuesta, 10);
    if (Number.isNaN(valor) || valor < 0) {
      avisar('Poné un número de 0 en adelante');
      return;
    }
    ponerValor(h.id, valor, clave);
  }
  dibujarDetalle();
});


/* ---------------------------------------------------------
   16. AJUSTES: categorías
   --------------------------------------------------------- */

// Valida y agrega una categoría. Devuelve el nombre si se agregó.
function agregarCategoria(nombre) {
  nombre = (nombre || '').trim();
  if (!nombre) return null;

  // Sin repetidas, sin importar mayúsculas: "salud" = "Salud"
  const existe = datos.categorias.find(c => c.toLowerCase() === nombre.toLowerCase());
  if (existe) {
    avisar(`Ya existe la categoría "${existe}"`);
    return existe;
  }
  datos.categorias.push(nombre);
  guardarDatos();
  return nombre;
}

function abrirAjustes() {
  dibujarCategorias();
  dibujarInfoRespaldo();
  irA(pantallaAjustes);
}

function dibujarCategorias() {
  $('#lista-categorias').innerHTML = datos.categorias.map((c, i) => {
    const n = cantidadEn(c);
    return `
      <li class="categoria">
        <span class="categoria__nombre">${escapar(c)}</span>
        <span class="categoria__cantidad">${n} ${n === 1 ? 'hábito' : 'hábitos'}</span>
        <button data-renombrar="${i}" aria-label="Renombrar ${escapar(c)}">✏️</button>
        <button data-borrar="${i}" aria-label="Eliminar ${escapar(c)}">🗑</button>
      </li>`;
  }).join('');
}

$('#form-categoria').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const campo = evento.target.nombre;
  if (!campo.value.trim()) {
    avisar('Escribí un nombre');
    return;
  }
  agregarCategoria(campo.value);
  campo.value = '';
  dibujarCategorias();
});

$('#lista-categorias').addEventListener('click', (evento) => {
  const renombrar = evento.target.closest('[data-renombrar]');
  const borrar = evento.target.closest('[data-borrar]');

  if (renombrar) {
    const vieja = datos.categorias[renombrar.dataset.renombrar];
    const nueva = (prompt('Nuevo nombre:', vieja) || '').trim();
    if (!nueva || nueva === vieja) return;
    if (datos.categorias.some(c => c !== vieja && c.toLowerCase() === nueva.toLowerCase())) {
      avisar('Ya existe una categoría con ese nombre');
      return;
    }
    // Cambiamos el nombre en la lista y en todos los hábitos que la usan
    datos.categorias[renombrar.dataset.renombrar] = nueva;
    datos.habitos.forEach(h => { if (h.categoria === vieja) h.categoria = nueva; });
    if (filtroActual === vieja) filtroActual = nueva;
  }

  if (borrar) {
    if (datos.categorias.length === 1) {
      avisar('Tiene que quedar al menos una categoría');
      return;
    }
    const indice = Number(borrar.dataset.borrar);
    const categoria = datos.categorias[indice];
    const n = cantidadEn(categoria);
    // Si tiene hábitos, los pasamos a otra categoría para no dejarlos huérfanos
    const destino = datos.categorias.find(c => c !== categoria);
    const pregunta = n === 0
      ? `¿Eliminar la categoría "${categoria}"?`
      : `"${categoria}" tiene ${n} ${n === 1 ? 'hábito' : 'hábitos'}. Si la eliminás, pasan a "${destino}". ¿Seguimos?`;
    if (!confirm(pregunta)) return;

    datos.habitos.forEach(h => { if (h.categoria === categoria) h.categoria = destino; });
    datos.categorias.splice(indice, 1);
  }

  if (renombrar || borrar) {
    guardarDatos();
    dibujarCategorias();
  }
});


/* ---------------------------------------------------------
   17. AJUSTES: respaldo (exportar e importar)
   --------------------------------------------------------- */

function dibujarInfoRespaldo() {
  $('#info-respaldo').textContent = datos.ultimoRespaldo
    ? `Último respaldo: ${fechaDesdeClave(datos.ultimoRespaldo).toLocaleDateString('es-AR')}`
    : 'Todavía no hiciste ningún respaldo.';
}

$('#btn-exportar').addEventListener('click', () => {
  datos.ultimoRespaldo = hoy;
  guardarDatos();

  // Armamos un archivo JSON con todos los datos
  const contenido = JSON.stringify({ app: 'mis-habitos', exportado: new Date().toISOString(), datos }, null, 2);
  const archivo = new Blob([contenido], { type: 'application/json' });

  // Truco para descargar: un link invisible que apunta al archivo y lo "clickeamos"
  const link = document.createElement('a');
  link.href = URL.createObjectURL(archivo);
  link.download = `mis-habitos-respaldo-${hoy}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);

  dibujarInfoRespaldo();
  avisar('Respaldo descargado. Buscalo en Descargas.', 3);
});

// El botón abre el selector de archivos (que está oculto)
$('#btn-importar').addEventListener('click', () => $('#archivo-respaldo').click());

$('#archivo-respaldo').addEventListener('change', async (evento) => {
  const archivo = evento.target.files[0];
  evento.target.value = ''; // para poder elegir el mismo archivo otra vez
  if (!archivo) return;

  let leidos;
  try {
    const json = JSON.parse(await archivo.text());
    leidos = json.datos;
    // Revisamos que tenga la forma esperada
    if (json.app !== 'mis-habitos' || !leidos || !Array.isArray(leidos.habitos) || typeof leidos.registros !== 'object') {
      throw new Error('formato');
    }
  } catch {
    avisar('Ese archivo no es un respaldo de Mis Hábitos', 3);
    return;
  }

  const nh = leidos.habitos.length;
  const nt = (leidos.tareas || []).length;
  const pregunta = `El respaldo tiene ${nh} ${nh === 1 ? 'hábito' : 'hábitos'} y ${nt} ${nt === 1 ? 'tarea' : 'tareas'}.\n`
                 + 'Va a REEMPLAZAR todos tus datos actuales. ¿Seguimos?';
  if (!confirm(pregunta)) return;

  datos = normalizarDatos(leidos);
  guardarDatos();
  filtroActual = 'Todas';
  dibujarTodo();
  abrirAjustes();
  avisar('Respaldo importado');
});


/* ---------------------------------------------------------
   18. CAMBIO DE DÍA
   ---------------------------------------------------------
   Si dejás la app abierta y pasa la medianoche, al volver a ella
   se actualiza sola para mostrar el día nuevo.
   --------------------------------------------------------- */
function revisarCambioDeDia() {
  const ahora = claveFecha();
  if (ahora !== hoy) {
    hoy = ahora;
    dibujarTodo();
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) revisarCambioDeDia();
});
setInterval(revisarCambioDeDia, 60 * 1000); // y una vez por minuto, por las dudas


/* ---------------------------------------------------------
   19. PWA: instalación, funcionamiento sin internet y actualizaciones
   --------------------------------------------------------- */

const MENSAJE_VERSION_NUEVA = 'Hay una versión nueva. Cerrá y abrí la app para verla.';

// El service worker solo funciona en https (o en localhost), no abriendo el archivo con doble clic
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(error => console.error('No se pudo registrar el service worker', error));
  });

  // El service worker nos avisa cuando bajó archivos nuevos (ver sw.js)
  navigator.serviceWorker.addEventListener('message', (evento) => {
    if (evento.data && evento.data.tipo === 'version-nueva') avisar(MENSAJE_VERSION_NUEVA, 6);
  });

  // También avisamos si se instaló un service worker nuevo
  let habiaControlador = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (habiaControlador) avisar(MENSAJE_VERSION_NUEVA, 6);
    habiaControlador = true;
  });
}

// Pedimos al navegador que no borre nuestros datos si le falta espacio
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// Botón "Instalar app" (Chrome en Android y en la compu).
// El navegador avisa con "beforeinstallprompt" cuando la app se puede instalar;
// guardamos ese aviso y lo usamos cuando tocás el botón.
let pedidoInstalacion = null;

window.addEventListener('beforeinstallprompt', (evento) => {
  evento.preventDefault();
  pedidoInstalacion = evento;
  $('#btn-instalar').hidden = false;
});

$('#btn-instalar').addEventListener('click', async () => {
  if (!pedidoInstalacion) return;
  pedidoInstalacion.prompt();
  await pedidoInstalacion.userChoice;
  pedidoInstalacion = null;
  $('#btn-instalar').hidden = true;
});

window.addEventListener('appinstalled', () => {
  $('#btn-instalar').hidden = true;
  avisar('¡App instalada!');
});


/* ---------------------------------------------------------
   20. ARRANQUE
   ---------------------------------------------------------
   Esperamos a DOMContentLoaded para que tareas.js ya esté cargado
   (los <script> del final del body se ejecutan antes de ese evento).
   --------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  prepararFormulario();
  dibujarTodo();
});
