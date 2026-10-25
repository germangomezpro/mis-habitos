/* =========================================================
   MIS HÁBITOS — app.js
   ETAPA 5 (PWA instalable y sin internet): los hábitos y el historial se guardan en el celular
   (localStorage); el progreso y las rachas se calculan a partir
   del historial. Categorías propias, filtros y calendario por hábito.
   ========================================================= */


/* ---------------------------------------------------------
   1. CONSTANTES
   --------------------------------------------------------- */

// Nombre con el que se guardan los datos en el navegador.
// El "v1" nos permite cambiar el formato en el futuro sin romper nada.
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
     habitos: [ { id, nombre, categoria, color, tipo, frecuencia, config, creado } ],
     registros: {
       '2026-10-25': { 1730000000000: 1, 1730000000001: 5 },   // id del hábito → valor
       '2026-10-26': { ... }
     }
   }

   El "valor" de un día significa:
     - check:        1 = hecho
     - temporizador: cantidad de sesiones completadas
     - contador:     cuánto sumaste (vasos, páginas...)
     - límite:       cuántas veces lo hiciste

   Separar la DEFINICIÓN del hábito (habitos) de lo que HICISTE cada día
   (registros) es la clave: con el historial completo podemos calcular
   progreso, rachas y estadísticas sin guardar nada calculado.
   --------------------------------------------------------- */

let datos = cargarDatos();
let filtroActual = 'Todas';
let habitoDelMenu = null; // hábito abierto en el menú inferior


/* ---------------------------------------------------------
   3. GUARDAR Y CARGAR
   --------------------------------------------------------- */

function datosVacios() {
  return { version: 1, categorias: [...CATEGORIAS_INICIALES], habitos: [], registros: {} };
}

