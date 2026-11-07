const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const qrTerminal = require('qrcode-terminal');

let estado = 'iniciando'; // iniciando | qr | conectado | desconectado
let qrImagen = null;
let numero = null;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '.sesion' }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', async qr => {
  estado = 'qr';
  qrImagen = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
  console.log('📱 Escanea el QR desde el dashboard (o aquí abajo) con tu número secundario:');
  qrTerminal.generate(qr, { small: true });
});

client.on('ready', () => {
  estado = 'conectado';
  qrImagen = null;
  numero = client.info && client.info.wid ? client.info.wid.user : null;
  console.log(`✅ WhatsApp conectado (${numero || 'número secundario'})`);
});

client.on('auth_failure', () => {
  estado = 'desconectado';
  console.log('⚠️ Falló la autenticación. Borra la carpeta .sesion y vuelve a escanear.');
});

client.on('disconnected', () => {
  estado = 'desconectado';
  console.log('⚠️ WhatsApp desconectado. Reintentando...');
  setTimeout(() => client.initialize().catch(() => {}), 5000);
});

function iniciar() {
  client.initialize().catch(err => {
    estado = 'desconectado';
    console.error('No se pudo iniciar WhatsApp:', err.message);
  });
}

function getEstado() {
  return { estado, qr: qrImagen, numero };
}

async function grupos() {
  if (estado !== 'conectado') return [];
  const chats = await client.getChats();
  return chats
    .filter(c => c.isGroup)
    .map(c => ({ id: c.id._serialized, nombre: c.name }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

async function enviar(grupoId, texto) {
  if (estado !== 'conectado') throw new Error('WhatsApp no está conectado');
  if (!grupoId) throw new Error('No hay grupo seleccionado');
  await client.sendMessage(grupoId, texto);
}

module.exports = { iniciar, getEstado, grupos, enviar };
