// Bot de WhatsApp (corre en tu PC con el número secundario).
// Le pide al dashboard (Vercel) los mensajes pendientes y los manda al grupo.
// Arranque: doble clic en INICIAR-BOT.bat  (o: npm run bot)
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const qrTerminal = require('qrcode-terminal');
const cron = require('node-cron');
const config = require('../config.json');

// Configuración: bot/conexion.json (o variables DASHBOARD_URL / BOT_KEY en .env)
let conexion = {};
try {
  conexion = require('./conexion.json');
} catch {
  /* sin archivo: se usan las variables de entorno */
}
const DASHBOARD = (process.env.DASHBOARD_URL || conexion.dashboardUrl || '').replace(/\/+$/, '');
const BOT_KEY = process.env.BOT_KEY || conexion.botKey || '';

const CADA_COLA_MS = 10000;   // revisa si hay mensajes nuevos cada 10 s
const CADA_LATIDO_MS = 60000; // avisa al dashboard que sigue vivo cada 60 s
const PAUSA_ENTRE_MSJ = 1500; // pausa entre mensajes para no parecer spam

if (!DASHBOARD || !BOT_KEY) {
  console.log('⚠️ Falta bot/conexion.json (dashboardUrl y botKey).');
  process.exit(1);
}

let ultimoError = null;
let estado = 'iniciando';
let qrImagen = null;
let numero = null;
let grupos = [];
let avisoGrupos = false;

const esperar = ms => new Promise(r => setTimeout(r, ms));

async function llamar(ruta, cuerpo) {
  const res = await fetch(`${DASHBOARD}/api/bot/${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bot-key': BOT_KEY },
    body: JSON.stringify(cuerpo || {})
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

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
  try {
    await llamar('estado', { estado, qr: qrImagen, numero, grupos, error: ultimoError });
  } catch (e) {
    console.error('No se pudo avisar al dashboard:', e.message);
  }
}

async function cargarGrupos() {
  try {
    const chats = await client.getChats();
    grupos = chats
      .filter(c => c.isGroup)
      .map(c => ({ id: c.id._serialized, nombre: c.name }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  } catch (e) {
    if (!avisoGrupos) {
      console.log('ℹ️ WhatsApp no deja leer la lista de grupos. Escribe !aqui dentro de tu grupo para elegirlo.');
      avisoGrupos = true;
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
  await cargarGrupos();
  console.log(grupos.length ? `👥 Grupos encontrados: ${grupos.length}` : '👥 Buscando grupos… (puede tardar un poco mientras WhatsApp sincroniza)');
  publicarEstado();
  procesarCola();
});

// Escribe !aqui en tu grupo (desde cualquier número) y ese grupo queda elegido.
// No usa getChat()/getChats() porque fallan con algunas versiones de WhatsApp Web.
const normalizar = t => (t || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^[¡!]+/, '!');

client.on('message_create', async m => {
  try {
    const grupoId = m.fromMe ? m.to : m.from;
    const esGrupo = typeof grupoId === 'string' && grupoId.endsWith('@g.us');
    if (esGrupo) console.log(`📩 Mensaje en un grupo: "${(m.body || '').slice(0, 40)}"`);
    if (!esGrupo || normalizar(m.body) !== '!aqui') return;

    let nombre = 'Grupo de apuestas';
    try {
      const chat = await m.getChat();
      if (chat && chat.name) nombre = chat.name;
    } catch {
      /* si falla, se usa el nombre por defecto */
    }
    const g = { id: grupoId, nombre };
    await llamar('grupo', g);
    if (!grupos.some(x => x.id === g.id)) grupos.push(g);
    publicarEstado();
    console.log(`✅ Grupo elegido: ${g.nombre} (${g.id})`);
    try {
      await client.sendMessage(g.id, '✅ Listo, desde ahora las apuestas se mandan a este grupo.');
    } catch (e) {
      console.error('No se pudo responder en el grupo:', e.message);
    }
    procesarCola();
  } catch (e) {
    console.error('No se pudo guardar el grupo:', e.message);
  }
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

// Manda todo lo que haya en la cola
let procesando = false;
let avisoSinGrupo = false;
async function procesarCola() {
  if (procesando || estado !== 'conectado') return;
  procesando = true;
  try {
    for (;;) {
      const r = await llamar('siguiente');
      if (r.sinGrupo && !avisoSinGrupo) {
        console.log('ℹ️ Hay mensajes esperando: escribe !aqui dentro de tu grupo de WhatsApp.');
        avisoSinGrupo = true;
      }
      if (!r.item) break;
      avisoSinGrupo = false;
      try {
        await client.sendMessage(r.grupoId, r.item.texto);
        console.log(`📤 Enviado: ${r.item.texto.split('\n')[0]}`);
        await esperar(PAUSA_ENTRE_MSJ);
      } catch (e) {
        console.error('No se pudo enviar, se reintenta luego:', e.message);
        await llamar('devolver', { item: r.item }).catch(() => {});
        break;
      }
    }
  } catch (e) {
    console.error('Error hablando con el dashboard:', e.message);
  } finally {
    procesando = false;
  }
}

// Resumen automático todas las noches
const [hh, mm] = config.horaResumen.split(':').map(Number);
cron.schedule(`${mm} ${hh} * * *`, async () => {
  try {
    await llamar('resumen');
    console.log('🌙 Resumen nocturno en cola');
    procesarCola();
  } catch (e) {
    console.error('Error en el resumen nocturno:', e.message);
  }
}, { timezone: config.zonaHoraria });

setInterval(procesarCola, CADA_COLA_MS);
setInterval(publicarEstado, CADA_LATIDO_MS);
// Los grupos se recargan cada 5 min; si todavía no aparece ninguno (WhatsApp sigue sincronizando), cada 20 s
setInterval(() => estado === 'conectado' && cargarGrupos(), 5 * 60 * 1000);
setInterval(async () => {
  if (estado === 'conectado' && grupos.length === 0) {
    await cargarGrupos();
    if (grupos.length) {
      console.log(`👥 Grupos encontrados: ${grupos.length}`);
      publicarEstado();
    }
  }
}, 20000);

console.log(`🔗 Conectando con el dashboard: ${DASHBOARD}`);
publicarEstado();
client.initialize().catch(e => {
  estado = 'desconectado';
  ultimoError = `No se pudo iniciar WhatsApp: ${e.message}`;
  console.error('No se pudo iniciar WhatsApp:', e.message);
  publicarEstado();
});
