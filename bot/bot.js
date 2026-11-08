// Bot de WhatsApp (corre en tu PC con el número secundario).
// Atiende uno o varios dashboards (ej: JIJA$ y JIJAZOS): a cada uno le pide
// sus mensajes pendientes y los manda a su propio grupo.
// Arranque: doble clic en INICIAR-BOT.bat  (o: node bot/bot.js)
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const qrTerminal = require('qrcode-terminal');
const cron = require('node-cron');
const config = require('../config.json');

// ---------- Dashboards a atender (bot/conexion.json) ----------
// Formato nuevo: { "dashboards": [ { "nombre": "JIJA$", "dashboardUrl": "...", "botKey": "..." }, ... ] }
// Formato viejo: { "dashboardUrl": "...", "botKey": "..." }
let conexion = {};
try {
  conexion = require('./conexion.json');
} catch {
  /* sin archivo */
}
const lista = Array.isArray(conexion.dashboards)
  ? conexion.dashboards
  : [{ nombre: 'Dashboard', dashboardUrl: process.env.DASHBOARD_URL || conexion.dashboardUrl, botKey: process.env.BOT_KEY || conexion.botKey }];

const paneles = lista
  .filter(p => p && p.dashboardUrl && p.botKey)
  .map(p => ({
    nombre: p.nombre || p.dashboardUrl,
    url: String(p.dashboardUrl).replace(/\/+$/, ''),
    key: p.botKey,
    avisoSinGrupo: false
  }));

if (!paneles.length) {
  console.log('⚠️ Falta bot/conexion.json con la dirección del dashboard y la llave del bot.');
  process.exit(1);
}

const CADA_COLA_MS = 10000;   // revisa si hay mensajes nuevos cada 10 s
const CADA_LATIDO_MS = 60000; // avisa a los dashboards que sigue vivo cada 60 s
const PAUSA_ENTRE_MSJ = 1500; // pausa entre mensajes para no parecer spam

let estado = 'iniciando';
let qrImagen = null;
let numero = null;
let ultimoError = null;

const esperar = ms => new Promise(r => setTimeout(r, ms));

