// Para correr el dashboard en tu PC sin Vercel: node local.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const app = require('./src/app');
const store = require('./src/store');

const PUERTO = process.env.PORT || 3000;
const web = express();
web.use(app);
web.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
web.listen(PUERTO, () => {
  console.log(`🌐 Dashboard: http://localhost:${PUERTO}  (datos: ${store.modo()})`);
});
