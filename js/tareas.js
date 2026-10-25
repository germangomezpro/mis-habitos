/* =========================================================
   MIS HÁBITOS — tareas.js
   Pestaña de TAREAS ÚNICAS: cosas que se hacen una sola vez.
   Usa funciones de app.js: $, datos, guardarDatos, hoy, claveFecha,
   fechaDesdeClave, sumarDias, metaDiaria, escapar, avisar, barra,
   abrirMenu, irA.
   ---------------------------------------------------------
   Cada tarea se guarda en datos.tareas así:

   {
     id: 1730000000000,
     nombre: 'Pagar el monotributo',
     fecha: '2026-10-28',      // día en que la tenés que hacer
     hora: '18:00',            // '' si no tiene hora
     tipo: 'check' | 'temporizador' | 'contador',   (mismos tipos que los hábitos, sin límite)
     config: { sesiones, minutos } o { meta, unidad } o {},
     progreso: 0,              // sesiones o cantidad hechas (en check: 0 o 1)
     hecha: null,              // fecha en que la terminaste, o null si está pendiente
     creada: '2026-10-25'
   }

   A diferencia de los hábitos, acá no hay historial por día: una tarea
   tiene un solo progreso, que va subiendo hasta completarse.
   ========================================================= */

const pantallaTareas    = $('#pantalla-tareas');
const pantallaFormTarea = $('#pantalla-form-tarea');
const listaTareas       = $('#lista-tareas');
const formTarea         = $('#form-tarea');

let editandoTareaId = null;
let hechasAbiertas = false; // recuerda si la sección "Hechas" estaba desplegada


/* ---------------------------------------------------------
   1. PROGRESO Y ESTADO
   --------------------------------------------------------- */

const buscarTarea = (id) => datos.tareas.find(t => t.id === id);

// Cambia el progreso y, según cuánto lleva, la marca como hecha o pendiente
function ponerProgreso(tarea, valor) {
  tarea.progreso = Math.max(0, valor);
  if (tarea.progreso >= metaDiaria(tarea)) {
    if (!tarea.hecha) tarea.hecha = hoy; // recién completada: guardamos cuándo
  } else {
    tarea.hecha = null;
  }
  guardarDatos();
}

// 'vencidas' | 'hoy' | 'proximas' (solo para pendientes)
function grupoDe(tarea) {
  if (tarea.fecha < hoy) return 'vencidas';
  if (tarea.fecha === hoy) return 'hoy';
  return 'proximas';
}

