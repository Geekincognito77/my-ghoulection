// Local storage for My Ghoulection: a SQLite database plus a photos folder.
// Everything here runs in Electron's main process. A future web version would
// replace this file with a server that exposes the same operations.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);

// [field name used by the UI, column name, kind]
const FIELDS = [
  ['status', 'status', 'text'],
  ['character', 'character', 'text'],
  ['dollName', 'doll_name', 'text'],
  ['line', 'line', 'text'],
  ['year', 'year', 'int'],
  ['generation', 'generation', 'text'],
  ['modelNumber', 'model_number', 'text'],
  ['condition', 'condition', 'text'],
  ['extras', 'extras', 'json'],
  ['notes', 'notes', 'text'],
  ['pricePaid', 'price_paid', 'num'],
  ['purchasedFrom', 'purchased_from', 'text'],
  ['purchaseDate', 'purchase_date', 'text'],
  ['estValue', 'est_value', 'num'],
  ['targetPrice', 'target_price', 'num'],
  ['priority', 'priority', 'text'],
  ['catalogUrl', 'catalog_url', 'text'], // link to the MHcollector catalog entry, if added from there
  ['msrp', 'msrp', 'num'], // original retail price
  ['msrpEstimated', 'msrp_estimated', 'bool'], // true when msrp is a typical price, not the real one
  ['valueCheckedAt', 'value_checked_at', 'text'], // when the estimated value was last checked
];

const SQL_TYPES = { text: 'TEXT', int: 'INTEGER', num: 'REAL', json: "TEXT NOT NULL DEFAULT '[]'", bool: 'INTEGER NOT NULL DEFAULT 0' };

