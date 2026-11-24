// The doll catalog, sourced from MHcollector.com.
//
// - The full list (every doll, fashion pack, playset and figure, by series) comes from
//   the site's Checklist page in ONE request, and is stored in the local database.
// - Full details for a single item (photo, model number, character, description) are
//   fetched only when you open or add that item, then cached.
// - The site's robots.txt asks for 3 seconds between requests, so every request to
//   mhcollector.com goes through one queue that enforces that gap.
const { net } = require('electron');
const { guessGeneration, estimateMsrp } = require('./details.cjs');

const SITE = 'https://mhcollector.com';
const CHECKLIST = `${SITE}/checklist/`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MyGhoulection/0.1';
const CRAWL_DELAY_MS = 3000;

const FLAG_NAMES = { E: 'Exclusive', B: 'Budget', F: 'Fashion pack', R: 'Reissue' };

// ---------- polite fetching ----------
let lastRequest = 0;
let queue = Promise.resolve();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function politeFetch(url, init = {}) {
  const run = async () => {
    const wait = lastRequest + CRAWL_DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    return net.fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) } });
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

async function getHtml(url) {
  const res = await politeFetch(url);
  if (!res.ok) throw new Error(`MHcollector answered ${res.status}`);
  return res.text();
}

// ---------- parsing ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
const stripTags = (s) => decode(String(s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

function parseChecklist(html) {
  const start = html.indexOf('<div class="checklist">');
  if (start < 0) throw new Error('The MHcollector checklist page has changed and could not be read.');
  const body = html.slice(start);
  const items = [];
  const seen = new Set();
  let series = null;
  let kind = 'doll';
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>|<li[^>]*>([\s\S]*?)<\/li>|id="acc"/g;
  let m;
  while ((m = re.exec(body))) {
    if (m[0] === 'id="acc"') { kind = 'other'; continue; }
    if (m[1] !== undefined) { series = stripTags(m[1].replace(/<span[\s\S]*$/, '')); continue; }
    const link = /href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(m[2]);
    if (!link) continue;
    const url = link[1];
    if (!url.startsWith(`${SITE}/`) || url.includes('/category/') || seen.has(url)) continue;
    seen.add(url);
    const notes = [...m[2].matchAll(/(?:&#40;|\()\s*([^&()]+?)\s*(?:&#41;|\))/g)].map((x) => x[1]);
    const year = notes.find((n) => /^\d{4}$/.test(n));
    items.push({
      url,
      name: stripTags(link[2]),
      series,
      year: year ? +year : null,
      flags: notes.filter((n) => FLAG_NAMES[n]),
      kind,
    });
  }
  if (items.length < 100) throw new Error('The MHcollector checklist looked incomplete, so the catalog was not updated.');
  return items;
}

function parseDetails(html) {
  const out = {};
  const img = /<div class="content_image">\s*<img[^>]+src="([^"]+)"/.exec(html) || /<meta property="og:image" content="([^"]+)"/.exec(html);
  out.image = img ? img[1] : null;
  const stats = /<div class="stats[^"]*">([\s\S]*?)<\/div>/.exec(html);
  const text = stats ? stats[1].split(/<\/ul>/).map(stripTags) : [];
  const field = (label) => {
    const line = text.find((t) => t.toLowerCase().startsWith(label.toLowerCase() + ':'));
    return line ? line.slice(label.length + 1).trim() || null : null;
  };
  out.character = field('Character');
  out.gender = field('Gender');
  out.modelNumber = field('Model Number');
  const released = field('Released');
  out.released = released;
  const h1 = html.indexOf('<h1');
  const statsAt = html.indexOf('<div class="stats', h1);
  const between = h1 >= 0 && statsAt > h1 ? html.slice(h1, statsAt) : '';
  out.description = [...between.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((p) => stripTags(p[1])).filter(Boolean).join('\n\n') || null;
  return out;
}


function createCatalog(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS catalog (
      url TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      series TEXT,
      year INTEGER,
      flags TEXT NOT NULL DEFAULT '[]',
      kind TEXT NOT NULL DEFAULT 'doll',
      position INTEGER NOT NULL DEFAULT 0,
      character TEXT, gender TEXT, model_number TEXT, image TEXT, description TEXT,
      details_at TEXT
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `);

  const toItem = (r) => ({
    url: r.url, name: r.name, series: r.series, year: r.year, flags: JSON.parse(r.flags || '[]'), kind: r.kind,
    character: r.character, gender: r.gender, modelNumber: r.model_number, image: r.image, description: r.description,
    hasDetails: !!r.details_at,
  });

  function list() {
    const updatedAt = db.prepare("SELECT value FROM meta WHERE key = 'catalog_updated'").get()?.value || null;
    const items = db.prepare('SELECT * FROM catalog ORDER BY position').all().map(toItem);
    return { updatedAt, items, source: SITE };
  }

  async function refresh() {
    const items = parseChecklist(await getHtml(CHECKLIST));
    const upsert = db.prepare(`
      INSERT INTO catalog (url, name, series, year, flags, kind, position) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET name = excluded.name, series = excluded.series, year = excluded.year,
        flags = excluded.flags, kind = excluded.kind, position = excluded.position`);
    db.exec('BEGIN');
    try {
      items.forEach((it, i) => upsert.run(it.url, it.name, it.series, it.year, JSON.stringify(it.flags), it.kind, i));
      // Entries the site has since removed are dropped, unless they're already linked to a doll you own.
      const keep = new Set(items.map((i) => i.url));
      const linked = new Set(db.prepare('SELECT catalog_url FROM dolls WHERE catalog_url IS NOT NULL').all().map((r) => r.catalog_url));
      for (const { url } of db.prepare('SELECT url FROM catalog').all()) {
        if (!keep.has(url) && !linked.has(url)) db.prepare('DELETE FROM catalog WHERE url = ?').run(url);
      }
      db.prepare("INSERT INTO meta (key, value) VALUES ('catalog_updated', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return list();
  }

  async function details(url) {
    const row = db.prepare('SELECT * FROM catalog WHERE url = ?').get(url);
    if (!row) throw new Error('That item is not in the catalog.');
    if (row.details_at) return toItem(row);
    const d = parseDetails(await getHtml(url));
    db.prepare(`UPDATE catalog SET character = ?, gender = ?, model_number = ?, image = ?, description = ?, details_at = datetime('now') WHERE url = ?`)
      .run(d.character, d.gender, d.modelNumber, d.image, d.description, url);
    return toItem(db.prepare('SELECT * FROM catalog WHERE url = ?').get(url));
  }

  // Builds a new doll record from a catalog entry (photo handled by the caller).
  function dollFrom(item, status) {
    const character = item.character && !/,/.test(item.character) ? item.character : null;
    const descLine = item.flags.length ? `${item.flags.map((f) => FLAG_NAMES[f]).join(', ')}.` : '';
    const msrp = estimateMsrp(item);
    return {
      status,
      msrp,
      msrpEstimated: msrp != null,
      pricePaid: status === 'owned' ? msrp : null,
      character,
      dollName: item.name !== character ? item.name : null,
      line: item.series,
      year: item.year,
      generation: guessGeneration(item),
      modelNumber: item.modelNumber,
      extras: [],
      priority: status === 'wanted' ? 'Medium' : null,
      catalogUrl: item.url,
      notes: [descLine, `MHcollector: ${item.url}`].filter(Boolean).join('\n'),
    };
  }

  function find(url) {
    const row = db.prepare('SELECT * FROM catalog WHERE url = ?').get(url);
    return row ? toItem(row) : null;
  }

  return { list, find, refresh, details, dollFrom, politeFetch };
}

module.exports = { createCatalog, parseChecklist, parseDetails, FLAG_NAMES };
