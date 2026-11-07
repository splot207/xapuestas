// ---------- Estado ----------
let datos = null;
const $ = id => document.getElementById(id);

// ---------- Utilidades ----------
function plata(v, conSigno = false) {
  const moneda = datos ? datos.ajustes.moneda : 'S/';
  const n = Math.abs(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signo = v < 0 ? '-' : conSigno && v > 0 ? '+' : '';
  return `${signo}${moneda} ${n}`;
}
const pct = (v, conSigno = true) => `${conSigno && v > 0 ? '+' : ''}${v.toFixed(2)}%`;
const clase = v => (v > 0 ? 'verde' : v < 0 ? 'rojo' : '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(texto, tipo = 'ok') {
  const t = $('toast');
  t.textContent = texto;
  t.className = `toast toast-${tipo}`;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3500);
}

async function api(url, opciones = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Sesión vencida');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Error');
  return json;
}

function avisoEnvio(r, textoOk) {
  if (r.aviso) toast(`${textoOk} · ${r.aviso}`, 'alerta');
  else if (r.encolados) toast(`${textoOk} · enviando al grupo 📤`);
  else toast(textoOk);
}

// ---------- Render ----------
function renderResumen() {
  const r = datos.resumen;
  const a = datos.ajustes;

  if (document.activeElement !== $('capital-inicial')) $('capital-inicial').value = a.capitalInicial;
  if (document.activeElement !== $('moneda')) $('moneda').value = a.moneda;

  $('stat-capital-actual').textContent = plata(r.capitalActual);
  $('stat-capital-actual').className = `stat-valor ${clase(r.ganancia)}`;
  $('stat-ganancia').textContent = plata(r.ganancia, true);
  $('stat-ganancia').className = `stat-valor ${clase(r.ganancia)}`;
  $('stat-porcentaje').textContent = pct(r.porcentaje);
  $('stat-porcentaje').className = `stat-extra ${clase(r.porcentaje)}`;
  $('stat-record').textContent = `${r.ganadas}✅ ${r.perdidas}❌ ${r.nulas}⚪`;
  $('stat-acierto').textContent = `Acierto ${r.acierto.toFixed(0)}% · ${r.pendientes} pendiente${r.pendientes === 1 ? '' : 's'}`;
  $('stat-yield').textContent = pct(r.yield);
  $('stat-yield').className = `stat-valor ${clase(r.yield)}`;
  $('stat-en-juego').textContent = `En juego: ${plata(r.enJuego)}`;
}

const ETIQUETAS = { pendiente: 'Pendiente', ganada: 'Ganada', perdida: 'Perdida', nula: 'Nula' };