function toDb(kind, value) {
  if (kind === 'json') return JSON.stringify(Array.isArray(value) ? value : []);
  if (kind === 'bool') return value ? 1 : 0;
  if (value === undefined || value === null || value === '') return null;
  if (kind === 'int') {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (kind === 'num') {
    const n = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return String(value).trim() || null;
}

function openStore(dataDir) {
  const photosDir = path.join(dataDir, 'photos');
  fs.mkdirSync(photosDir, { recursive: true });

  const db = new DatabaseSync(path.join(dataDir, 'ghoulection.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS dolls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'owned',
      character TEXT, doll_name TEXT, line TEXT, year INTEGER,
      generation TEXT, model_number TEXT, condition TEXT,
      extras TEXT NOT NULL DEFAULT '[]', notes TEXT,
      price_paid REAL, purchased_from TEXT, purchase_date TEXT,
      est_value REAL, target_price REAL, priority TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doll_id INTEGER NOT NULL REFERENCES dolls(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS photos_doll ON photos(doll_id, sort);
  `);
  // Upgrades for databases made by earlier versions.
  const dollCols = new Set(db.prepare('PRAGMA table_info(dolls)').all().map((c) => c.name));
  for (const [, col, kind] of FIELDS) {
    if (!dollCols.has(col)) db.exec(`ALTER TABLE dolls ADD COLUMN ${col} ${SQL_TYPES[kind]}`);
  }

  function rowToDoll(row, photos) {
    const doll = { id: row.id, createdAt: row.created_at, updatedAt: row.updated_at };
    for (const [field, col, kind] of FIELDS) {
      doll[field] = kind === 'json' ? safeJson(row[col]) : kind === 'bool' ? !!row[col] : row[col];
    }
    doll.photos = photos;
    return doll;
  }

  function photosFor(dollId) {
    return db
      .prepare('SELECT id, filename FROM photos WHERE doll_id = ? ORDER BY sort, id')
      .all(dollId)
      .map((p) => ({ id: p.id, filename: p.filename }));
  }

  function get(id) {
    const row = db.prepare('SELECT * FROM dolls WHERE id = ?').get(id);
    return row ? rowToDoll(row, photosFor(id)) : null;
  }

  function list() {
    const byDoll = new Map();
    for (const p of db.prepare('SELECT id, doll_id, filename FROM photos ORDER BY sort, id').all()) {
      if (!byDoll.has(p.doll_id)) byDoll.set(p.doll_id, []);
      byDoll.get(p.doll_id).push({ id: p.id, filename: p.filename });
    }
    return db
      .prepare('SELECT * FROM dolls ORDER BY id DESC')
      .all()
      .map((row) => rowToDoll(row, byDoll.get(row.id) || []));
  }

  function save(input) {
    const values = FIELDS.map(([field, , kind]) => toDb(kind, input[field]));
    const statusIdx = FIELDS.findIndex(([f]) => f === 'status');
    if (values[statusIdx] !== 'wanted') values[statusIdx] = 'owned';

    if (input.id) {
      const sets = FIELDS.map(([, col]) => `${col} = ?`).join(', ');
      db.prepare(`UPDATE dolls SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...values, input.id);
      return get(input.id);
    }
    const cols = FIELDS.map(([, col]) => col).join(', ');
    const marks = FIELDS.map(() => '?').join(', ');
    const res = db.prepare(`INSERT INTO dolls (${cols}) VALUES (${marks})`).run(...values);
    return get(Number(res.lastInsertRowid));
  }

  function remove(id) {
    const files = db.prepare('SELECT filename FROM photos WHERE doll_id = ?').all(id);
    db.prepare('DELETE FROM dolls WHERE id = ?').run(id);
    for (const f of files) unlinkQuiet(path.join(photosDir, f.filename));
    return true;
  }

  function addPhotos(dollId, filePaths) {
    if (!get(dollId)) throw new Error('That doll no longer exists.');
    const { maxSort } = db.prepare('SELECT COALESCE(MAX(sort), -1) AS maxSort FROM photos WHERE doll_id = ?').get(dollId);
    let sort = maxSort + 1;
    const insert = db.prepare('INSERT INTO photos (doll_id, filename, sort) VALUES (?, ?, ?)');
    for (const src of filePaths) {
      const ext = path.extname(src).toLowerCase();
      if (!IMAGE_EXTS.has(ext) || !fs.existsSync(src)) continue;
      const filename = `${dollId}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      fs.copyFileSync(src, path.join(photosDir, filename));
      insert.run(dollId, filename, sort++);
    }
    return get(dollId);
  }

  function removePhoto(photoId) {
    const p = db.prepare('SELECT doll_id, filename FROM photos WHERE id = ?').get(photoId);
    if (!p) return null;
    db.prepare('DELETE FROM photos WHERE id = ?').run(photoId);
    unlinkQuiet(path.join(photosDir, p.filename));
    return get(p.doll_id);
  }

  function setCover(photoId) {
    const p = db.prepare('SELECT doll_id FROM photos WHERE id = ?').get(photoId);
    if (!p) return null;
    const { minSort } = db.prepare('SELECT MIN(sort) AS minSort FROM photos WHERE doll_id = ?').get(p.doll_id);
    db.prepare('UPDATE photos SET sort = ? WHERE id = ?').run(minSort - 1, photoId);
    return get(p.doll_id);
  }

  function photoPath(filename) {
    return path.join(photosDir, path.basename(filename));
  }

  function toCsv() {
    const headers = ['id', ...FIELDS.map(([f]) => f), 'photoCount', 'createdAt'];
    const lines = [headers.join(',')];
    for (const d of list()) {
      const cells = [d.id, ...FIELDS.map(([f]) => (Array.isArray(d[f]) ? d[f].join('; ') : d[f])), d.photos.length, d.createdAt];
      lines.push(cells.map(csvCell).join(','));
    }
    return '﻿' + lines.join('\r\n');
  }

  return { db, dataDir, photosDir, list, get, save, remove, addPhotos, removePhoto, setCover, photoPath, toCsv };
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function safeJson(text) {
  try {
    const v = JSON.parse(text || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function unlinkQuiet(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    /* already gone */
  }
}

module.exports = { openStore };
