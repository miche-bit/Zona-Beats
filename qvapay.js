// Cobro automático con QvaPay (saldo en USD de QvaPay).
//  - crearFactura: pide a QvaPay un enlace de pago para un pedido.
//  - firmaValida: comprueba que el aviso (webhook) viene de QvaPay: HMAC-SHA256 del cuerpo con el
//    App Secret, en la cabecera x-qvapay-signature ("sha256=…"), y la hora en x-qvapay-timestamp.
// Se activa con QVAPAY_APP_ID y QVAPAY_APP_SECRET. QVAPAY_URL solo sirve para pruebas.
'use strict';

const crypto = require('crypto');

const APP_ID = () => process.env.QVAPAY_APP_ID || '';
const APP_SECRET = () => process.env.QVAPAY_APP_SECRET || '';
const BASE = () => (process.env.QVAPAY_URL || 'https://qvapay.com/api/v2').replace(/\/+$/, '');
const TOLERANCIA_SEG = 300;

function activo() { return Boolean(APP_ID() && APP_SECRET()); }

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// QvaPay permite 5 cobros cada 20 segundos por app: si responde 429 se reintenta con pausa.
async function crearFactura({ amount, description, remoteId, webhook, expireAt }) {
  if (!activo()) throw new Error('QvaPay no está configurado');
  const cuerpo = JSON.stringify({
    amount: Math.round(Number(amount) * 100) / 100,
    description: String(description || '').slice(0, 255),
    remote_id: String(remoteId).slice(0, 255),
    webhook,
    ...(expireAt ? { expire_at: expireAt } : {}),
  });
  let ultimo = '';
  for (let intento = 0; intento < 4; intento++) {
    if (intento) await esperar([0, 4000, 8000, 12000][intento]);
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), 25000);
    let res;
    try {
      res = await fetch(`${BASE()}/create_invoice`, {
        method: 'POST',
        headers: { 'app-id': APP_ID(), 'app-secret': APP_SECRET(), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: cuerpo, signal: ctrl.signal,
      });
    } catch (e) {
      ultimo = e.name === 'AbortError' ? 'QvaPay no respondió a tiempo' : 'No se pudo conectar con QvaPay';
      continue;
    } finally { clearTimeout(reloj); }
    const d = await res.json().catch(() => ({}));
    if (res.status === 429 || res.status >= 500) { ultimo = `QvaPay respondió ${res.status}`; continue; }
    if (!res.ok) throw new Error((d && (d.error || d.message)) ? String(d.error || d.message) : `QvaPay respondió ${res.status}`);
    if (!d.url || !d.transaction_uuid) throw new Error('Respuesta inesperada de QvaPay');
    return { url: String(d.url), uuid: String(d.transaction_uuid) };
  }
  throw new Error(ultimo || 'QvaPay no está disponible');
}

function firmaValida(raw, firma, hora) {
  if (!activo() || !raw || !firma || !hora) return false;
  const t = Number(hora);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > TOLERANCIA_SEG) return false;
  const esperada = 'sha256=' + crypto.createHmac('sha256', APP_SECRET()).update(raw).digest('hex');
  const a = Buffer.from(esperada), b = Buffer.from(String(firma));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { activo, crearFactura, firmaValida };
