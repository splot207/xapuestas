// Bot de WhatsApp (corre en tu PC con el número secundario).
// Lee la cola de mensajes que deja el dashboard y los manda al grupo.
// Arranque: npm run bot   (desde la carpeta principal)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const qrTerminal = require('qrcode-terminal');
const cron = require('node-cron');

const config = require('../config.json');
const store = require('../src/store');
const msj = require('../src/mensajes');
const { fechaLocal } = require('../src/calculos');

const CADA_COLA_MS = 8000;      // revisa si hay mensajes nuevos cada 8 s
const CADA_LATIDO_MS = 25000;   // avisa al dashboard que sigue vivo cada 25 s
const PAUSA_ENTRE_MSJ = 1500;   // pausa entre mensajes para no parecer spam

let estado = 'iniciando';
let qrImagen = null;
let numero = null;
let grupos = [];

const esperar = ms => new Promise(r => setTimeout(r, ms));

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.sesion') }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

async function publicarEstado() {
  try {
    await store.setBot({ estado, qr: qrImagen, numero, grupos, actualizado: Date.now() });
  } catch (e) {
    console.error('No se pudo publicar el estado:', e.message);
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
});

client.on('auth_failure', () => {
  estado = 'desconectado';
  console.log('⚠️ Falló la autenticación. Borra la carpeta bot/.sesion y vuelve a escanear.');
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
async function procesarCola() {
  if (procesando || estado !== 'conectado') return;
  procesando = true;
  try {
    const d = await store.getDatos();
    if (!d.grupoId) return;
    let item;
    while ((item = await store.sacarDeCola())) {
      try {
        await client.sendMessage(d.grupoId, item.texto);
        console.log(`📤 Enviado: ${item.texto.split('\n')[0]}`);
        await esperar(PAUSA_ENTRE_MSJ);
      } catch (e) {
        console.error('No se pudo enviar, se reintenta luego:', e.message);
        await store.devolverACola(item);
        break;
      }
    }
  } catch (e) {
    console.error('Error leyendo la cola:', e.message);
  } finally {
    procesando = false;
  }
}

// Resumen automático todas las noches
const [hh, mm] = config.horaResumen.split(':').map(Number);
cron.schedule(`${mm} ${hh} * * *`, async () => {
  try {
    const d = await store.getDatos();
    const hoy = fechaLocal(new Date(), config.zonaHoraria);
    await store.encolar(msj.resumenDia(d, hoy, config.zonaHoraria));
    console.log('🌙 Resumen nocturno en cola');
    procesarCola();
  } catch (e) {
    console.error('Error en el resumen nocturno:', e.message);
  }
}, { timezone: config.zonaHoraria });

if (store.modo() !== 'redis') {
  console.log('⚠️ No encontré KV_REST_API_URL / KV_REST_API_TOKEN en el archivo .env.');
  console.log('   El bot va a usar datos locales y NO va a ver lo que cargas en Vercel.');
}

setInterval(procesarCola, CADA_COLA_MS);
setInterval(publicarEstado, CADA_LATIDO_MS);
setInterval(() => estado === 'conectado' && cargarGrupos(), 5 * 60 * 1000);

publicarEstado();
client.initialize().catch(e => {
  estado = 'desconectado';
  console.error('No se pudo iniciar WhatsApp:', e.message);
  publicarEstado();
});
