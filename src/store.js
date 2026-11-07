// Guardado de datos.
// - En Vercel (y en el bot): Upstash Redis, con las variables KV_REST_API_URL / KV_REST_API_TOKEN
//   (o UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
// - En tu PC sin esas variables: un archivo local (data/local.json), útil para probar.
const fs = require('fs');
const path = require('path');
const { POR_DEFECTO } = require('./calculos');

// Limpia valores pegados con comillas, espacios o con la línea completa
// (ej: UPSTASH_REDIS_REST_TOKEN="AXXX..." en vez de solo AXXX...)
function limpiar(valor, nombre) {
  if (!valor) return valor;
  let v = String(valor).trim();
  const i = v.indexOf(`${nombre}=`);
  if (i >= 0) v = v.slice(i + nombre.length + 1).split(/\r?\n/)[0];
  return v.trim().replace(/^["']+|["']+$/g, '').trim();
}

// Junta todo lo que se haya pegado en las 4 variables posibles y saca la URL y el token
// aunque estén mezclados, cambiados de lugar o pegados juntos.
const NOMBRES = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
const brutos = NOMBRES.map(n => process.env[n] || '').join('\n');

function buscarUrl() {
  const m = brutos.match(/https:\/\/[a-z0-9.-]+\.upstash\.io/i);
  return m ? m[0] : null;
}

function buscarToken() {
  const m = brutos.match(/(?:UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN)\s*=\s*["']?([A-Za-z0-9_=-]{20,})/);
  if (m) return m[1];
  for (const n of ['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN', 'UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL']) {
    const v = limpiar(process.env[n], n);
    if (v && !/https?:|\s/.test(v) && /^[A-Za-z0-9_=-]{20,}$/.test(v)) return v;
  }
  return null;
}

const URL_REDIS = buscarUrl();
const TOKEN_REDIS = buscarToken();

let redis = null;
let errorConexion = null;
if (URL_REDIS && TOKEN_REDIS) {
  try {
    const { Redis } = require('@upstash/redis');
    redis = new Redis({ url: URL_REDIS, token: TOKEN_REDIS });
  } catch (e) {
    errorConexion = e.message;
  }
} else if (brutos.trim()) {
  errorConexion = 'Las claves de Upstash están incompletas (falta la URL o el token).';
}

const CLAVES = { datos: 'xap:datos', cola: 'xap:cola', bot: 'xap:bot' };
const ARCHIVO = path.join(__dirname, '..', 'data', 'local.json');

function modo() {
  if (redis) return 'redis';
  if (process.env.VERCEL) return 'sin-db';
  return 'archivo';
}

function sinDb() {
  const e = new Error(errorConexion || 'Falta conectar la base de datos: agrega UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN en Vercel y vuelve a publicar.');
  e.status = 503;
  throw e;
}

// ---------- modo archivo ----------
function leerArchivo() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
  } catch {
    return { datos: null, cola: [], bot: null };
  }
}
function escribirArchivo(x) {
  fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true });
  fs.writeFileSync(ARCHIVO, JSON.stringify(x, null, 2));
}

// ---------- API ----------
async function getDatos() {
  const m = modo();
  if (m === 'sin-db') sinDb();
  const d = m === 'redis' ? await redis.get(CLAVES.datos) : leerArchivo().datos;
  return { ...POR_DEFECTO, apuestas: [], ...(d || {}) };
}

async function setDatos(d) {
  const m = modo();
  if (m === 'sin-db') sinDb();
  if (m === 'redis') return redis.set(CLAVES.datos, d);
  const x = leerArchivo();
  x.datos = d;
  escribirArchivo(x);
}

// Cola de mensajes que el bot (en tu PC) va mandando a WhatsApp
async function encolar(texto) {
  const m = modo();
  if (m === 'sin-db') sinDb();
  const item = { texto, creado: Date.now() };
  if (m === 'redis') return redis.rpush(CLAVES.cola, item);
  const x = leerArchivo();
  x.cola.push(item);
  escribirArchivo(x);
}

async function sacarDeCola() {
  if (modo() === 'redis') return redis.lpop(CLAVES.cola);
  const x = leerArchivo();
  const item = x.cola.shift() || null;
  escribirArchivo(x);
  return item;
}

async function devolverACola(item) {
  if (modo() === 'redis') return redis.lpush(CLAVES.cola, item);
  const x = leerArchivo();
  x.cola.unshift(item);
  escribirArchivo(x);
}

async function largoCola() {
  if (modo() === 'redis') return redis.llen(CLAVES.cola);
  if (modo() === 'sin-db') return 0;
  return leerArchivo().cola.length;
}

// Estado que publica el bot (conectado, QR, grupos…)
async function setBot(estado) {
  if (modo() === 'redis') return redis.set(CLAVES.bot, estado);
  const x = leerArchivo();
  x.bot = estado;
  escribirArchivo(x);
}

async function getBot() {
  const m = modo();
  if (m === 'sin-db') return null;
  return m === 'redis' ? redis.get(CLAVES.bot) : leerArchivo().bot;
}

module.exports = { modo, getDatos, setDatos, encolar, sacarDeCola, devolverACola, largoCola, setBot, getBot };
