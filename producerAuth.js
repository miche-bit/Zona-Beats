const crypto = require('node:crypto');
const db = require('./db');

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const attempt = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(hash, 'hex'));
}

function createProducerSession(producerId) {
  cleanupExpiredSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare('INSERT INTO producer_sessions (token, producer_id, expires_at) VALUES (?, ?, ?)').run(token, producerId, expiresAt);
  return token;
}

function getProducerFromSession(token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM producer_sessions WHERE token = ?').get(token);
  if (!row || row.expires_at < Date.now()) return null;
  const producer = db.prepare('SELECT id, name, email, active FROM producers WHERE id = ?').get(row.producer_id);
  if (!producer || !producer.active) return null;
  return producer;
}

function destroyProducerSession(token) {
  if (!token) return;
  db.prepare('DELETE FROM producer_sessions WHERE token = ?').run(token);
}

function cleanupExpiredSessions() {
  db.prepare('DELETE FROM producer_sessions WHERE expires_at < ?').run(Date.now());
}

module.exports = {
  hashPassword,
  verifyPassword,
  createProducerSession,
  getProducerFromSession,
  destroyProducerSession,
};
