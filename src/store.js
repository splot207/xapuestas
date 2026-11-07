// Guardado de datos.
// - En Vercel (y en el bot): Upstash Redis, con las variables KV_REST_API_URL / KV_REST_API_TOKEN
//   (o UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
// - En tu PC sin esas variables: un archivo local (data/local.json), útil para probar.
const fs = require('fs');
const path = require('path');
const { POR_DEFECTO } = require('./calculos');

const URL_REDIS = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_REDIS = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

let redis = null;
if (URL_REDIS && TOKEN_REDIS) {
  const { Redis } = require('@upstash/redis');
  redis = new Redis({ url: URL_REDIS, token: TOKEN_REDIS });
}

const CLAVES = { datos: 'xap:datos', cola: 'xap:cola', bot: 'xap:bot' };
const ARCHIVO = path.join(__dirname, '..', 'data', 'local.json');

function modo() {
  if (redis) return 'redis';
  if (process.env.VERCEL) return 'sin-db';
  return 'archivo';
}

function sinDb() {
  const e = new Error('Falta conectar la base de datos: en Vercel ve a Storage → Upstash Redis → Connect y luego Redeploy.');
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