function renderApuestas() {
  const tbody = $('lista-apuestas');
  $('vacio').hidden = datos.apuestas.length > 0;

  tbody.innerHTML = datos.apuestas.map(a => {
    const c = a.calc;
    const editable = a.estado === 'pendiente';
    return `
      <tr class="fila-${a.estado}">
        <td class="mono">${a.id}</td>
        <td>
          <div class="ap-pick">${esc(a.pick)}</div>
          ${a.mercado ? `<div class="ap-sub">${esc(a.mercado)}</div>` : ''}
          ${a.partido ? `<div class="ap-sub">${esc(a.partido)}</div>` : ''}
        </td>
        <td class="mono">${a.cuota.toFixed(2)}</td>
        <td>
          ${editable
            ? `<input type="number" class="input-stake" data-id="${a.id}" value="${a.stake}" step="0.5" min="0.5" max="100">`
            : `<span class="mono">${a.stake}%</span>`}
        </td>
        <td class="mono">${plata(c.monto)}</td>
        <td>
          <div class="estados">
            ${['ganada', 'perdida', 'nula', 'pendiente'].map(e => `
              <button class="estado-btn est-${e} ${a.estado === e ? 'activo' : ''}" data-id="${a.id}" data-estado="${e}" title="${ETIQUETAS[e]}">
                ${e === 'ganada' ? '✅' : e === 'perdida' ? '❌' : e === 'nula' ? '⚪' : '⏳'}
              </button>`).join('')}
          </div>
          <div class="estado-texto">${ETIQUETAS[a.estado]}</div>
        </td>
        <td class="mono ${clase(c.ganancia)}">${a.estado === 'pendiente' ? `<span class="tenue">${plata(c.potencial, true)}</span>` : plata(c.ganancia, true)}</td>
        <td class="mono ${clase(c.porcentaje)}">${a.estado === 'pendiente' ? `<span class="tenue">${pct(c.porcentajePotencial)}</span>` : pct(c.porcentaje)}</td>
        <td>
          <div class="acciones">
            <button class="icono-btn" data-accion="enviar" data-id="${a.id}" title="Reenviar al grupo">📤</button>
            <button class="icono-btn" data-accion="borrar" data-id="${a.id}" title="Borrar">🗑️</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function render() {
  renderResumen();
  renderApuestas();
  renderLote();
}

// ---------- Nuevas apuestas (lote desde tickets) ----------
let lote = [];
let uidSig = 1;

function siguienteNumero() {
  return datos && datos.apuestas.length ? Math.max(...datos.apuestas.map(a => a.id)) + 1 : 1;
}

function nuevaFila(extra = {}) {
  return {
    uid: uidSig++,
    pick: '',
    mercado: '',
    partido: '',
    cuota: '',
    stake: datos ? datos.ajustes.stakePorDefecto : 5,
    monto: null,
    imagen: null,
    estado: 'manual',
    ...extra
  };
}

function htmlTarjeta(f, i) {
  const n = siguienteNumero() + i;
  const estados = {
    leyendo: '<span class="ticket-estado leyendo">Leyendo ticket…</span>',
    listo: '<span class="ticket-estado listo">Leído ✓ revisa los datos</span>',
    error: '<span class="ticket-estado error">No se pudo leer, llénalo a mano</span>',
    manual: ''
  };
  return `
    <article class="ticket ${f.estado === 'leyendo' ? 'cargando' : ''}" data-uid="${f.uid}">
      <div class="ticket-cab">
        <span class="ticket-num">Apuesta ${n}</span>
        ${estados[f.estado]}
        <button type="button" class="icono-btn" data-quitar="${f.uid}" title="Quitar">✕</button>
      </div>
      <div class="ticket-cuerpo ${f.imagen ? '' : 'sin-imagen'}">
        ${f.imagen ? `<a href="${f.imagen}" target="_blank" class="ticket-img" title="Ver ticket"><img src="${f.imagen}" alt="Ticket"></a>` : ''}
        <div class="ticket-campos">
          <label>Apuesta<input type="text" data-campo="pick" value="${esc(f.pick)}" placeholder="ej: Más de 1.5"></label>
          <label>Mercado<input type="text" data-campo="mercado" value="${esc(f.mercado)}" placeholder="ej: Universitario de Deportes - Goles totales Más/Menos"></label>
          <label>Partido<input type="text" data-campo="partido" value="${esc(f.partido)}" placeholder="ej: Universitario vs Sport Boys"></label>
          <div class="fila-2">
            <label>Cuota<input type="number" data-campo="cuota" value="${esc(f.cuota)}" step="0.01" min="1.01" placeholder="ej: 2.40"></label>
            <label>Stake %<input type="number" data-campo="stake" value="${esc(f.stake)}" step="0.5" min="0.5" max="100"></label>
          </div>
          <div class="stake-rapido">
            ${[1, 2, 3, 5, 7, 10].map(s => `<button type="button" data-stake="${s}">${s}%</button>`).join('')}
          </div>
          <div class="ticket-calc" data-calc="${f.uid}"></div>
        </div>
      </div>
    </article>`;
}

function calcFila(f) {
  const capital = datos ? datos.ajustes.capitalInicial : 0;
  const stake = parseFloat(f.stake) || 0;
  const cuota = parseFloat(f.cuota) || 0;
  const monto = (capital * stake) / 100;
  const gan = cuota > 1 ? monto * (cuota - 1) : 0;
  return { monto, gan, pctGan: capital ? (gan / capital) * 100 : 0, cuota, stake };
}

function actualizarCalcFila(f) {
  const el = document.querySelector(`[data-calc="${f.uid}"]`);
  if (!el) return;
  const c = calcFila(f);
  let t = `Monto <b>${plata(c.monto)}</b> · Ganancia posible <b>${plata(c.gan, true)}</b> · <b>${pct(c.pctGan)}</b>`;
  if (f.monto) t += `<br><span class="tenue">En el ticket: ${plata(f.monto)}</span>`;
  el.innerHTML = t;
}

function mensajeFila(f, i) {
  const c = calcFila(f);
  let t = `*Apuesta ${siguienteNumero() + i}*\n\n`;
  t += `${f.pick || '…'}\n`;
  if (f.mercado) t += `${f.mercado}\n`;
  if (f.partido) t += `${f.partido}\n`;
  t += `\nPendiente ⏳\n\n`;
  t += `Cuota ${c.cuota > 1 ? c.cuota.toFixed(2) : '—'}\n\n`;
  t += `Stake: ${c.stake}% (${plata(c.monto)})\n`;
  t += `Ganancia posible: ${plata(c.gan, true)}\n`;
  t += `Porcentaje posible: ${pct(c.pctGan)}`;
  return t;
}

function renderPrevias() {
  const cont = $('vista-previa');
  if (!lote.length) {
    cont.innerHTML = '<p class="tenue">Aquí vas a ver cómo llegan los mensajes al grupo.</p>';
    return;
  }
  cont.innerHTML = lote.map((f, i) => `<pre class="vista-previa">${esc(mensajeFila(f, i))}</pre>`).join('');
}

function renderLote() {
  $('lote').innerHTML = lote.map(htmlTarjeta).join('');
  lote.forEach(actualizarCalcFila);
  renderPrevias();
  $('lote-contador').textContent = `${lote.length} apuesta${lote.length === 1 ? '' : 's'}`;
  const leyendo = lote.some(f => f.estado === 'leyendo');
  const btn = $('btn-guardar-lote');
  btn.disabled = !lote.length || leyendo;
  btn.textContent = leyendo
    ? 'Leyendo tickets…'
    : lote.length
      ? `Guardar ${lote.length} apuesta${lote.length === 1 ? '' : 's'}`
      : 'Guardar apuestas';
}

// Editar campos sin volver a dibujar (para no perder el cursor)
$('lote').addEventListener('input', e => {
  const inp = e.target.closest('[data-campo]');
  if (!inp) return;
  const uid = Number(inp.closest('.ticket').dataset.uid);
  const f = lote.find(x => x.uid === uid);
  f[inp.dataset.campo] = inp.value;
  actualizarCalcFila(f);
  renderPrevias();
});

$('lote').addEventListener('click', e => {
  const quitar = e.target.closest('[data-quitar]');
  if (quitar) {
    lote = lote.filter(x => x.uid !== Number(quitar.dataset.quitar));
    renderLote();
    return;
  }
  const sb = e.target.closest('button[data-stake]');
  if (sb) {
    const tarjeta = sb.closest('.ticket');
    const f = lote.find(x => x.uid === Number(tarjeta.dataset.uid));
    f.stake = sb.dataset.stake;
    tarjeta.querySelector('[data-campo="stake"]').value = f.stake;
    actualizarCalcFila(f);
    renderPrevias();
  }
});

$('btn-agregar').addEventListener('click', () => {
  lote.push(nuevaFila());
  renderLote();
  const ult = $('lote').lastElementChild;
  if (ult) ult.querySelector('[data-campo="pick"]').focus();
});

// ---------- Lectura de tickets (OCR) ----------
let workerPromesa = null;
function obtenerWorker() {
  if (!workerPromesa) {
    // El lector de tickets viene incluido en /vendor (no depende de otros sitios)
    workerPromesa = Tesseract.createWorker('spa', 1, {
      workerPath: '/vendor/tesseract/worker.min.js',
      corePath: '/vendor/tesseract-core',
      langPath: '/vendor/lang',
      gzip: true
    });
  }
  return workerPromesa;
}

let colaOCR = Promise.resolve();

function agregarImagenes(archivos) {
  const imagenes = [...archivos].filter(a => a.type.startsWith('image/'));
  if (!imagenes.length) return;

  // Si hay una tarjeta manual vacía, reemplazarla
  lote = lote.filter(f => f.estado !== 'manual' || f.pick || f.cuota || f.mercado || f.partido);

  for (const archivo of imagenes) {
    const f = nuevaFila({ imagen: URL.createObjectURL(archivo), estado: 'leyendo' });
    lote.push(f);
    colaOCR = colaOCR.then(() => leerImagen(f, archivo));
  }
  renderLote();
}

async function leerImagen(f, archivo) {
  try {
    const worker = await obtenerWorker();
    const { data } = await worker.recognize(archivo);
    const r = leerTicket(data.text);
    if (!lote.includes(f)) return; // la quitaron mientras se leía
    f.pick = f.pick || r.pick;
    f.mercado = f.mercado || r.mercado;
    f.partido = f.partido || r.partido;
    f.cuota = f.cuota || (r.cuota ? r.cuota.toFixed(2) : '');
    f.monto = r.monto;
    f.estado = r.pick || r.cuota ? 'listo' : 'error';
  } catch (err) {
    console.error(err);
    f.estado = 'error';
  }
  renderLote();
}

$('input-tickets').addEventListener('change', e => {
  agregarImagenes(e.target.files);
  e.target.value = '';
});

const zona = $('zona-tickets');
['dragenter', 'dragover'].forEach(ev =>
  zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add('activa'); })
);
['dragleave', 'drop'].forEach(ev =>
  zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove('activa'); })
);
zona.addEventListener('drop', e => agregarImagenes(e.dataTransfer.files));

document.addEventListener('paste', e => {
  const archivos = [...(e.clipboardData?.items || [])]
    .filter(it => it.kind === 'file')
    .map(it => it.getAsFile())
    .filter(Boolean);
  if (archivos.length) {
    e.preventDefault();
    agregarImagenes(archivos);
  }
});

// ---------- Guardar lote ----------
$('btn-guardar-lote').addEventListener('click', async () => {
  const btn = $('btn-guardar-lote');
  for (const [i, f] of lote.entries()) {
    if (!String(f.pick).trim()) return toast(`Apuesta ${siguienteNumero() + i}: falta el pick`, 'error');
    if (!(parseFloat(f.cuota) > 1)) return toast(`Apuesta ${siguienteNumero() + i}: falta la cuota`, 'error');
  }
  btn.disabled = true;
  btn.textContent = $('f-enviar').checked ? 'Guardando y enviando…' : 'Guardando…';
  try {
    const r = await api('/api/apuestas/lote', {
      method: 'POST',
      body: {
        enviar: $('f-enviar').checked,
        apuestas: lote.map(f => ({ pick: f.pick, mercado: f.mercado, partido: f.partido, cuota: f.cuota, stake: f.stake }))
      }
    });
    datos = r;
    lote.forEach(f => f.imagen && URL.revokeObjectURL(f.imagen));
    lote = [];
    render();
    avisoEnvio(r, `${r.guardadas} apuesta${r.guardadas === 1 ? '' : 's'} guardada${r.guardadas === 1 ? '' : 's'}`);
  } catch (err) {
    toast(err.message, 'error');
    renderLote();
  }
});

// ---------- Acciones en la lista ----------
$('lista-apuestas').addEventListener('click', async e => {
  const est = e.target.closest('.estado-btn');
  const acc = e.target.closest('[data-accion]');

  try {
    if (est) {
      const id = est.dataset.id;
      const estado = est.dataset.estado;
      const actual = datos.apuestas.find(a => a.id === Number(id));
      if (actual && actual.estado === estado) return;
      const r = await api(`/api/apuestas/${id}`, { method: 'PATCH', body: { estado, enviar: $('notificar').checked } });
      datos = r;
      render();
      avisoEnvio(r, `Apuesta ${id}: ${ETIQUETAS[estado]}`);
    }

    if (acc && acc.dataset.accion === 'enviar') {
      const r = await api(`/api/apuestas/${acc.dataset.id}/enviar`, { method: 'POST' });
      avisoEnvio(r, `Apuesta ${acc.dataset.id}`);
    }

    if (acc && acc.dataset.accion === 'borrar') {
      if (!confirm(`¿Borrar la apuesta ${acc.dataset.id}?`)) return;
      datos = await api(`/api/apuestas/${acc.dataset.id}`, { method: 'DELETE' });
      render();
      toast('Apuesta borrada');
    }
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('lista-apuestas').addEventListener('change', async e => {
  const inp = e.target.closest('.input-stake');
  if (!inp) return;
  try {
    datos = await api(`/api/apuestas/${inp.dataset.id}`, { method: 'PATCH', body: { stake: inp.value } });
    render();
    toast(`Stake de la apuesta ${inp.dataset.id} actualizado`);
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ---------- Capital ----------
$('btn-guardar-capital').addEventListener('click', async () => {
  try {
    datos = await api('/api/ajustes', {
      method: 'PUT',
      body: { capitalInicial: $('capital-inicial').value, moneda: $('moneda').value }
    });
    render();
    toast('Capital actualizado');
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ---------- WhatsApp (estado que reporta el bot de tu PC) ----------
let gruposFirma = '';

async function revisarWhatsapp() {
  if (document.hidden) return;
  try {
    const w = await api('/api/whatsapp');
    const textos = {
      conectado: `Conectado${w.numero ? ' · +' + w.numero : ''}`,
      qr: 'Esperando que escanees el QR',
      iniciando: 'El bot está iniciando…',
      desconectado: 'WhatsApp desconectado',
      apagado: 'Bot apagado: abre tu PC y corre "npm run bot"'
    };
    const chip = $('wsp-chip');
    chip.textContent = `WhatsApp: ${w.estado === 'conectado' ? 'conectado' : w.estado === 'apagado' ? 'bot apagado' : textos[w.estado]}`;
    chip.className = `chip chip-${w.estado === 'apagado' ? 'desconectado' : w.estado}`;

    let info = textos[w.estado] || w.estado;
    if (w.grupoNombre) info += ` · Grupo: ${w.grupoNombre}`;
    if (w.enCola) info += ` · ${w.enCola} mensaje${w.enCola === 1 ? '' : 's'} en espera`;
    $('wsp-estado').textContent = info;

    $('wsp-qr').hidden = !(w.estado === 'qr' && w.qr);
    if (w.qr) $('wsp-qr-img').src = w.qr;

    $('wsp-grupo').hidden = !(w.grupos.length || w.grupoId);
    const firma = JSON.stringify([w.grupos, w.grupoId]);
    if (firma !== gruposFirma && document.activeElement !== $('sel-grupo')) {
      gruposFirma = firma;
      const lista = w.grupos.slice();
      if (w.grupoId && !lista.some(g => g.id === w.grupoId)) lista.unshift({ id: w.grupoId, nombre: w.grupoNombre || 'Grupo guardado' });
      $('sel-grupo').innerHTML =
        '<option value="">— Elige un grupo —</option>' +
        lista.map(g => `<option value="${esc(g.id)}" ${g.id === w.grupoId ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('');
    }
  } catch {
    /* silencioso */
  }
}

$('btn-guardar-grupo').addEventListener('click', async () => {
  const sel = $('sel-grupo');
  const nombre = sel.options[sel.selectedIndex]?.text || '';
  try {
    await api('/api/whatsapp/grupo', { method: 'PUT', body: { id: sel.value, nombre: sel.value ? nombre : '' } });
    toast(sel.value ? `Grupo guardado: ${nombre}` : 'Grupo quitado');
    revisarWhatsapp();
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('btn-resumen').addEventListener('click', async () => {
  try {
    const r = await api('/api/whatsapp/resumen', { method: 'POST' });
    avisoEnvio(r, 'Resumen del día');
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ---------- Salir ----------
$('btn-salir').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
});

// ---------- Inicio ----------
(async function iniciar() {
  try {
    datos = await api('/api/datos');
    render();
  } catch (err) {
    toast(err.message, 'error');
  }
  revisarWhatsapp();
  setInterval(revisarWhatsapp, 10000);
  document.addEventListener('visibilitychange', revisarWhatsapp);
})();