async function llamar(panel, ruta, cuerpo) {
  const res = await fetch(`${panel.url}/api/bot/${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bot-key': panel.key },
    body: JSON.stringify(cuerpo || {})
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

// ---------- Navegador ----------
// Usa el Chrome (o Edge) que ya tienes instalado, si existe
function buscarNavegador() {
  const candidatos = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  return candidatos.find(p => {
    try { return fs.existsSync(p); } catch { return false; }
  });
}
const navegador = buscarNavegador();
if (navegador) console.log(`🌐 Usando navegador: ${navegador}`);

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.sesion') }),
  puppeteer: {
    headless: true,
    executablePath: navegador || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

async function publicarEstado() {
  for (const panel of paneles) {
    try {
      await llamar(panel, 'estado', { estado, qr: qrImagen, numero, grupos: [], error: ultimoError });
    } catch (e) {
      console.error(`No se pudo avisar a ${panel.nombre}:`, e.message);
    }
  }
}

client.on('qr', async qr => {
  estado = 'qr';
  qrImagen = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
  console.log('📱 Escanea el QR (aquí o en el dashboard) con tu número secundario:');
  qrTerminal.generate(qr, { small: true });
  publicarEstado();
});

client.on('ready', async () => {
  estado = 'conectado';
  ultimoError = null;
  qrImagen = null;
  numero = client.info && client.info.wid ? client.info.wid.user : null;
  console.log(`✅ WhatsApp conectado (+${numero})`);
  console.log(`📋 Atendiendo: ${paneles.map(p => p.nombre).join(', ')}`);
  publicarEstado();
  procesarColas();
});

client.on('auth_failure', m => {
  estado = 'desconectado';
  ultimoError = `Falló la autenticación: ${m || ''}`;
  console.log('⚠️ Falló la autenticación. Borra la carpeta bot/.sesion y vuelve a abrir el bot.');
  publicarEstado();
});

client.on('disconnected', motivo => {
  estado = 'desconectado';
  ultimoError = `WhatsApp se desconectó: ${motivo || ''}`;
  console.log('⚠️ WhatsApp desconectado. Reintentando en 5 s…');
  publicarEstado();
  setTimeout(() => client.initialize().catch(() => {}), 5000);
});

// ---------- Elegir grupo con el link de invitación ----------
async function usarLink(panel, codigo) {
  console.log(`🔗 [${panel.nombre}] Revisando el link del grupo…`);
  let id = null;
  let nombre = 'Grupo';
  const errores = [];
  try {
    const info = await client.getInviteInfo(codigo);
    id = (info && info.id && (info.id._serialized || info.id)) || null;
    if (info && info.subject) nombre = info.subject;
  } catch (e) {
    errores.push(e.message);
  }
  if (!id) {
    try {
      const r = await client.acceptInvite(codigo);
      id = (r && (r._serialized || r)) || null;
    } catch (e) {
      errores.push(e.message);
    }
  }
  if (id && String(id).endsWith('@g.us')) {
    await llamar(panel, 'grupo', { id: String(id), nombre });
    console.log(`✅ [${panel.nombre}] Grupo elegido: ${nombre}`);
    try {
      await client.sendMessage(String(id), `✅ Listo, desde ahora los mensajes de ${panel.nombre} se mandan a este grupo.`);
    } catch (e) {
      console.error('No se pudo responder en el grupo:', e.message);
    }
  } else {
    const err = `WhatsApp no aceptó el link (${errores.join(' / ') || 'sin detalle'})`;
    console.error(`⚠️ [${panel.nombre}] ${err}`);
    await llamar(panel, 'grupo-error', { error: err });
  }
}

// ---------- Mandar las colas de cada dashboard ----------
async function procesarCola(panel) {
  for (;;) {
    const r = await llamar(panel, 'siguiente');
    if (r.descartados) console.log(`🗑️ [${panel.nombre}] ${r.descartados} mensaje(s) de días anteriores no se mandaron.`);
    if (r.linkPendiente) {
      await usarLink(panel, r.linkPendiente);
      continue;
    }
    if (r.sinGrupo && !panel.avisoSinGrupo) {
      console.log(`ℹ️ [${panel.nombre}] Hay mensajes esperando: pega el link del grupo en su dashboard (panel WhatsApp).`);
      panel.avisoSinGrupo = true;
    }
    if (!r.item) break;
    panel.avisoSinGrupo = false;
    try {
      await client.sendMessage(r.grupoId, r.item.texto);
      console.log(`📤 [${panel.nombre}] Enviado: ${r.item.texto.split('\n')[0]}`);
      await esperar(PAUSA_ENTRE_MSJ);
    } catch (e) {
      console.error(`[${panel.nombre}] No se pudo enviar, se reintenta luego:`, e.message);
      await llamar(panel, 'devolver', { item: r.item }).catch(() => {});
      break;
    }
  }
}

let procesando = false;
async function procesarColas() {
  if (procesando || estado !== 'conectado') return;
  procesando = true;
  try {
    for (const panel of paneles) {
      try {
        await procesarCola(panel);
      } catch (e) {
        console.error(`Error hablando con ${panel.nombre}:`, e.message);
      }
    }
  } finally {
    procesando = false;
  }
}

// ---------- Resumen automático todas las noches ----------
const [hh, mm] = config.horaResumen.split(':').map(Number);
cron.schedule(`${mm} ${hh} * * *`, async () => {
  for (const panel of paneles) {
    try {
      await llamar(panel, 'resumen');
      console.log(`🌙 [${panel.nombre}] Resumen nocturno en cola`);
    } catch (e) {
      console.error(`[${panel.nombre}] Error en el resumen nocturno:`, e.message);
    }
  }
  procesarColas();
}, { timezone: config.zonaHoraria });

setInterval(procesarColas, CADA_COLA_MS);
setInterval(publicarEstado, CADA_LATIDO_MS);

console.log(`🔗 Dashboards: ${paneles.map(p => `${p.nombre} (${p.url})`).join(' · ')}`);
publicarEstado();
client.initialize().catch(e => {
  estado = 'desconectado';
  ultimoError = `No se pudo iniciar WhatsApp: ${e.message}`;
  console.error('No se pudo iniciar WhatsApp:', e.message);
  publicarEstado();
});
