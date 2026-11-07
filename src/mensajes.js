const { calcular, resumen } = require('./calculos');

function plata(moneda, v, conSigno = false) {
  const n = Math.abs(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signo = v < 0 ? '-' : conSigno && v > 0 ? '+' : '';
  return `${signo}${moneda} ${n}`;
}

function pct(v, conSigno = true) {
  const signo = conSigno && v > 0 ? '+' : '';
  return `${signo}${v.toFixed(2)}%`;
}

const ESTADOS = {
  pendiente: 'Pendiente ⏳',
  ganada: 'Ganada ✅✅✅',
  perdida: 'Perdida ❌❌❌',
  nula: 'Nula ⚪ (se devuelve lo apostado)'
};

// Mensaje de una apuesta (nueva o con resultado)
function apuesta(a, datos) {
  const c = calcular(a, datos.capitalInicial);
  let t = `*Apuesta ${a.id}*\n\n`;
  t += `${a.pick}\n`;
  if (a.mercado) t += `${a.mercado}\n`;
  if (a.partido) t += `${a.partido}\n`;
  t += `\n${ESTADOS[a.estado]}\n\n`;
  t += `Cuota ${a.cuota.toFixed(2)}\n\n`;

  if (a.estado === 'pendiente') {
    t += `Stake: ${a.stake}% (${plata(datos.moneda, c.monto)})\n`;
    t += `Ganancia posible: ${plata(datos.moneda, c.potencial, true)}\n`;
    t += `Porcentaje posible: ${pct(c.porcentajePotencial)}`;
  } else {
    t += `Ganancias: ${plata(datos.moneda, c.ganancia, true)}\n`;
    t += `Porcentaje: ${pct(c.porcentaje)}`;
  }
  return t;
}

// Resumen del día (para la noche o para el botón del dashboard)
function resumenDia(datos, fecha, zona) {
  const { fechaLocal } = require('./calculos');
  const delDia = datos.apuestas.filter(a => a.resueltaEn && fechaLocal(a.resueltaEn, zona) === fecha);
  const dia = resumen(delDia, datos.capitalInicial);
  const total = resumen(datos.apuestas, datos.capitalInicial);

  let t = `🌙 *RESUMEN DEL DÍA*\n📅 ${fecha}\n\n`;
  if (!delDia.length) {
    t += 'Hoy no se cerraron apuestas.\n';
  } else {
    for (const a of delDia) {
      const c = calcular(a, datos.capitalInicial);
      const icono = a.estado === 'ganada' ? '✅' : a.estado === 'perdida' ? '❌' : '⚪';
      t += `${icono} Apuesta ${a.id} · ${a.pick} @${a.cuota.toFixed(2)} → ${pct(c.porcentaje)}\n`;
    }
    t += `\n*Hoy:* ${plata(datos.moneda, dia.ganancia, true)} (${pct(dia.porcentaje)})\n`;
  }
  t += `\n📈 *Acumulado:* ${plata(datos.moneda, total.ganancia, true)} (${pct(total.porcentaje)})\n`;
  t += `💰 Capital: ${plata(datos.moneda, total.capitalActual)} (inicial ${plata(datos.moneda, datos.capitalInicial)})\n`;
  t += `🎯 Récord: ${total.ganadas}✅ ${total.perdidas}❌ ${total.nulas}⚪ · Acierto ${total.acierto.toFixed(0)}%`;
  if (total.pendientes) t += `\n⏳ Pendientes: ${total.pendientes}`;
  return t;
}

module.exports = { apuesta, resumenDia, plata, pct };
