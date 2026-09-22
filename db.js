const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_ROOT = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const DB_DIR = path.join(DATA_ROOT, 'db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DB_DIR, 'app.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    genre TEXT DEFAULT '',
    description TEXT DEFAULT '',
    artist_credit TEXT DEFAULT '',
    audio_filename TEXT NOT NULL,
    cover_filename TEXT DEFAULT '',
    duration_seconds INTEGER DEFAULT 0,
    plays INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    price_label TEXT DEFAULT '',
    price_cup REAL DEFAULT 0,
    for_sale INTEGER DEFAULT 0,
    is_playlist INTEGER DEFAULT 0,
    is_exclusive INTEGER DEFAULT 0,
    sold INTEGER DEFAULT 0,
    producer_id INTEGER,
    approval_status TEXT DEFAULT 'approved',
    rejection_reason TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS track_licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL,
    license_type TEXT NOT NULL,
    price_cup REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(track_id, license_type)
  );

  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    artist_name TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    avatar_filename TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS payment_info (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    contact_phone TEXT DEFAULT '',
    accounts_json TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS stream_tokens (
    token TEXT PRIMARY KEY,
    track_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL,
    track_title TEXT NOT NULL,
    price_label TEXT DEFAULT '',
    currency TEXT DEFAULT 'CUP',
    buyer_name TEXT NOT NULL,
    buyer_phone TEXT NOT NULL,
    receipt_filename TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    producer_id INTEGER,
    price_cup_at_sale REAL DEFAULT 0,
    commission_percent_at_sale REAL DEFAULT 0,
    producer_earning_cup REAL DEFAULT 0,
    license_type TEXT DEFAULT 'basic',
    certificate_id TEXT,
    certificate_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS watermark_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    voice_filename TEXT DEFAULT '',
    interval_seconds INTEGER DEFAULT 20,
    volume REAL DEFAULT 0.35
  );

  CREATE TABLE IF NOT EXISTS social_links (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    links_json TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS exchange_rates (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    rates_json TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS site_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    promo_text TEXT DEFAULT '',
    promo_active INTEGER DEFAULT 0,
    schedule_text TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS producers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS producer_sessions (
    token TEXT PRIMARY KEY,
    producer_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS platform_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    commission_percent REAL DEFAULT 20
  );
`);

// migraciones para bases ya existentes
const trackCols = db.prepare("PRAGMA table_info(tracks)").all().map(c => c.name);
if (!trackCols.includes('price_label')) {
  db.exec("ALTER TABLE tracks ADD COLUMN price_label TEXT DEFAULT ''");
}
if (!trackCols.includes('for_sale')) {
  db.exec('ALTER TABLE tracks ADD COLUMN for_sale INTEGER DEFAULT 0');
}
if (!trackCols.includes('price_cup')) {
  db.exec('ALTER TABLE tracks ADD COLUMN price_cup REAL DEFAULT 0');
}
if (!trackCols.includes('is_playlist')) {
  db.exec('ALTER TABLE tracks ADD COLUMN is_playlist INTEGER DEFAULT 0');
}
if (!trackCols.includes('is_exclusive')) {
  db.exec('ALTER TABLE tracks ADD COLUMN is_exclusive INTEGER DEFAULT 0');
}
if (!trackCols.includes('sold')) {
  db.exec('ALTER TABLE tracks ADD COLUMN sold INTEGER DEFAULT 0');
}
if (!trackCols.includes('artist_credit')) {
  db.exec("ALTER TABLE tracks ADD COLUMN artist_credit TEXT DEFAULT ''");
}
if (!trackCols.includes('likes')) {
  db.exec('ALTER TABLE tracks ADD COLUMN likes INTEGER DEFAULT 0');
}
if (!trackCols.includes('producer_id')) {
  db.exec('ALTER TABLE tracks ADD COLUMN producer_id INTEGER');
}
if (!trackCols.includes('approval_status')) {
  db.exec("ALTER TABLE tracks ADD COLUMN approval_status TEXT DEFAULT 'approved'");
}
if (!trackCols.includes('rejection_reason')) {
  db.exec("ALTER TABLE tracks ADD COLUMN rejection_reason TEXT DEFAULT ''");
}

const orderCols = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
if (!orderCols.includes('currency')) {
  db.exec("ALTER TABLE orders ADD COLUMN currency TEXT DEFAULT 'CUP'");
}
if (!orderCols.includes('status')) {
  db.exec("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending'");
}
if (!orderCols.includes('producer_id')) {
  db.exec('ALTER TABLE orders ADD COLUMN producer_id INTEGER');
}
if (!orderCols.includes('price_cup_at_sale')) {
  db.exec('ALTER TABLE orders ADD COLUMN price_cup_at_sale REAL DEFAULT 0');
}
if (!orderCols.includes('commission_percent_at_sale')) {
  db.exec('ALTER TABLE orders ADD COLUMN commission_percent_at_sale REAL DEFAULT 0');
}
if (!orderCols.includes('producer_earning_cup')) {
  db.exec('ALTER TABLE orders ADD COLUMN producer_earning_cup REAL DEFAULT 0');
}
if (!orderCols.includes('license_type')) {
  db.exec("ALTER TABLE orders ADD COLUMN license_type TEXT DEFAULT 'basic'");
}
if (!orderCols.includes('certificate_id')) {
  db.exec('ALTER TABLE orders ADD COLUMN certificate_id TEXT');
}
if (!orderCols.includes('certificate_hash')) {
  db.exec('ALTER TABLE orders ADD COLUMN certificate_hash TEXT');
}

const existingLicenseTracks = db.prepare(`
  SELECT id, price_cup, is_exclusive FROM tracks
  WHERE is_playlist = 0 AND for_sale = 1 AND price_cup > 0
`).all();
for (const t of existingLicenseTracks) {
  const type = t.is_exclusive ? 'exclusive' : 'basic';
  const already = db.prepare('SELECT id FROM track_licenses WHERE track_id = ? AND license_type = ?').get(t.id, type);
  if (!already) {
    db.prepare('INSERT INTO track_licenses (track_id, license_type, price_cup) VALUES (?, ?, ?)').run(t.id, type, t.price_cup);
  }
}

const profileCols = db.prepare("PRAGMA table_info(profile)").all().map(c => c.name);
if (profileCols.includes('dj_name') && !profileCols.includes('artist_name')) {
  db.exec("ALTER TABLE profile ADD COLUMN artist_name TEXT DEFAULT ''");
  db.exec('UPDATE profile SET artist_name = dj_name WHERE id = 1');
}

const profileExists = db.prepare('SELECT id FROM profile WHERE id = 1').get();
if (!profileExists) {
  db.prepare(`INSERT INTO profile (id, artist_name, bio) VALUES (1, '', 'Bienvenido a mi música')`).run();
}

const paymentExists = db.prepare('SELECT id FROM payment_info WHERE id = 1').get();
if (!paymentExists) {
  db.prepare(`INSERT INTO payment_info (id, contact_phone, accounts_json) VALUES (1, '', '[]')`).run();
}

const watermarkExists = db.prepare('SELECT id FROM watermark_config WHERE id = 1').get();
if (!watermarkExists) {
  db.prepare(`INSERT INTO watermark_config (id, voice_filename, interval_seconds, volume) VALUES (1, '', 20, 0.35)`).run();
}

const socialExists = db.prepare('SELECT id FROM social_links WHERE id = 1').get();
if (!socialExists) {
  const defaultLinks = JSON.stringify([
    { label: 'Spotify', url: 'https://open.spotify.com/artist/5miqqIFpsWv8Tpx1OlD4Ay' },
    { label: 'Facebook', url: 'https://www.facebook.com/share/1HQWkiRP8T/' },
    { label: 'YouTube Music', url: 'https://music.youtube.com/@jlarryrg' },
    { label: 'Instagram', url: 'https://www.instagram.com/jlarryrg' },
  ]);
  db.prepare('INSERT INTO social_links (id, links_json) VALUES (1, ?)').run(defaultLinks);
}

// CUP fija en 1, el resto arranca en 0 hasta que se configuren
const ratesExist = db.prepare('SELECT id FROM exchange_rates WHERE id = 1').get();
if (!ratesExist) {
  const defaultRates = JSON.stringify([
    { code: 'CUP', label: 'CUP', cupPerUnit: 1 },
    { code: 'MLC', label: 'MLC', cupPerUnit: 0 },
    { code: 'USDT_BEP20', label: 'USDT (BEP20)', cupPerUnit: 0 },
    { code: 'USDT_TRC20', label: 'USDT (TRC20)', cupPerUnit: 0 },
    { code: 'USDT_POLYGON', label: 'USDT (Polygon)', cupPerUnit: 0 },
    { code: 'SALDO_MOVIL', label: 'Saldo Móvil', cupPerUnit: 0 },
  ]);
  db.prepare('INSERT INTO exchange_rates (id, rates_json) VALUES (1, ?)').run(defaultRates);
}

const siteConfigExists = db.prepare('SELECT id FROM site_config WHERE id = 1').get();
if (!siteConfigExists) {
  db.prepare(`INSERT INTO site_config (id, promo_text, promo_active, schedule_text) VALUES (1, '', 0, '')`).run();
}

const platformConfigExists = db.prepare('SELECT id FROM platform_config WHERE id = 1').get();
if (!platformConfigExists) {
  db.prepare('INSERT INTO platform_config (id, commission_percent) VALUES (1, 20)').run();
}

module.exports = db;
