const express = require('express');
const session = require('express-session');
const path = require('path');
const cron = require('node-cron');

const config = require('./config.json');
const db = require('./db');
const msj = require('./mensajes');

const SIN_BOT = process.argv.includes('--sin-bot'); // para probar el dashboard sin WhatsApp
const bot = SIN_BOT ? null : require('./bot');

const app = express();
app.use(express.json());
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 12 }
}));
app.use('/static', express.static(path.join(__dirname, 'public')));

// Lector de tickets (OCR) servido desde node_modules, funciona sin depender de otros sitios
const nm = p => path.join(__dirname, 'node_modules', p);
app.use('/vendor/tesseract', express.static(nm('tesseract.js/dist')));
app.use('/vendor/tesseract-core', express.static(nm('tesseract.js-core')));
app.use('/vendor/lang', express.static(nm('@tesseract.js-data/spa/4.0.0_best_int')));

function auth(req, res, next) {
  if (req.session.usuario) return next();
  if (req.path.startsWith('/api') || req.originalUrl.startsWith('/api')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  res.redirect('/login');
}

// ---------- Login ----------
app.get('/login', (req, res) => {
  if (req.session.usuario) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/api/login', (req, res) => {
  const { usuario, contrasena } = req.body || {};
  if (usuario === config.usuario && contrasena === config.contrasena) {
    req.session.usuario = usuario;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/', auth, (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));
app.use('/api', auth);

// ---------- Datos ----------
function respuestaDatos() {
  const d = db.cargar();
  return {
    ajustes: {
      capitalInicial: d.capitalInicial,
      moneda: d.moneda,
      stakePorDefecto: d.stakePorDefecto,
      grupoId: d.grupoId,
      grupoNombre: d.grupoNombre
    },
    resumen: db.resumen(d.apuestas, d.capitalInicial),
    apuestas: d.apuestas
      .slice()
      .reverse()
      .map(a => ({ ...a, calc: db.calcular(a, d.capitalInicial), mensaje: msj.apuesta(a, d) }))
  };
}

async function avisar(texto) {
  if (SIN_BOT) return { enviado: false, aviso: 'Modo sin bot: mensaje no enviado' };
  const d = db.cargar();
  try {
    await bot.enviar(d.grupoId, texto);
    return { enviado: true };
  } catch (e) {
    return { enviado: false, aviso: `No se envió a WhatsApp: ${e.message}` };
  }
}

const num = v => parseFloat(String(v).replace(',', '.'));

app.get('/api/datos', (req, res) => res.json(respuestaDatos()));

app.put('/api/ajustes', (req, res) => {
  const d = db.cargar();
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
  db.guardar(d);
  res.json(respuestaDatos());
});

// ---------- Apuestas ----------
app.post('/api/apuestas', async (req, res) => {
  const d = db.cargar();
  const { pick, mercado, partido, enviar } = req.body;
  const cuota = num(req.body.cuota);
  const stake = num(req.body.stake);
  if (!pick || !String(pick).trim()) return res.status(400).json({ error: 'Falta la apuesta (ej: Más de 1.5)' });
  if (!(cuota > 1)) return res.status(400).json({ error: 'La cuota debe ser mayor a 1' });
  if (!(stake > 0 && stake <= 100)) return res.status(400).json({ error: 'El stake debe estar entre 0 y 100%' });

  const a = {
    id: d.siguienteId++,
    pick: String(pick).trim(),
    mercado: String(mercado || '').trim(),
    partido: String(partido || '').trim(),
    cuota,
    stake,
    estado: 'pendiente',
    creadaEn: new Date().toISOString(),
    resueltaEn: null
  };
  d.apuestas.push(a);
  db.guardar(d);

  const envio = enviar ? await avisar(msj.apuesta(a, d)) : { enviado: false };
  res.json({ ...respuestaDatos(), ...envio });
});

// Varias apuestas a la vez (las que salen de los tickets)
const esperar = ms => new Promise(r => setTimeout(r, ms));

app.post('/api/apuestas/lote', async (req, res) => {
  const lista = Array.isArray(req.body.apuestas) ? req.body.apuestas : [];
  if (!lista.length) return res.status(400).json({ error: 'No hay apuestas para guardar' });

  // Validar todas antes de guardar
  for (const [i, x] of lista.entries()) {
    const n = i + 1;
    if (!x.pick || !String(x.pick).trim()) return res.status(400).json({ error: `Apuesta ${n}: falta el pick` });
    if (!(num(x.cuota) > 1)) return res.status(400).json({ error: `Apuesta ${n}: la cuota debe ser mayor a 1` });
    const s = num(x.stake);
    if (!(s > 0 && s <= 100)) return res.status(400).json({ error: `Apuesta ${n}: stake inválido` });
  }

  const d = db.cargar();
  const nuevas = lista.map(x => ({
    id: d.siguienteId++,
    pick: String(x.pick).trim(),
    mercado: String(x.mercado || '').trim(),
    partido: String(x.partido || '').trim(),
    cuota: num(x.cuota),
    stake: num(x.stake),
    estado: 'pendiente',
    creadaEn: new Date().toISOString(),
    resueltaEn: null
  }));
  d.apuestas.push(...nuevas);
  db.guardar(d);

  let enviadas = 0;
  let aviso = null;
  if (req.body.enviar) {
    for (const [i, a] of nuevas.entries()) {
      if (i > 0) await esperar(1200); // pausa para que WhatsApp no lo tome como spam
      const r = await avisar(msj.apuesta(a, d));
      if (r.enviado) enviadas++;
      else { aviso = r.aviso; break; }
    }
  }
  res.json({ ...respuestaDatos(), guardadas: nuevas.length, enviadas, aviso });
});

app.patch('/api/apuestas/:id', async (req, res) => {
  const d = db.cargar();
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
  db.guardar(d);

  const envio = enviar && cambioEstado ? await avisar(msj.apuesta(a, d)) : { enviado: false };
  res.json({ ...respuestaDatos(), ...envio });
});

app.post('/api/apuestas/:id/enviar', async (req, res) => {
  const d = db.cargar();
  const a = d.apuestas.find(x => x.id === Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Apuesta no encontrada' });
  res.json(await avisar(msj.apuesta(a, d)));
});

app.delete('/api/apuestas/:id', (req, res) => {
  const d = db.cargar();
  d.apuestas = d.apuestas.filter(x => x.id !== Number(req.params.id));
  db.guardar(d);
  res.json(respuestaDatos());
});

// ---------- WhatsApp ----------
app.get('/api/whatsapp', (req, res) => {
  const d = db.cargar();
  const e = SIN_BOT ? { estado: 'desactivado', qr: null, numero: null } : bot.getEstado();
  res.json({ ...e, grupoId: d.grupoId, grupoNombre: d.grupoNombre });
});

app.get('/api/whatsapp/grupos', async (req, res) => {
  try {
    res.json(SIN_BOT ? [] : await bot.grupos());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/whatsapp/grupo', (req, res) => {
  const d = db.cargar();
  d.grupoId = req.body.id || null;
  d.grupoNombre = req.body.nombre || null;
  db.guardar(d);
  res.json({ ok: true, grupoId: d.grupoId, grupoNombre: d.grupoNombre });
});

app.post('/api/whatsapp/resumen', async (req, res) => {
  const d = db.cargar();
  const hoy = db.fechaLocal(new Date(), config.zonaHoraria);
  res.json(await avisar(msj.resumenDia(d, hoy, config.zonaHoraria)));
});

// ---------- Resumen automático cada noche ----------
const [hh, mm] = config.horaResumen.split(':').map(Number);
cron.schedule(`${mm} ${hh} * * *`, async () => {
  const d = db.cargar();
  const hoy = db.fechaLocal(new Date(), config.zonaHoraria);
  const r = await avisar(msj.resumenDia(d, hoy, config.zonaHoraria));
  console.log(r.enviado ? '🌙 Resumen nocturno enviado' : `🌙 Resumen no enviado: ${r.aviso}`);
}, { timezone: config.zonaHoraria });

app.listen(config.puerto, () => {
  console.log(`🌐 Dashboard: http://localhost:${config.puerto}`);
  if (!SIN_BOT) bot.iniciar();
});