// Hora actual como 'HH:MM', para comparar con la hora de la tarea
function horaActual() {
  const ahora = new Date();
  return `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
}

// Diferencia en días entre dos claves de fecha
function diasEntre(desde, hasta) {
  return Math.round((fechaDesdeClave(hasta) - fechaDesdeClave(desde)) / 86400000);
}

// "Hoy 18:00", "Mañana", "mar 28/10", "Venció ayer", "Venció hace 5 días"
function textoFecha(tarea) {
  const hora = tarea.hora ? ` ${tarea.hora}` : '';
  const dif = diasEntre(hoy, tarea.fecha);

  if (dif === 0) return `Hoy${hora}`;
  if (dif === 1) return `Mañana${hora}`;
  if (dif === -1) return `Venció ayer${hora}`;
  if (dif < 0) return `Venció hace ${-dif} días`;

  const fecha = fechaDesdeClave(tarea.fecha);
  const diaSemana = fecha.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '');
  return `${diaSemana} ${fecha.getDate()}/${fecha.getMonth() + 1}${hora}`;
}

// ¿Está atrasada? (venció otro día, o es de hoy y ya pasó su hora)
function estaAtrasada(tarea) {
  if (tarea.hecha) return false;
  if (tarea.fecha < hoy) return true;
  return tarea.fecha === hoy && tarea.hora !== '' && tarea.hora < horaActual();
}


/* ---------------------------------------------------------
   2. DIBUJAR LA PESTAÑA
   --------------------------------------------------------- */

function htmlProgresoTarea(t) {
  if (t.tipo === 'temporizador') {
    return `<p class="habito__progreso-texto">${t.progreso} de ${t.config.sesiones} sesiones de ${t.config.minutos} min</p>`
         + barra(Math.min(100, t.progreso / t.config.sesiones * 100));
  }
  if (t.tipo === 'contador') {
    return `<p class="habito__progreso-texto">${t.progreso} de ${t.config.meta} ${escapar(t.config.unidad)}</p>`
         + barra(Math.min(100, t.progreso / t.config.meta * 100));
  }
  return '';
}

function htmlTarea(t) {
  const boton = t.hecha
    ? `<button class="accion hecho" data-tarea-accion="${t.id}" aria-label="Marcar como pendiente">✓</button>`
    : t.tipo === 'check'
      ? `<button class="accion" data-tarea-accion="${t.id}" aria-label="Marcar como hecha">✓</button>`
      : `<button class="accion" data-tarea-accion="${t.id}" aria-label="Sumar uno">+1</button>`;

  const subtitulo = t.hecha
    ? `Hecha el ${fechaDesdeClave(t.hecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' })}`
    : `<span class="${estaAtrasada(t) ? 'texto-peligro' : ''}">${textoFecha(t)}</span>`;

  return `
    <article class="habito tarea ${t.hecha ? 'cumplido tarea--hecha' : ''}" style="--color-habito:var(--primario)">
      <div class="habito__info" data-tarea-menu="${t.id}">
        <p class="habito__nombre">${escapar(t.nombre)}</p>
        <p class="habito__detalle">${subtitulo}</p>
        ${t.hecha ? '' : htmlProgresoTarea(t)}
      </div>
      ${boton}
    </article>`;
}

function dibujarTareas() {
  const pendientes = datos.tareas.filter(t => !t.hecha);
  const hechas = datos.tareas.filter(t => t.hecha);

  // Orden: por fecha, y dentro del mismo día, primero las que tienen hora (por hora)
  const ordenar = (a, b) =>
    a.fecha.localeCompare(b.fecha) || (a.hora || '99:99').localeCompare(b.hora || '99:99');
  pendientes.sort(ordenar);
  hechas.sort((a, b) => b.hecha.localeCompare(a.hecha)); // las más recientes primero

  const grupos = [
    { clave: 'vencidas', titulo: 'Vencidas', clase: 'subtitulo--peligro' },
    { clave: 'hoy',      titulo: 'Hoy' },
    { clave: 'proximas', titulo: 'Próximas' }
  ];

  let html = '';
  for (const grupo of grupos) {
    const delGrupo = pendientes.filter(t => grupoDe(t) === grupo.clave);
    if (delGrupo.length === 0) continue;
    html += `<h3 class="subtitulo ${grupo.clase || ''}">${grupo.titulo}</h3>
             <div class="lista-habitos">${delGrupo.map(htmlTarea).join('')}</div>`;
  }

  if (pendientes.length === 0) {
    html += `<p class="vacio">${datos.tareas.length ? '¡No tenés nada pendiente! 🎉' : 'Todavía no tenés tareas.'}<br>Tocá + para agregar una.</p>`;
  }

  // Sección "Hechas": <details> se pliega y despliega solo, sin JavaScript
  if (hechas.length) {
    html += `
      <details class="hechas" id="seccion-hechas" ${hechasAbiertas ? 'open' : ''}>
        <summary>Hechas (${hechas.length})</summary>
        <div class="lista-habitos">${hechas.map(htmlTarea).join('')}</div>
        <button class="boton-secundario" id="btn-borrar-hechas">Borrar todas las hechas</button>
      </details>`;
  }

  listaTareas.innerHTML = html;

  // Resumen del encabezado
  const vencidas = pendientes.filter(t => grupoDe(t) === 'vencidas').length;
  const deHoy = pendientes.filter(t => grupoDe(t) === 'hoy').length;
  const partes = [];
  if (deHoy) partes.push(`${deHoy} para hoy`);
  if (vencidas) partes.push(`${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'}`);
  $('#resumen-tareas').textContent = partes.join(' · ');
}


/* ---------------------------------------------------------
   3. ACCIONES EN LA LISTA
   --------------------------------------------------------- */

listaTareas.addEventListener('click', (evento) => {
  // Botón de la derecha (✓ o +1)
  const boton = evento.target.closest('[data-tarea-accion]');
  if (boton) {
    const tarea = buscarTarea(Number(boton.dataset.tareaAccion));

    if (tarea.hecha) {
      marcarPendiente(tarea);
    } else if (tarea.tipo === 'check') {
      ponerProgreso(tarea, 1);
      avisar('¡Tarea hecha!');
    } else {
      ponerProgreso(tarea, tarea.progreso + 1);
      if (tarea.hecha) {
        avisar('¡Tarea completada!');
      } else if (tarea.tipo === 'temporizador') {
        avisar(`Sesión ${tarea.progreso} de ${tarea.config.sesiones} registrada`);
      }
    }
    dibujarTareas();
    return;
  }

  // Tocar el nombre abre el menú
  const info = evento.target.closest('[data-tarea-menu]');
  if (info) {
    abrirMenuTarea(buscarTarea(Number(info.dataset.tareaMenu)));
    return;
  }

  if (evento.target.closest('#btn-borrar-hechas')) {
    const n = datos.tareas.filter(t => t.hecha).length;
    if (!confirm(`¿Borrar las ${n} tareas hechas? No se puede deshacer.`)) return;
    datos.tareas = datos.tareas.filter(t => !t.hecha);
    guardarDatos();
    dibujarTareas();
    avisar('Tareas hechas borradas');
  }
});

// Recordamos si "Hechas" quedó abierta o cerrada
// (el evento "toggle" no burbujea, por eso lo escuchamos en la fase de captura con true)
listaTareas.addEventListener('toggle', (evento) => {
  if (evento.target.id === 'seccion-hechas') hechasAbiertas = evento.target.open;
}, true);

// Destildar: vuelve a pendiente con una unidad menos que la meta
function marcarPendiente(tarea) {
  ponerProgreso(tarea, tarea.tipo === 'check' ? 0 : metaDiaria(tarea) - 1);
  avisar('Tarea marcada como pendiente');
}

function abrirMenuTarea(tarea) {
  const opciones = [
    { texto: 'Agregar a Google Calendar', accion: () => abrirEnCalendar(tarea) },
    { texto: 'Editar tarea', accion: () => abrirFormularioTarea(tarea) }
  ];

  if (!tarea.hecha && tarea.fecha < hoy) {
    opciones.push({
      texto: 'Pasarla para hoy',
      accion: () => { tarea.fecha = hoy; guardarDatos(); dibujarTareas(); }
    });
  }
  if (!tarea.hecha && tarea.tipo !== 'check' && tarea.progreso > 0) {
    opciones.push({
      texto: 'Restar 1',
      accion: () => { ponerProgreso(tarea, tarea.progreso - 1); dibujarTareas(); }
    });
  }
  opciones.push({ texto: 'Eliminar tarea', peligro: true, accion: () => eliminarTarea(tarea) });

  abrirMenu(tarea.nombre, opciones);
}

function eliminarTarea(tarea) {
  if (!confirm(`¿Eliminar "${tarea.nombre}"?`)) return;
  datos.tareas = datos.tareas.filter(t => t.id !== tarea.id);
  guardarDatos();
  dibujarTareas();
  avisar('Tarea eliminada');
}


/* ---------------------------------------------------------
   4. GOOGLE CALENDAR
   ---------------------------------------------------------
   Google Calendar acepta un link con los datos del evento ya cargados.
   Lo abrimos y vos solo tocás "Guardar". Así Calendar te manda
   la notificación, que es confiable aunque el celu esté bloqueado.
   --------------------------------------------------------- */

function linkCalendar(tarea) {
  const sinGuiones = (clave) => clave.replaceAll('-', '');
  let fechas;

  if (tarea.hora) {
    // Evento con hora: dura lo que suman las sesiones, o media hora
    const [hh, mm] = tarea.hora.split(':').map(Number);
    const inicio = fechaDesdeClave(tarea.fecha);
    inicio.setHours(hh, mm);
    const minutos = tarea.tipo === 'temporizador' ? tarea.config.sesiones * tarea.config.minutos : 30;
    const fin = new Date(inicio.getTime() + minutos * 60000);

    // Formato que pide Google: 20261028T180000
    const formato = (d) => sinGuiones(claveFecha(d))
      + 'T' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + '00';
    fechas = `${formato(inicio)}/${formato(fin)}`;
  } else {
    // Sin hora: evento de todo el día (termina el día siguiente)
    fechas = `${sinGuiones(tarea.fecha)}/${sinGuiones(claveFecha(sumarDias(fechaDesdeClave(tarea.fecha), 1)))}`;
  }

  // URLSearchParams arma la parte "?a=1&b=2" y se encarga de los acentos y espacios
  const parametros = new URLSearchParams({
    action: 'TEMPLATE',
    text: tarea.nombre,
    dates: fechas,
    details: 'Tarea cargada desde Mis Hábitos',
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone // tu zona horaria
  });
  return `https://calendar.google.com/calendar/render?${parametros}`;
}

function abrirEnCalendar(tarea) {
  window.open(linkCalendar(tarea), '_blank', 'noopener');
}


/* ---------------------------------------------------------
   5. FORMULARIO DE TAREA (nueva y editar)
   --------------------------------------------------------- */

function actualizarFormularioTarea() {
  const tipo = formTarea.tipoTarea.value;
  document.querySelectorAll('[data-tipo-tarea]').forEach(div => {
    div.hidden = div.dataset.tipoTarea !== tipo;
  });
}
formTarea.addEventListener('change', actualizarFormularioTarea);

function abrirFormularioTarea(tarea) {
  formTarea.reset();
  editandoTareaId = tarea ? tarea.id : null;

  $('#titulo-form-tarea').textContent = tarea ? 'Editar tarea' : 'Nueva tarea';
  $('#btn-guardar-tarea').textContent = tarea ? 'Guardar cambios' : 'Guardar tarea';

  formTarea.fecha.value = tarea ? tarea.fecha : hoy;

  if (tarea) {
    formTarea.nombre.value = tarea.nombre;
    formTarea.hora.value = tarea.hora;
    formTarea.tipoTarea.value = tarea.tipo;
    if (tarea.tipo === 'temporizador') {
      formTarea.sesiones.value = tarea.config.sesiones;
      formTarea.minutos.value = tarea.config.minutos;
    }
    if (tarea.tipo === 'contador') {
      formTarea.meta.value = tarea.config.meta;
      formTarea.unidad.value = tarea.config.unidad;
    }
  }

  actualizarFormularioTarea();
  irA(pantallaFormTarea);
  if (!tarea) formTarea.nombre.focus();
}

$('#btn-nueva-tarea').addEventListener('click', () => abrirFormularioTarea());

formTarea.addEventListener('submit', (evento) => {
  evento.preventDefault();

  const nombre = formTarea.nombre.value.trim();
  if (!nombre) {
    avisar('Poné un nombre para la tarea');
    formTarea.nombre.focus();
    return;
  }
  if (!formTarea.fecha.value) {
    avisar('Elegí el día');
    return;
  }

  const tipo = formTarea.tipoTarea.value;
  let config = {};
  if (tipo === 'temporizador') {
    config = { sesiones: numero(formTarea, 'sesiones', 1), minutos: numero(formTarea, 'minutos', 25) };
  } else if (tipo === 'contador') {
    config = { meta: numero(formTarea, 'meta', 1), unidad: formTarea.unidad.value.trim() || 'veces' };
  }

  const campos = { nombre, fecha: formTarea.fecha.value, hora: formTarea.hora.value, tipo, config };

  if (editandoTareaId) {
    const tarea = buscarTarea(editandoTareaId);
    const cambioElTipo = tarea.tipo !== tipo;
    Object.assign(tarea, campos);
    // Si cambió el tipo, el progreso anterior no tiene sentido: empieza de cero.
    // Si no, lo revisamos por si cambió la meta.
    ponerProgreso(tarea, cambioElTipo ? 0 : tarea.progreso);
    avisar('Cambios guardados');
  } else {
    datos.tareas.push({ id: Date.now(), ...campos, progreso: 0, hecha: null, creada: hoy });
    guardarDatos();
    avisar('Tarea creada');
  }

  dibujarTareas();
  irA(pantallaTareas);
});
