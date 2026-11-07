// Bot de WhatsApp (corre en tu PC con el número secundario).
// Le pide al dashboard (Vercel) los mensajes pendientes y los manda al grupo.
// Arranque: doble clic en INICIAR-BOT.bat  (o: npm run bot)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const qrTerminal = require('qrcode-terminal');
const cron = require('node-cron');
const config = require('../config.json');

const DASHBOARD = (process.env.DASHBOARD_URL || '').replace(/\/+$/, '');
const BOT_KEY = process.env.BOT_KEY || '';

const CADA_COLA_MS = 10000;   // revisa si hay mensajes nuevos cada 10 s
const CADA_LATIDO_MS = 60000; // avisa al dashboard que sigue vivo cada 60 s
const PAUSA_ENTRE_MSJ = 1500; // pausa entre mensajes para no parecer spam

if (!DASHBOARD || !BOT_KEY) {
  console.log('⚠️ Falta DASHBOARD_URL o BOT_KEY en el archivo .env');
  process.exit(1);
}

let estado = 'iniciando';
let qrImagen = null;
let numero = null;
let grupos = [];

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

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.sesion') }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

async function publicarEstado() {
  try {
    await llamar('estado', { estado, qr: qrImagen, numero, grupos });
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
    console.error('No se pudieron leer los grupos:', e.message);
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
  qrImagen = null;
  numero = client.info && client.info.wid ? client.info.wid.user : null;
  console.log(`✅ WhatsApp conectado (+${numero})`);
  await cargarGrupos();
  publicarEstado();
  procesarCola();
});

client.on('auth_failure', () => {
  estado = 'desconectado';
  console.log('⚠️ Falló la autenticación. Borra la carpeta bot/.sesion y vuelve a abrir el bot.');
  publicarEstado();
});

client.on('disconnected', () => {
  estado = 'desconectado';
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
        console.log('ℹ️ Hay mensajes esperando: elige el grupo en el dashboard (panel WhatsApp).');
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
setInterval(() => estado === 'conectado' && cargarGrupos(), 5 * 60 * 1000);

console.log(`🔗 Conectando con el dashboard: ${DASHBOARD}`);
publicarEstado();
client.initialize().catch(e => {
  estado = 'desconectado';
  console.error('No se pudo iniciar WhatsApp:', e.message);
  publicarEstado();
});
