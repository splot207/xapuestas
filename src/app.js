// API del dashboard. Corre como función en Vercel (api/index.js) o en tu PC (local.js).
const express = require('express');
const cookieSession = require('cookie-session');

const config = require('../config.json');
const store = require('./store');
const { calcular, resumen, fechaLocal } = require('./calculos');
const msj = require('./mensajes');

const USUARIO = process.env.ADMIN_USER || config.usuario;
const CONTRASENA = process.env.ADMIN_PASS || config.contrasena;
const SECRETO = process.env.SESSION_SECRET || config.sessionSecret;
const BOT_VIVO_MS = 150 * 1000; // si el bot no reporta en 150 s, se considera apagado

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieSession({
  name: 'xap_sesion',
  keys: [SECRETO],
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
  httpOnly: true,
  sameSite: 'lax'
}));

const api = express.Router();
const num = v => parseFloat(String(v).replace(',', '.'));
// Envuelve rutas async para que los errores lleguen como JSON
const r = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Login ----------
api.post('/login', (req, res) => {
  const { usuario, contrasena } = req.body || {};
  if (usuario === USUARIO && contrasena === CONTRASENA) {
    req.session.usuario = usuario;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
});

api.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

api.get('/sesion', (req, res) => res.json({ activa: Boolean(req.session && req.session.usuario) }));

// ---------- Resumen público para la página /diario (sin login, solo porcentajes) ----------
function resumenPeriodo(apuestas, capital) {
  const r = resumen(apuestas, capital);
  return {
    porcentaje: r.porcentaje,
    ganadas: r.ganadas,
    perdidas: r.perdidas,
    nulas: r.nulas,
    pendientes: r.pendientes,
    acierto: r.acierto,
    yield: r.yield,
    total: apuestas.length
  };
}

api.get('/publico/resumen', r(async (req, res) => {
  const d = await store.getDatos();
  const zona = config.zonaHoraria;
  const cap = d.capitalInicial;
  const hoy = fechaLocal(new Date(), zona);
  const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : hoy.slice(0, 7);
  const dia = a => fechaLocal(a.creadaEn, zona);

  const delMes = d.apuestas.filter(a => dia(a).startsWith(mes));
  const deHoy = d.apuestas.filter(a => dia(a) === hoy);

  // % por día del mes
  const porDia = {};
  for (const a of delMes) (porDia[dia(a)] = porDia[dia(a)] || []).push(a);
  const dias = Object.keys(porDia).sort().map(f => ({ fecha: f, ...resumenPeriodo(porDia[f], cap) }));

  const lista = arr => arr.slice().sort((x, y) => x.id - y.id).map(a => {
    const c = calcular(a, cap);
    return {
      id: a.id,
      pick: a.pick,
      mercado: a.mercado,
      partido: a.partido,
      cuota: a.cuota,
      stake: a.stake,
      estado: a.estado,
      porcentaje: a.estado === 'pendiente' ? c.porcentajePotencial : c.porcentaje
    };
  });

  const meses = [...new Set(d.apuestas.map(a => dia(a).slice(0, 7)))].sort().reverse();
  if (!meses.includes(hoy.slice(0, 7))) meses.unshift(hoy.slice(0, 7));

  res.set('Cache-Control', 'no-store');
  res.json({
    hoy: { fecha: hoy, ...resumenPeriodo(deHoy, cap), apuestas: lista(deHoy) },
    mes: { mes, ...resumenPeriodo(delMes, cap), dias, apuestas: lista(delMes) },
    total: resumenPeriodo(d.apuestas, cap),
    meses,
    actualizado: new Date().toISOString()
  });
}));

// ---------- Rutas para el bot de tu PC (usa la llave BOT_KEY, no la sesión) ----------
const BOT_KEY = process.env.BOT_KEY || '';
const botApi = express.Router();

botApi.use((req, res, next) => {
  if (BOT_KEY && req.get('x-bot-key') === BOT_KEY) return next();
  res.status(401).json({ error: 'Llave del bot incorrecta' });
});

// El bot avisa que está vivo, su estado, el QR y sus grupos
botApi.post('/estado', r(async (req, res) => {
  const { estado, qr, numero, grupos, error } = req.body || {};
  await store.setBot({ estado, qr: qr || null, numero: numero || null, grupos: grupos || [], error: error ? String(error).slice(0, 500) : null, actualizado: Date.now() });
  res.json({ ok: true });
}));

// El bot pide el siguiente mensaje de la cola
botApi.post('/siguiente', r(async (req, res) => {
  const d = await store.getDatos();
  if (d.linkPendiente) return res.json({ item: null, linkPendiente: d.linkPendiente });
  if (!d.grupoId) {
    const hay = await store.largoCola();
    return res.json({ item: null, sinGrupo: hay > 0 });
  }
  // Los mensajes que quedaron esperando de días anteriores se descartan (no se mandan)
  const hoy = hoyLocal();
  let item = await store.sacarDeCola();
  let descartados = 0;
  while (item && (item.dia || fechaLocal(item.creado, config.zonaHoraria)) !== hoy) {
    descartados++;
    item = await store.sacarDeCola();
  }
  res.json({ item: item || null, grupoId: d.grupoId, descartados });
}));

// El bot avisa que alguien escribió !aqui en un grupo: ese es el grupo de los mensajes
botApi.post('/grupo', r(async (req, res) => {
  const { id, nombre } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Falta el grupo' });
  const d = await store.getDatos();
  d.grupoId = id;
  d.grupoNombre = nombre || 'Grupo';
  d.linkPendiente = null;
  d.linkError = null;
  await store.setDatos(d);
  res.json({ ok: true });
}));

// El bot no pudo usar el link de invitación
botApi.post('/grupo-error', r(async (req, res) => {
  const d = await store.getDatos();
  d.linkPendiente = null;
  d.linkError = String((req.body && req.body.error) || 'No se pudo usar el link').slice(0, 300);
  await store.setDatos(d);
  res.json({ ok: true });
}));

// Si no pudo enviarlo, lo devuelve a la cola
botApi.post('/devolver', r(async (req, res) => {
  if (req.body && req.body.item) await store.devolverACola(req.body.item);
  res.json({ ok: true });
}));

// Resumen nocturno (lo pide el bot a la hora configurada)
botApi.post('/resumen', r(async (req, res) => {
  const d = await store.getDatos();
  const hoy = fechaLocal(new Date(), config.zonaHoraria);
  await store.encolar(msj.resumenDia(d, hoy, config.zonaHoraria));
  res.json({ ok: true });
}));

api.use('/bot', botApi);

// Todo lo de abajo requiere sesión
api.use((req, res, next) => {
  if (req.session && req.session.usuario) return next();
  res.status(401).json({ error: 'No autorizado' });
});

// ---------- Helpers ----------
async function respuestaDatos(d) {
  d = d || (await store.getDatos());
  return {
    ajustes: {
      capitalInicial: d.capitalInicial,
      moneda: d.moneda,
      stakePorDefecto: d.stakePorDefecto,
      grupoId: d.grupoId,
      grupoNombre: d.grupoNombre
    },
    resumen: resumen(d.apuestas, d.capitalInicial),
    apuestas: d.apuestas
      .slice()
      .reverse()
      .map(a => ({ ...a, calc: calcular(a, d.capitalInicial), mensaje: msj.apuesta(a, d) }))
  };
}

async function botActivo() {
  const b = await store.getBot();
  return Boolean(b && Date.now() - b.actualizado < BOT_VIVO_MS && b.estado === 'conectado');
}

const hoyLocal = () => fechaLocal(new Date(), config.zonaHoraria);
const diaDe = a => fechaLocal(a.creadaEn, config.zonaHoraria);

// Pone mensajes en la cola; el bot en tu PC los manda a WhatsApp
async function avisar(textos) {
  const lista = Array.isArray(textos) ? textos : [textos];
  const hoy = hoyLocal();
  for (const t of lista) await store.encolar(t, hoy);
  const d = await store.getDatos();
  let aviso = null;
  if (!d.grupoId) aviso = 'Falta elegir el grupo de WhatsApp';
  else if (!(await botActivo())) aviso = 'El bot está apagado: se mandará cuando lo prendas';
  return { encolados: lista.length, aviso };
}

// Solo se mandan a WhatsApp las apuestas de HOY. Las de días anteriores quedan en el registro.
async function avisarApuestas(apuestas, d, forzar = false) {
  const hoy = hoyLocal();
  const deHoy = forzar ? apuestas : apuestas.filter(a => diaDe(a) === hoy);
  const omitidas = apuestas.length - deHoy.length;
  const r = deHoy.length ? await avisar(deHoy.map(a => msj.apuesta(a, d))) : { encolados: 0, aviso: null };
  if (omitidas) {
    const txt = `${omitidas === 1 ? 'Es de otro día' : `${omitidas} son de otros días`}: queda en el registro pero no se manda a WhatsApp`;
    r.aviso = r.aviso ? `${r.aviso} · ${txt}` : txt;
  }
  return r;
}

function nuevaApuesta(d, x) {
  return {
    id: d.siguienteId++,
    pick: String(x.pick).trim(),
    mercado: String(x.mercado || '').trim(),
    partido: String(x.partido || '').trim(),
    cuota: num(x.cuota),
    stake: num(x.stake),
    estado: 'pendiente',
    creadaEn: new Date().toISOString(),
    resueltaEn: null
  };
}

function validar(x, n) {
  const pre = n ? `Apuesta ${n}: ` : '';
  if (!x.pick || !String(x.pick).trim()) return `${pre}falta el pick`;
  if (!(num(x.cuota) > 1)) return `${pre}la cuota debe ser mayor a 1`;
  const s = num(x.stake);
  if (!(s > 0 && s <= 100)) return `${pre}stake inválido`;
  return null;
}

// ---------- Datos y ajustes ----------
api.get('/datos', r(async (req, res) => res.json(await respuestaDatos())));

api.put('/ajustes', r(async (req, res) => {
  const d = await store.getDatos();
  const { capitalInicial, moneda, stakePorDefecto } = req.body;
  if (capitalInicial !== undefined) {
    const c = num(capitalInicial);
    if (!(c > 0)) return res.status(400).json({ error: 'Capital inválido' });
    d.capitalInicial = c;
  }
  if (moneda) d.moneda = String(moneda).trim().slice(0, 5);
  if (stakePorDefecto !== undefined) {
    const s = num(stakePorDefecto);
    if (!(s > 0 && s <= 100)) return res.status(400).json({ error: 'Stake inválido' });
    d.stakePorDefecto = s;
  }
  await store.setDatos(d);
  res.json(await respuestaDatos(d));
}));

// ---------- Apuestas ----------
api.post('/apuestas', r(async (req, res) => {
  const error = validar(req.body);
  if (error) return res.status(400).json({ error });
  const d = await store.getDatos();
  const a = nuevaApuesta(d, req.body);
  d.apuestas.push(a);
  await store.setDatos(d);
  const envio = req.body.enviar ? await avisarApuestas([a], d) : {};
  res.json({ ...(await respuestaDatos(d)), ...envio });
}));

api.post('/apuestas/lote', r(async (req, res) => {
  const lista = Array.isArray(req.body.apuestas) ? req.body.apuestas : [];
  if (!lista.length) return res.status(400).json({ error: 'No hay apuestas para guardar' });
  for (const [i, x] of lista.entries()) {
    const error = validar(x, i + 1);
    if (error) return res.status(400).json({ error });
  }
  const d = await store.getDatos();
  const nuevas = lista.map(x => nuevaApuesta(d, x));
  d.apuestas.push(...nuevas);
  await store.setDatos(d);
  const envio = req.body.enviar ? await avisarApuestas(nuevas, d) : {};
  res.json({ ...(await respuestaDatos(d)), guardadas: nuevas.length, ...envio });
}));

api.patch('/apuestas/:id', r(async (req, res) => {
  const d = await store.getDatos();
  const a = d.apuestas.find(x => x.id === Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Apuesta no encontrada' });

  const { estado, enviar } = req.body;
  let cambioEstado = false;
  if (req.body.stake !== undefined) {
    const s = num(req.body.stake);
    if (!(s > 0 && s <= 100)) return res.status(400).json({ error: 'Stake inválido' });
    a.stake = s;
  }
  if (req.body.cuota !== undefined) {
    const c = num(req.body.cuota);
    if (!(c > 1)) return res.status(400).json({ error: 'Cuota inválida' });
    a.cuota = c;
  }
  if (estado && estado !== a.estado) {
    if (!['pendiente', 'ganada', 'perdida', 'nula'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }
    a.estado = estado;
    a.resueltaEn = estado === 'pendiente' ? null : new Date().toISOString();
    cambioEstado = estado !== 'pendiente';
  }
  await store.setDatos(d);
  const envio = enviar && cambioEstado ? await avisarApuestas([a], d) : {};
  res.json({ ...(await respuestaDatos(d)), ...envio });
}));

api.post('/apuestas/:id/enviar', r(async (req, res) => {
  const d = await store.getDatos();
  const a = d.apuestas.find(x => x.id === Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Apuesta no encontrada' });
  res.json(await avisarApuestas([a], d, true));
}));

api.delete('/apuestas/:id', r(async (req, res) => {
  const d = await store.getDatos();
  d.apuestas = d.apuestas.filter(x => x.id !== Number(req.params.id));
  await store.setDatos(d);
  res.json(await respuestaDatos(d));
}));

// ---------- WhatsApp (estado que reporta el bot) ----------
api.get('/whatsapp', r(async (req, res) => {
  const d = await store.getDatos();
  const b = await store.getBot();
  const vivo = b && Date.now() - b.actualizado < BOT_VIVO_MS;
  res.json({
    estado: vivo ? b.estado : 'apagado',
    qr: vivo ? b.qr : null,
    numero: vivo ? b.numero : null,
    error: vivo ? b.error || null : null,
    grupos: vivo ? b.grupos || [] : [],
    enCola: await store.largoCola(),
    grupoId: d.grupoId,
    grupoNombre: d.grupoNombre,
    linkPendiente: Boolean(d.linkPendiente),
    linkError: d.linkError || null,
    baseDatos: store.modo()
  });
}));

api.put('/whatsapp/grupo', r(async (req, res) => {
  const d = await store.getDatos();
  d.grupoId = req.body.id || null;
  d.grupoNombre = req.body.nombre || null;
  await store.setDatos(d);
  res.json({ ok: true, grupoId: d.grupoId, grupoNombre: d.grupoNombre });
}));

// Pegas el link de invitación del grupo; el bot lo convierte en el grupo de destino
api.put('/whatsapp/link', r(async (req, res) => {
  const m = String((req.body && req.body.link) || '').match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{10,})/);
  if (!m) return res.status(400).json({ error: 'Ese no parece un link de grupo de WhatsApp (chat.whatsapp.com/...)' });
  const d = await store.getDatos();
  d.linkPendiente = m[1];
  d.linkError = null;
  await store.setDatos(d);
  res.json({ ok: true });
}));

api.post('/whatsapp/resumen', r(async (req, res) => {
  const d = await store.getDatos();
  const hoy = fechaLocal(new Date(), config.zonaHoraria);
  res.json(await avisar(msj.resumenDia(d, hoy, config.zonaHoraria)));
}));

app.use('/api', api);

// Errores como JSON
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
});

module.exports = app;
