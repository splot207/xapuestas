// Página pública de resumen: /diario
const $ = id => document.getElementById(id);
let vista = 'hoy';
let datos = null;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pct = v => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
const clase = v => (v > 0 ? 'verde' : v < 0 ? 'rojo' : '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function nombreMes(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}
function fechaBonita(f) {
  const [y, m, d] = f.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

function frase(p, total) {
  if (!total) return 'Hoy todavía no hay picks. ¡Atentos! 👀';
  if (p.pendientes && !(p.ganadas + p.perdidas)) return 'Picks en juego… ⏳';
  if (p.porcentaje > 5) return '¡Día de cobrar, familia! 🔥💸';
  if (p.porcentaje > 0) return 'En verde, así se hace ✅';
  if (p.porcentaje < 0) return 'Disciplina y seguimos 💪';
  return 'Parejos, vamos por más 🤝';
}

async function cargar() {
  const mes = $('sel-mes').value;
  const url = '/api/publico/resumen' + (mes ? `?mes=${encodeURIComponent(mes)}` : '');
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo cargar');
    datos = await res.json();
    llenarMeses();
    pintar();
  } catch {
    $('frase').textContent = 'No se pudo cargar el resumen. Reintentando…';
  }
}

function llenarMeses() {
  const sel = $('sel-mes');
  const actual = sel.value || datos.mes.mes;
  sel.innerHTML = datos.meses.map(m => `<option value="${m}">${nombreMes(m)}</option>`).join('');
  sel.value = datos.meses.includes(actual) ? actual : datos.mes.mes;
}

function pintar() {
  const p = vista === 'hoy' ? datos.hoy : datos.mes;
  const decididas = p.ganadas + p.perdidas;

  $('titulo-periodo').textContent = vista === 'hoy' ? `Hoy · ${fechaBonita(datos.hoy.fecha)}` : nombreMes(datos.mes.mes);
  $('pct-grande').textContent = pct(p.porcentaje);
  $('pct-grande').className = `pct-grande ${clase(p.porcentaje)}`;
  $('frase').textContent = vista === 'hoy' ? frase(p, p.total) : `${p.total} picks en el mes`;

  $('t-record').innerHTML = `${p.ganadas}✅ ${p.perdidas}❌`;
  $('t-acierto').textContent = decididas ? `${p.acierto.toFixed(0)}%` : '—';
  $('t-yield').textContent = decididas ? pct(p.yield) : '—';
  $('t-yield').className = `t-valor ${clase(p.yield)}`;
  $('t-pendientes').textContent = p.pendientes;

  $('bloque-grafico').hidden = vista !== 'mes' || !datos.mes.dias.length;
  if (vista === 'mes') pintarGrafico(datos.mes.dias);

  $('titulo-lista').textContent = vista === 'hoy' ? 'Apuestas de hoy' : 'Apuestas del mes';
  const lista = vista === 'hoy' ? datos.hoy.apuestas : datos.mes.apuestas.slice().reverse();
  $('vacio').hidden = lista.length > 0;
  $('lista').innerHTML = lista.map(a => {
    const icono = { ganada: '✅', perdida: '❌', nula: '⚪', pendiente: '⏳' }[a.estado];
    const sub = [a.mercado, a.partido].filter(Boolean).map(esc).join(' · ');
    return `
      <li class="item ${a.estado}">
        <span class="item-icono">${icono}</span>
        <div>
          <div class="item-pick">Apuesta ${a.id} · ${esc(a.pick)}</div>
          ${sub ? `<div class="item-sub">${sub}</div>` : ''}
        </div>
        <div class="item-der">
          <div class="item-pct ${a.estado === 'pendiente' ? '' : clase(a.porcentaje)}">${a.estado === 'pendiente' ? 'en juego' : pct(a.porcentaje)}</div>
          <div class="item-cuota">@${a.cuota.toFixed(2)} · ${a.stake}%</div>
        </div>
      </li>`;
  }).join('');

  $('pie-total').textContent = pct(datos.total.porcentaje);
  $('pie-total').className = clase(datos.total.porcentaje);
  $('pie-hora').textContent = `Actualizado ${new Date(datos.actualizado).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
}

// Barras por día (verde/rojo) en SVG
function pintarGrafico(dias) {
  const W = 680, H = 200, M = { t: 20, r: 10, b: 28, l: 10 };
  const max = Math.max(1, ...dias.map(d => Math.abs(d.porcentaje)));
  const ancho = (W - M.l - M.r) / dias.length;
  const medio = M.t + (H - M.t - M.b) / 2;
  const escala = (H - M.t - M.b) / 2 / max;

  const barras = dias.map((d, i) => {
    const h = Math.max(2, Math.abs(d.porcentaje) * escala);
    const x = M.l + i * ancho + ancho * 0.2;
    const w = ancho * 0.6;
    const y = d.porcentaje >= 0 ? medio - h : medio;
    const color = d.porcentaje > 0 ? 'var(--verde)' : d.porcentaje < 0 ? 'var(--rojo)' : 'var(--tenue)';
    const ty = d.porcentaje >= 0 ? y - 4 : y + h + 11;
    return `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${color}"></rect>
      <text class="val" x="${x + w / 2}" y="${ty}" text-anchor="middle" fill="${color}">${d.porcentaje > 0 ? '+' : ''}${d.porcentaje.toFixed(1)}</text>
      <text class="lbl" x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${Number(d.fecha.slice(8))}</text>`;
  }).join('');

  $('grafico').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Porcentaje por día">
      <line class="eje" x1="${M.l}" x2="${W - M.r}" y1="${medio}" y2="${medio}"></line>
      ${barras}
    </svg>`;
}

// ---------- Eventos ----------
document.querySelectorAll('.pestana').forEach(b =>
  b.addEventListener('click', () => {
    vista = b.dataset.vista;
    document.querySelectorAll('.pestana').forEach(x => x.classList.toggle('activa', x === b));
    $('sel-mes').hidden = vista !== 'mes';
    if (datos) pintar();
  })
);
$('sel-mes').addEventListener('change', cargar);

cargar();
setInterval(() => !document.hidden && cargar(), 60000);
document.addEventListener('visibilitychange', () => !document.hidden && cargar());