function cargarDatos() {
  try {
    const texto = localStorage.getItem(CLAVE_GUARDADO);
    if (!texto) return datosVacios();      // primera vez que se abre la app
    const leidos = JSON.parse(texto);      // texto → objeto
    // Nos aseguramos de que estén todas las partes
    return { ...datosVacios(), ...leidos };
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

// Las 7 claves de la semana actual, de lunes a domingo
function clavesDeLaSemana(fecha = new Date()) {
  const lunes = new Date(fecha);
  const desdeLunes = (fecha.getDay() + 6) % 7; // lunes=0 ... domingo=6
  lunes.setDate(fecha.getDate() - desdeLunes);

  const claves = [];
  for (let i = 0; i < 7; i++) {
    const dia = new Date(lunes);
    dia.setDate(lunes.getDate() + i);
    claves.push(claveFecha(dia));
  }
  return claves;
}

// Guardamos qué día es "hoy" para detectar cuando pasa la medianoche
let hoy = claveFecha();


/* ---------------------------------------------------------
   5. LEER Y ESCRIBIR REGISTROS
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

// Suma de los valores de toda la semana (para límites semanales)
function valorSemana(id) {
  return clavesDeLaSemana().reduce((total, clave) => total + valorDia(id, clave), 0);
}


/* ---------------------------------------------------------
   6. LÓGICA DE CUMPLIMIENTO
   --------------------------------------------------------- */

// Cuánto hay que hacer en UN día para que ese día cuente como hecho
function metaDiaria(habito) {
  if (habito.tipo === 'temporizador') return habito.config.sesiones;
  if (habito.tipo === 'contador') return habito.config.meta;
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

// ¿El hábito "toca" hoy? (los de días fijos solo tocan esos días)
function tocaHoy(habito) {
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
   6 bis. RACHAS
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

// ¿La racha de este hábito se cuenta en semanas?
function rachaEnSemanas(habito) {
  return esSemanal(habito) || (habito.tipo === 'limite' && habito.config.periodo === 'semana');
}

// Etiquetas de cada DÍA, desde la creación hasta hoy
function estadosPorDia(habito) {
  const estados = [];
  // Las claves 'AAAA-MM-DD' se pueden comparar como texto: '2026-10-24' < '2026-10-25'
  for (let fecha = fechaDesdeClave(habito.creado); claveFecha(fecha) <= hoy; fecha = sumarDias(fecha, 1)) {
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

// Etiquetas de cada SEMANA (lunes a domingo), desde la creación hasta hoy
function estadosPorSemana(habito) {
  const estados = [];
  const creado = fechaDesdeClave(habito.creado);
  const primerLunes = sumarDias(creado, -((creado.getDay() + 6) % 7));

  for (let lunes = primerLunes; claveFecha(lunes) <= hoy; lunes = sumarDias(lunes, 7)) {
    const claves = clavesDeLaSemana(lunes);
    const esActual = claves.includes(hoy);
    const esPrimera = lunes.getTime() === primerLunes.getTime();

    if (habito.tipo === 'limite') {
      const total = claves.reduce((suma, clave) => suma + valorDia(habito.id, clave), 0);
      const pasado = total > habito.config.maximo;
      estados.push(pasado ? 'mal' : esActual ? 'nada' : 'ok');
      continue;
    }

    // X veces por semana
    const hechos = claves.filter(clave => diaCumplido(habito, clave)).length;
    const cumplida = hechos >= habito.frecuencia.veces;
    // La semana en curso no corta (todavía hay tiempo), y la semana en que
    // creaste el hábito tampoco, porque quizás la empezaste por la mitad
    estados.push(cumplida ? 'ok' : (esActual || esPrimera) ? 'nada' : 'mal');
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
   7. ELEMENTOS DEL HTML
   --------------------------------------------------------- */
const $ = (selector) => document.querySelector(selector);

const pantallaHoy   = $('#pantalla-hoy');
const pantallaNuevo = $('#pantalla-nuevo');
const pantallaDetalle    = $('#pantalla-detalle');
const pantallaCategorias = $('#pantalla-categorias');
const lista         = $('#lista-habitos');
const filtros       = $('#filtros');
const formulario    = $('#form-habito');
const hoja          = $('#hoja');


/* ---------------------------------------------------------
   8. TEXTOS Y PEDACITOS DE HTML
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

function barra(porcentaje, clases = '') {
  return `<div class="progreso ${clases}"><div class="progreso__barra" style="width:${porcentaje}%"></div></div>`;
}

function htmlProgreso(habito) {
  const { tipo, config } = habito;
  const valor = valorDia(habito.id);
  let html = '';

  if (tipo === 'temporizador') {
    html = `<p class="habito__progreso-texto">Hoy: ${valor} de ${config.sesiones} sesiones · ${config.minutos} min</p>`
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
  switch (habito.tipo) {
    case 'check':
      return `<button class="accion ${hechoHoy ? 'hecho' : ''}" data-id="${habito.id}"
                aria-label="${hechoHoy ? 'Desmarcar' : 'Marcar como hecho'}">✓</button>`;
    case 'temporizador':
      return hechoHoy
        ? `<button class="accion hecho" disabled aria-label="Completado hoy">✓</button>`
        : `<button class="accion" data-id="${habito.id}" aria-label="Iniciar sesión">▶</button>`;
    case 'contador':
    case 'limite':
      return `<button class="accion ${hechoHoy ? 'hecho' : ''}" data-id="${habito.id}" aria-label="Sumar uno">+1</button>`;
  }
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function avisar(mensaje) {
  const aviso = $('#aviso');
  aviso.textContent = mensaje;
  aviso.classList.add('visible');
  clearTimeout(avisar.timer);
  avisar.timer = setTimeout(() => aviso.classList.remove('visible'), 2000);
}


/* ---------------------------------------------------------
   9. DIBUJAR LA PANTALLA "HOY"
   --------------------------------------------------------- */

function mostrarFecha() {
  const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
  $('#fecha-hoy').textContent = new Date().toLocaleDateString('es-AR', opciones);
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

  filtros.innerHTML =
      chip('Todas', 'Todas')
    + conHabitos.map(c => chip(c, `${escapar(c)} <span class="chip__cantidad">${cantidadEn(c)}</span>`)).join('')
    + `<button class="chip chip--gestion" data-gestion aria-label="Gestionar categorías">⚙ Categorías</button>`;
}

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
  const peso = (h) => !tocaHoy(h) ? 2 : estaCumplido(h) ? 1 : 0;
  visibles.sort((a, b) => peso(a) - peso(b));

  if (visibles.length === 0) {
    lista.innerHTML = `<p class="vacio">No hay hábitos en esta categoría.</p>`;
  } else {
    lista.innerHTML = visibles.map(h => `
      <article class="habito ${estaCumplido(h) ? 'cumplido' : ''} ${tocaHoy(h) ? '' : 'no-toca'}"
               style="--color-habito:${h.color}">
        <div class="habito__info" data-menu="${h.id}">
          <p class="habito__nombre">${escapar(h.nombre)}</p>
          <p class="habito__detalle">${escapar(h.categoria)} · ${textoFrecuencia(h)}${tocaHoy(h) ? '' : ' · hoy no toca'}</p>
          ${htmlProgreso(h)}
          ${textoRacha(h)}
        </div>
        ${tocaHoy(h) ? htmlBoton(h) : ''}
      </article>`).join('');
  }

  const deHoy = datos.habitos.filter(h => tocaHoy(h) && h.tipo !== 'limite');
  const hechos = deHoy.filter(estaCumplido).length;
  $('#resumen-dia').textContent = deHoy.length ? `${hechos} de ${deHoy.length} cumplidos` : '';
}

function dibujarTodo() {
  mostrarFecha();
  dibujarFiltros();
  dibujarLista();
}


/* ---------------------------------------------------------
   10. ACCIONES EN LA LISTA
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
    abrirMenu(Number(info.dataset.menu));
    return;
  }

  // Botón de acción (✓, ▶, +1)
  const boton = evento.target.closest('.accion[data-id]');
  if (!boton) return;

  const habito = datos.habitos.find(h => h.id === Number(boton.dataset.id));
  const valor = valorDia(habito.id);

  if (habito.tipo === 'check') {
    ponerValor(habito.id, valor ? 0 : 1); // marcar / desmarcar
  } else if (habito.tipo === 'temporizador') {
    // El temporizador real llega más adelante. Por ahora suma una sesión.
    ponerValor(habito.id, valor + 1);
    avisar('Sesión sumada (el temporizador real viene más adelante)');
  } else {
    ponerValor(habito.id, valor + 1); // contador y límite
    if (habito.tipo === 'limite' && consumoLimite(habito) === habito.config.maximo + 1) {
      avisar(`Te pasaste del límite de ${habito.nombre}`);
    }
  }

  dibujarLista();
});

filtros.addEventListener('click', (evento) => {
  if (evento.target.closest('[data-gestion]')) {
    abrirCategorias();
    return;
  }
  const chip = evento.target.closest('.chip');
  if (!chip) return;
  filtroActual = chip.dataset.categoria;
  dibujarTodo();
});


/* ---------------------------------------------------------
   11. MENÚ DEL HÁBITO (restar / eliminar)
   --------------------------------------------------------- */

function abrirMenu(id) {
  habitoDelMenu = datos.habitos.find(h => h.id === id);
  $('#hoja-titulo').textContent = habitoDelMenu.nombre;

  // "Restar 1" solo tiene sentido si hoy hay algo registrado y no es un check
  // (el check se desmarca tocando el mismo botón)
  $('#hoja-restar').hidden = habitoDelMenu.tipo === 'check' || valorDia(id) === 0;

  hoja.hidden = false;
}

function cerrarMenu() {
  hoja.hidden = true;
  habitoDelMenu = null;
}

$('#hoja-restar').addEventListener('click', () => {
  ponerValor(habitoDelMenu.id, valorDia(habitoDelMenu.id) - 1);
  cerrarMenu();
  dibujarLista();
});

$('#hoja-eliminar').addEventListener('click', () => {
  const habito = habitoDelMenu;
  if (!confirm(`¿Eliminar "${habito.nombre}" y todo su historial?`)) return;

  datos.habitos = datos.habitos.filter(h => h.id !== habito.id);
  // Borramos también sus registros de todos los días
  for (const clave of Object.keys(datos.registros)) {
    delete datos.registros[clave][habito.id];
    if (Object.keys(datos.registros[clave]).length === 0) delete datos.registros[clave];
  }
  guardarDatos();
  cerrarMenu();
  dibujarTodo();
  avisar('Hábito eliminado');
});

$('#hoja-detalle').addEventListener('click', () => {
  const id = habitoDelMenu.id;
  cerrarMenu();
  abrirDetalle(id);
});

$('#hoja-cancelar').addEventListener('click', cerrarMenu);

// Tocar el fondo oscuro también cierra
hoja.addEventListener('click', (evento) => {
  if (evento.target === hoja) cerrarMenu();
});


/* ---------------------------------------------------------
   12. HÁBITOS DE EJEMPLO
   --------------------------------------------------------- */

function cargarEjemplos() {
  const base = Date.now();
  const ejemplos = [
    { nombre: 'Lavarme los dientes', categoria: 'Salud', color: '#0ea5e9',
      tipo: 'check', frecuencia: { modo: 'diario' }, config: {} },
    { nombre: 'Pomodoros de Gestión de Proyectos', categoria: 'Estudio', color: '#4f46e5',
      tipo: 'temporizador', frecuencia: { modo: 'dias', dias: [1, 2, 3, 4, 5] },
      config: { sesiones: 2, minutos: 25, descanso: 5, descansoAuto: true } },
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
  datos.habitos = ejemplos.map((h, i) => ({ id: base + i, creado, ...h }));

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
   13. NAVEGACIÓN ENTRE PANTALLAS
   --------------------------------------------------------- */

function irA(pantalla) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  pantalla.classList.add('activa');
  window.scrollTo(0, 0);
}

$('#btn-nuevo').addEventListener('click', () => {
  formulario.reset();
  // Si estás filtrando una categoría, el hábito nuevo arranca en esa
  dibujarSelectCategorias(filtroActual !== 'Todas' ? filtroActual : undefined);
  actualizarFormulario();
  irA(pantallaNuevo);
  formulario.nombre.focus();
});

// Todos los botones "←" vuelven a la pantalla principal, actualizada
document.querySelectorAll('[data-volver]').forEach(boton => {
  boton.addEventListener('click', () => {
    dibujarTodo();
    irA(pantallaHoy);
  });
});


/* ---------------------------------------------------------
   14. FORMULARIO DE NUEVO HÁBITO
   --------------------------------------------------------- */

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

function actualizarFormulario() {
  const tipo = formulario.tipo.value;
  const frecuencia = formulario.frecuencia.value;

  document.querySelectorAll('.config-tipo').forEach(div => {
    div.hidden = div.dataset.tipo !== tipo;
  });

  $('#bloque-frecuencia').hidden = (tipo === 'limite');

  document.querySelectorAll('.config-frecuencia').forEach(div => {
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

const numero = (nombre, porDefecto) => {
  const valor = parseInt(formulario[nombre].value, 10);
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
      sesiones: numero('sesiones', 1),
      minutos: numero('minutos', 25),
      descanso: numero('descanso', 0),
      descansoAuto: formulario.descansoAuto.checked
    };
  } else if (tipo === 'contador') {
    config = { meta: numero('meta', 1), unidad: formulario.unidadContador.value.trim() || 'veces' };
  } else if (tipo === 'limite') {
    config = {
      maximo: numero('maximo', 0),
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
      frecuencia = { modo, veces: numero('veces', 1) };
    }
  }

  datos.habitos.push({
    id: Date.now(),
    nombre,
    categoria: formulario.categoria.value,
    color: formulario.color.value,
    tipo,
    frecuencia,
    config,
    creado: hoy // lo vamos a usar para las rachas
  });
  guardarDatos();

  filtroActual = 'Todas';
  dibujarTodo();
  irA(pantallaHoy);
  avisar('Hábito creado');
});


/* ---------------------------------------------------------
   14 bis. CATEGORÍAS
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

function abrirCategorias() {
  dibujarCategorias();
  irA(pantallaCategorias);
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
  prepararFormulario();
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
    prepararFormulario();
  }
});


/* ---------------------------------------------------------
   14 ter. DETALLE DEL HÁBITO: estadísticas y calendario
   --------------------------------------------------------- */

const detalle = { habito: null, mes: null }; // mes = Date del día 1 del mes que se ve

function abrirDetalle(id) {
  detalle.habito = datos.habitos.find(h => h.id === id);
  const ahora = new Date();
  detalle.mes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  dibujarDetalle();
  irA(pantallaDetalle);
}

// Cómo quedó un día puntual, para pintarlo en el calendario
function estadoDelDia(habito, clave) {
  if (clave > hoy) return 'futuro';
  if (clave < habito.creado) return 'fuera';

  const fecha = fechaDesdeClave(clave);
  const valor = valorDia(habito.id, clave);

  if (habito.tipo === 'limite') {
    // En los límites semanales, un día queda "mal" si su semana se pasó
    const consumo = habito.config.periodo === 'semana'
      ? clavesDeLaSemana(fecha).reduce((suma, c) => suma + valorDia(habito.id, c), 0)
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
  $('#detalle-info').textContent = `${h.categoria} · ${textoFrecuencia(h)}`;

  // --- Estadísticas ---
  const { actual, mejor } = calcularRachas(h);
  const unidad = rachaEnSemanas(h) ? 'semanas' : 'días';
  let diasOk = 0;
  for (let f = fechaDesdeClave(h.creado); claveFecha(f) <= hoy; f = sumarDias(f, 1)) {
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

  // No se puede ir antes del mes de creación ni después del mes actual
  const claveMes = claveFecha(detalle.mes).slice(0, 7); // '2026-10'
  $('#mes-anterior').disabled = claveMes <= h.creado.slice(0, 7);
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
    const queSeCarga = h.tipo === 'temporizador' ? 'Sesiones completadas'
                     : `Cantidad de ${h.config.unidad}`;
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
   15. CAMBIO DE DÍA
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
   15 bis. PWA: instalación y funcionamiento sin internet
   --------------------------------------------------------- */

// El service worker solo funciona en https (o en localhost), no abriendo el archivo con doble clic
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(error => console.error('No se pudo registrar el service worker', error));
  });

  // Cuando se activa una versión nueva de la app, avisamos
  let habiaControlador = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (habiaControlador) avisar('App actualizada. Cerrala y abrila para ver los cambios.');
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
   16. ARRANQUE
   --------------------------------------------------------- */
prepararFormulario();
dibujarTodo();
