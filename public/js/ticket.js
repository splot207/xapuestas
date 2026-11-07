// Convierte el texto leído de un ticket (OCR) en los datos de la apuesta.
// Funciona en el navegador (window.leerTicket) y en Node (module.exports).
(function (global) {
  const RUIDO = /^(total|ganancia|ganancias|mantener|cerrar|cobrar|cash ?out|retirar|pago|potencial|importe|id\b|fecha|hora|ticket|apuesta realizada|compartir|repetir|cuota total|bono)/i;
  const TIPO = /^(simple|sencilla|individual|combinada|m[uú]ltiple|sistema|parlay)\b/i;
  const DINERO = /(?:S\/\.?|\$|COP|PEN|USD|€|MXN|ARS|CLP)\s*([\d.,]+)/i;
  const DECIMAL_FINAL = /(\d{1,3}[.,]\d{1,3})\s*$/;

  const numero = t => {
    let s = String(t).trim();
    // 50.000 o 1,250,000 (solo miles) -> 50000
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return parseFloat(s.replace(/[.,]/g, ''));
    // 1.234,56 -> 1234.56 | 1,234.56 -> 1234.56 | 2,40 -> 2.40
    if (/\d[.,]\d{3}[.,]\d{1,2}$/.test(s)) s = s.replace(/[.,](?=\d{3}[.,])/g, '');
    return parseFloat(s.replace(',', '.'));
  };

  // Quita iconos o letras sueltas que el OCR lee al inicio ("E Más de 1.5", "(U) Universitario")
  const limpiarInicio = t =>
    t
      .replace(/^\(?[^\p{L}\p{N}(]{1,3}\)?\s+/u, '')
      .replace(/^\([\p{L}\p{N}]{1,3}\)\s*/u, '')
      .replace(/^[\p{L}\p{N}]{1,2}\s+(?=\p{Lu})/u, m => (/^\p{Lu}\s$/u.test(m) || m.length <= 2 ? '' : m))
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .trim();

  const pareceNombre = t => /\p{L}{3,}/u.test(t) && !RUIDO.test(t) && !DINERO.test(t) && !DECIMAL_FINAL.test(t);

  function leerTicket(texto) {
    const lineas = String(texto || '')
      .split(/\r?\n/)
      .map(l => l.replace(/\s+/g, ' ').trim())
      .filter(l => l.length > 1);

    const r = { pick: '', mercado: '', partido: '', cuota: null, monto: null };

    // Monto apostado
    for (const l of lineas) {
      const m = l.match(DINERO);
      if (!m) continue;
      if (/^(total|importe|monto|apostado|stake)\b/i.test(l) || TIPO.test(l)) {
        r.monto = numero(m[1]);
        break;
      }
    }

    // Línea del pick: termina en una cuota y no es línea de dinero/tipo
    let iPick = lineas.findIndex(l => DECIMAL_FINAL.test(l) && !DINERO.test(l) && !TIPO.test(l) && !RUIDO.test(l));
    if (iPick >= 0) {
      const l = lineas[iPick];
      r.cuota = numero(l.match(DECIMAL_FINAL)[1]);
      r.pick = limpiarInicio(l.replace(DECIMAL_FINAL, '').trim());
    } else {
      // Sin línea de pick clara: buscar cuota en la línea "Simple ... 2.40" o "Cuota 2.40"
      const lc = lineas.find(l => (TIPO.test(l) || /cuota/i.test(l)) && DECIMAL_FINAL.test(l));
      if (lc) r.cuota = numero(lc.match(DECIMAL_FINAL)[1]);
    }
    if (r.cuota && (r.cuota < 1.01 || r.cuota > 1000)) r.cuota = null;

    // Mercado y partido: líneas siguientes al pick
    const resto = lineas.slice(iPick >= 0 ? iPick + 1 : 0).filter(l => !TIPO.test(l));
    const siguientes = [];
    for (const l of resto) {
      if (RUIDO.test(l) || DINERO.test(l)) break;
      if (pareceNombre(l)) siguientes.push(limpiarInicio(l));
    }

    const conVs = siguientes.findIndex(l => /\s(vs\.?|v)\s/i.test(l));
    if (conVs >= 0) {
      r.partido = siguientes[conVs].replace(/\s(v|vs\.?)\s/i, ' vs ');
      r.mercado = siguientes.filter((_, i) => i !== conVs)[0] || '';
    } else {
      r.mercado = siguientes[0] || '';
      const equipos = siguientes.slice(1, 3);
      if (equipos.length === 2) r.partido = `${equipos[0]} vs ${equipos[1]}`;
      else if (equipos.length === 1) r.partido = equipos[0];
    }

    return r;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { leerTicket };
  else global.leerTicket = leerTicket;
})(this);
