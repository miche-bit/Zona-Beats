const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_ROOT = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const DB_DIR = path.join(DATA_ROOT, 'db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DB_DIR, 'app.db'));
// Si otro proceso (una copia, una herramienta) tiene la base ocupada un instante, se espera en vez de fallar.
db.exec('PRAGMA busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    genre TEXT DEFAULT '',
    description TEXT DEFAULT '',
    artist_credit TEXT DEFAULT '',
    audio_filename TEXT NOT NULL,
    master_filename TEXT DEFAULT '',
    master_hash TEXT DEFAULT '',
    stems_filename TEXT DEFAULT '',
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
    exclusive_enabled INTEGER DEFAULT 0,
    approved INTEGER DEFAULT 0,
    plan TEXT DEFAULT 'free',
    plan_paid_until TEXT DEFAULT '',
    avatar_filename TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    social_links_json TEXT DEFAULT '[]',
    accounts_json TEXT DEFAULT '[]',
    contact_phone TEXT DEFAULT '',
    disabled_reason TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS producer_sessions (
    token TEXT PRIMARY KEY,
    producer_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS platform_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    commission_percent REAL DEFAULT 20,
    admin_phone TEXT DEFAULT '',
    discount_percent REAL DEFAULT 0,
    plan_price_pro_cup REAL DEFAULT 5000,
    plan_price_studio_cup REAL DEFAULT 15000
  );

  CREATE TABLE IF NOT EXISTS plan_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producer_id INTEGER NOT NULL,
    plan TEXT NOT NULL,
    months INTEGER NOT NULL DEFAULT 1,
    amount_cup REAL NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'CUP',
    receipt_filename TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    reject_reason TEXT DEFAULT '',
    paid_until_result TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS producer_payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producer_id INTEGER NOT NULL,
    producer_name TEXT DEFAULT '',
    amount_cup REAL NOT NULL DEFAULT 0,
    orders_count INTEGER DEFAULT 0,
    account_text TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
if (!trackCols.includes('master_filename')) {
  db.exec("ALTER TABLE tracks ADD COLUMN master_filename TEXT DEFAULT ''");
}
if (!trackCols.includes('master_hash')) {
  db.exec("ALTER TABLE tracks ADD COLUMN master_hash TEXT DEFAULT ''");
}

if (!trackCols.includes('wav_filename')) db.exec("ALTER TABLE tracks ADD COLUMN wav_filename TEXT DEFAULT ''");
if (!trackCols.includes('stems_filename')) {
  db.exec("ALTER TABLE tracks ADD COLUMN stems_filename TEXT DEFAULT ''");
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

const producerCols = db.prepare("PRAGMA table_info(producers)").all().map(c => c.name);
if (!producerCols.includes('exclusive_enabled')) {
  db.exec('ALTER TABLE producers ADD COLUMN exclusive_enabled INTEGER DEFAULT 0');
}

if (!producerCols.includes('approved')) db.exec('ALTER TABLE producers ADD COLUMN approved INTEGER DEFAULT 0');
if (!producerCols.includes('plan')) db.exec("ALTER TABLE producers ADD COLUMN plan TEXT DEFAULT 'free'");
if (!producerCols.includes('plan_paid_until')) db.exec("ALTER TABLE producers ADD COLUMN plan_paid_until TEXT DEFAULT ''");
if (!producerCols.includes('avatar_filename')) db.exec("ALTER TABLE producers ADD COLUMN avatar_filename TEXT DEFAULT ''");
if (!producerCols.includes('bio')) db.exec("ALTER TABLE producers ADD COLUMN bio TEXT DEFAULT ''");
if (!producerCols.includes('social_links_json')) db.exec("ALTER TABLE producers ADD COLUMN social_links_json TEXT DEFAULT '[]'");
if (!producerCols.includes('accounts_json')) db.exec("ALTER TABLE producers ADD COLUMN accounts_json TEXT DEFAULT '[]'");
if (!producerCols.includes('contact_phone')) db.exec("ALTER TABLE producers ADD COLUMN contact_phone TEXT DEFAULT ''");
if (!producerCols.includes('disabled_reason')) db.exec("ALTER TABLE producers ADD COLUMN disabled_reason TEXT DEFAULT ''");
db.exec("UPDATE producers SET approved = 1 WHERE approved IS NULL OR (approved = 0 AND created_at < datetime('now','-1 second') AND active = 1 AND plan IS NULL)");

const platCols = db.prepare("PRAGMA table_info(platform_config)").all().map(c => c.name);
if (!platCols.includes('admin_phone')) db.exec("ALTER TABLE platform_config ADD COLUMN admin_phone TEXT DEFAULT ''");
if (!platCols.includes('discount_percent')) db.exec("ALTER TABLE platform_config ADD COLUMN discount_percent REAL DEFAULT 0");
if (!platCols.includes('plan_price_pro_cup')) db.exec("ALTER TABLE platform_config ADD COLUMN plan_price_pro_cup REAL DEFAULT 5000");
if (!platCols.includes('plan_price_studio_cup')) db.exec("ALTER TABLE platform_config ADD COLUMN plan_price_studio_cup REAL DEFAULT 15000");

const orderCols2 = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
if (!orderCols2.includes('producer_paid')) db.exec('ALTER TABLE orders ADD COLUMN producer_paid INTEGER DEFAULT 0');
if (!orderCols2.includes('payout_id')) db.exec('ALTER TABLE orders ADD COLUMN payout_id INTEGER');
if (!orderCols2.includes('approved_at')) db.exec("ALTER TABLE orders ADD COLUMN approved_at TEXT DEFAULT ''");
if (!orderCols2.includes('buyer_token')) db.exec("ALTER TABLE orders ADD COLUMN buyer_token TEXT DEFAULT ''");
db.exec("CREATE INDEX IF NOT EXISTS idx_orders_buyer_token ON orders(buyer_token)");

// ---- Planes en USD, retiros, bonos y referidos ----
const platCols2 = db.prepare("PRAGMA table_info(platform_config)").all().map(c => c.name);
const addPlat = (col, def) => { if (!platCols2.includes(col)) db.exec(`ALTER TABLE platform_config ADD COLUMN ${col} ${def}`); };
addPlat('plan_price_pro_usd', 'REAL DEFAULT 5');
addPlat('plan_price_studio_usd', 'REAL DEFAULT 19');
addPlat('payout_rates_json', "TEXT DEFAULT '{}'");
addPlat('likes_per_bonus', 'INTEGER DEFAULT 1000');
addPlat('likes_bonus_cup', 'REAL DEFAULT 2000');
addPlat('referrals_per_bonus', 'INTEGER DEFAULT 10');
addPlat('referral_bonus_cup', 'REAL DEFAULT 200');

const producerCols2 = db.prepare("PRAGMA table_info(producers)").all().map(c => c.name);
if (!producerCols2.includes('referral_code')) db.exec("ALTER TABLE producers ADD COLUMN referral_code TEXT DEFAULT ''");
if (!producerCols2.includes('referred_by')) db.exec('ALTER TABLE producers ADD COLUMN referred_by INTEGER');
if (!producerCols2.includes('referral_units_credited')) db.exec('ALTER TABLE producers ADD COLUMN referral_units_credited INTEGER DEFAULT 0');

const trackCols3 = db.prepare("PRAGMA table_info(tracks)").all().map(c => c.name);
if (!trackCols3.includes('bonus_units_credited')) db.exec('ALTER TABLE tracks ADD COLUMN bonus_units_credited INTEGER DEFAULT 0');

const orderCols3 = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
if (!orderCols3.includes('withdrawal_id')) db.exec('ALTER TABLE orders ADD COLUMN withdrawal_id INTEGER');

db.exec(`
  CREATE TABLE IF NOT EXISTS track_likes (
    track_id INTEGER NOT NULL,
    voter TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (track_id, voter)
  );

  CREATE TABLE IF NOT EXISTS producer_credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producer_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    amount_cup REAL NOT NULL DEFAULT 0,
    detail TEXT DEFAULT '',
    withdrawal_id INTEGER,
    paid INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS producer_withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producer_id INTEGER NOT NULL,
    producer_name TEXT DEFAULT '',
    amount_cup REAL NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'CUP',
    currency_label TEXT DEFAULT 'CUP',
    rate_cup_per_unit REAL DEFAULT 1,
    fee_units REAL DEFAULT 0,
    amount_units REAL DEFAULT 0,
    net_units REAL DEFAULT 0,
    account_text TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    note TEXT DEFAULT '',
    due_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT DEFAULT ''
  );
`);

// ---- Auditoría: subidas por partes, entregas completas, rechazos, VIP e índices ----
const trackCols4 = db.prepare("PRAGMA table_info(tracks)").all().map(c => c.name);
if (!trackCols4.includes('mp3_filename')) db.exec("ALTER TABLE tracks ADD COLUMN mp3_filename TEXT DEFAULT ''");
if (!trackCols4.includes('wav_hash')) db.exec("ALTER TABLE tracks ADD COLUMN wav_hash TEXT DEFAULT ''");
if (!trackCols4.includes('stems_hash')) db.exec("ALTER TABLE tracks ADD COLUMN stems_hash TEXT DEFAULT ''");
if (!trackCols4.includes('mp3_hash')) db.exec("ALTER TABLE tracks ADD COLUMN mp3_hash TEXT DEFAULT ''");

const orderCols4 = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
if (!orderCols4.includes('reject_reason')) db.exec("ALTER TABLE orders ADD COLUMN reject_reason TEXT DEFAULT ''");
if (!orderCols4.includes('rejected_at')) db.exec("ALTER TABLE orders ADD COLUMN rejected_at TEXT DEFAULT ''");
if (!orderCols4.includes('vip_public')) db.exec('ALTER TABLE orders ADD COLUMN vip_public INTEGER DEFAULT 0');

// Billetera por moneda: lo que pagó el comprador en su moneda y lo que le toca al productor en esa misma moneda.
const orderCols5 = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
if (!orderCols5.includes('wallet_currency')) {
  db.exec("ALTER TABLE orders ADD COLUMN wallet_currency TEXT DEFAULT ''");
  db.exec('ALTER TABLE orders ADD COLUMN paid_units REAL DEFAULT 0');
  db.exec('ALTER TABLE orders ADD COLUMN rate_at_sale REAL DEFAULT 1');
  db.exec('ALTER TABLE orders ADD COLUMN producer_earning_units REAL DEFAULT 0');
  // las compras de antes quedan en la billetera de CUP (así se venían pagando)
  db.exec("UPDATE orders SET wallet_currency = 'CUP', paid_units = price_cup_at_sale, rate_at_sale = 1, producer_earning_units = producer_earning_cup");
}
// Créditos y cargos en cualquier moneda (p. ej. un plan pagado con el saldo en USDT es un cargo negativo en USDT)
const credCols = db.prepare("PRAGMA table_info(producer_credits)").all().map(c => c.name);
if (!credCols.includes('currency')) {
  db.exec("ALTER TABLE producer_credits ADD COLUMN currency TEXT DEFAULT 'CUP'");
  db.exec('ALTER TABLE producer_credits ADD COLUMN amount_units REAL DEFAULT NULL');
}
const wCols = db.prepare("PRAGMA table_info(producer_withdrawals)").all().map(c => c.name);
if (!wCols.includes('wallet')) db.exec("ALTER TABLE producer_withdrawals ADD COLUMN wallet TEXT DEFAULT 'CUP'");
// Retiros por monto libre: cuánto se descuenta de la billetera (en su moneda)
const wCols2 = db.prepare("PRAGMA table_info(producer_withdrawals)").all().map(c => c.name);
if (!wCols2.includes('debit_units')) {
  db.exec('ALTER TABLE producer_withdrawals ADD COLUMN debit_units REAL DEFAULT NULL');
  db.exec("UPDATE producer_withdrawals SET debit_units = CASE WHEN COALESCE(wallet, 'CUP') = 'CUP' THEN amount_cup ELSE amount_units END");
}

// Entradas que el administrador o un productor borró de sus historiales.
// Solo se ocultan de esa lista: el saldo, las ventas y las licencias no cambian.
db.exec(`CREATE TABLE IF NOT EXISTS historial_oculto (
  lista TEXT NOT NULL,
  clave TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (lista, clave)
)`);

// Previews que se hicieron con la marca de agua (plan Free): si el productor sube de plan se rehacen sin ella.
const trackCols5 = db.prepare("PRAGMA table_info(tracks)").all().map(c => c.name);
if (!trackCols5.includes('preview_marca')) {
  db.exec('ALTER TABLE tracks ADD COLUMN preview_marca INTEGER DEFAULT 0');
  const wm = db.prepare('SELECT voice_filename FROM watermark_config WHERE id = 1').get();
  if (wm && wm.voice_filename) {
    db.exec("UPDATE tracks SET preview_marca = 1 WHERE producer_id IN (SELECT id FROM producers WHERE COALESCE(plan, 'free') = 'free')");
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS app_secrets (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    kind TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    ext TEXT NOT NULL,
    size INTEGER NOT NULL,
    received INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_orders_track ON orders(track_id);
  CREATE INDEX IF NOT EXISTS idx_orders_producer ON orders(producer_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_withdrawal ON orders(withdrawal_id);
  CREATE INDEX IF NOT EXISTS idx_tracks_producer ON tracks(producer_id);
  CREATE INDEX IF NOT EXISTS idx_tracks_status ON tracks(approval_status);
  CREATE INDEX IF NOT EXISTS idx_producers_ref ON producers(referred_by);
  CREATE INDEX IF NOT EXISTS idx_credits_producer ON producer_credits(producer_id);
  CREATE INDEX IF NOT EXISTS idx_uploads_owner ON uploads(owner);
`);

// Código de referido para los productores que se registraron antes de existir el sistema de referidos
db.exec("UPDATE producers SET referral_code = upper(substr(hex(randomblob(4)), 1, 7)) WHERE referral_code IS NULL OR referral_code = ''");

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
    { code: 'USD', label: 'USD', cupPerUnit: 0 },
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
