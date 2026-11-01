// Tasas del mercado informal publicadas por elTOQUE (API oficial: https://tasas.eltoque.com).
//  - pedirTasas(token): devuelve { USD: 490, MLC: 290, ECU: 520, USDT_TRC20: 500, … } en CUP por unidad.
//  - fuenteDe(code): qué tasa de elTOQUE corresponde a cada moneda de la tienda (o null si no tiene).
// El token es personal: se pide gratis en eltoque.com y se manda como «Authorization: Bearer <token>».
// ELTOQUE_URL solo sirve para pruebas.
'use strict';

const URL_API = () => (process.env.ELTOQUE_URL || 'https://tasas.eltoque.com/v1/trmi');

// Moneda de la tienda → clave en la respuesta de elTOQUE.
// Los USDT de cualquier red valen lo mismo (un dólar digital); QvaPay cobra en USD.
function fuenteDe(code) {
  const c = String(code || '').toUpperCase();
  if (c === 'USD' || c === 'QVAPAY' || /^USD_/.test(c)) return 'USD';
  if (c === 'MLC') return 'MLC';
  if (/^USDT/.test(c)) return 'USDT_TRC20';
  if (/^(EUR|EURO|ECU)(_|$)/.test(c)) return 'ECU';
  return null;
}
const NOMBRES = { USD: 'USD', MLC: 'MLC', USDT_TRC20: 'USDT', ECU: 'EUR' };

class ErrorToque extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

async function pedirTasas(token) {
  if (!token) throw new ErrorToque('Falta el token de elTOQUE.');
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), 15000);
  let res;
  try {
    res = await fetch(URL_API(), { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, signal: ctrl.signal });
  } catch (e) {
    throw new ErrorToque(e.name === 'AbortError' ? 'elTOQUE no respondió a tiempo.' : 'No se pudo conectar con elTOQUE.');
  } finally { clearTimeout(reloj); }
  if (res.status === 401 || res.status === 403 || res.status === 422) throw new ErrorToque('elTOQUE no aceptó el token: revisa que esté bien copiado o pide uno nuevo.', res.status);
  if (res.status === 429) throw new ErrorToque('elTOQUE pidió esperar (demasiadas consultas). Se reintenta en la próxima hora.', 429);
  if (!res.ok) throw new ErrorToque('elTOQUE respondió con un error (' + res.status + ').', res.status);
  const d = await res.json().catch(() => null);
  const t = d && d.tasas;
  if (!t || typeof t !== 'object' || Array.isArray(t)) throw new ErrorToque('elTOQUE respondió algo inesperado (sin tasas).');
  const tasas = {};
  for (const [k, v] of Object.entries(t)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0 && n < 1e7) tasas[String(k).toUpperCase().slice(0, 20)] = n;
  }
  if (!Object.keys(tasas).length) throw new ErrorToque('elTOQUE no trajo ninguna tasa válida.');
  return tasas;
}

module.exports = { pedirTasas, fuenteDe, NOMBRES, ErrorToque };
