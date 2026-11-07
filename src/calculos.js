// Cálculos de apuestas (monto, ganancia, % y resumen)

const POR_DEFECTO = {
  capitalInicial: 2000,
  moneda: 'S/',
  stakePorDefecto: 5,
  grupoId: null,
  grupoNombre: null,
  siguienteId: 1,
  apuestas: []
};

function calcular(a, capital) {
  const monto = (capital * a.stake) / 100;
  let ganancia = 0;
  if (a.estado === 'ganada') ganancia = monto * (a.cuota - 1);
  if (a.estado === 'perdida') ganancia = -monto;
  const potencial = monto * (a.cuota - 1);
  return {
    monto,
    ganancia,
    porcentaje: capital > 0 ? (ganancia / capital) * 100 : 0,
    potencial,
    porcentajePotencial: capital > 0 ? (potencial / capital) * 100 : 0,
    retorno: monto * a.cuota
  };
}

function resumen(apuestas, capital) {
  const r = { ganadas: 0, perdidas: 0, nulas: 0, pendientes: 0, ganancia: 0, apostado: 0, enJuego: 0 };
  for (const a of apuestas) {
    const c = calcular(a, capital);
    if (a.estado === 'ganada') r.ganadas++;
    if (a.estado === 'perdida') r.perdidas++;
    if (a.estado === 'nula') r.nulas++;
    if (a.estado === 'pendiente') { r.pendientes++; r.enJuego += c.monto; }
    if (a.estado === 'ganada' || a.estado === 'perdida') r.apostado += c.monto;
    r.ganancia += c.ganancia;
  }
  r.porcentaje = capital > 0 ? (r.ganancia / capital) * 100 : 0;
  r.capitalActual = capital + r.ganancia;
  const decididas = r.ganadas + r.perdidas;
  r.acierto = decididas ? (r.ganadas / decididas) * 100 : 0;
  r.yield = r.apostado ? (r.ganancia / r.apostado) * 100 : 0;
  return r;
}

function fechaLocal(fecha, zona) {
  return new Date(fecha).toLocaleDateString('en-CA', { timeZone: zona });
}

module.exports = { POR_DEFECTO, calcular, resumen, fechaLocal };
