// Checks Mattel Creations for upcoming Monster High drops.
// The store's public product feed lists every Monster High product; for items that
// aren't buyable yet we read the product page, which carries the launch time in a
// `data-coming-soon-date` attribute (the same value that drives the site's own countdown).
const { net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SITE = 'https://creations.mattel.com';
const FEED = `${SITE}/collections/monster-high/products.json?limit=250`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MyGhoulection/0.1';
const RECENT_DAYS = 30; // how far back "just dropped" looks
const CANDIDATE_DAYS = 150; // only unavailable products published this recently get a page check

const TZ = { PST: -8, PDT: -7, MST: -7, MDT: -6, CST: -6, CDT: -5, EST: -5, EDT: -4, UTC: 0, GMT: 0 };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// "November 12 2026, 09:00:30 PST" -> Date
function parseLaunch(text) {
  const m = /([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\s*([A-Z]{2,4})?/i.exec(text || '');
  if (!m) return null;
  const month = MONTHS.findIndex((name) => name.startsWith(m[1].toLowerCase().slice(0, 3)));
  if (month < 0) return null;
  let hour = parseInt(m[4], 10);
  const ampm = (m[7] || '').toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  const offset = TZ[(m[8] || 'PST').toUpperCase()] ?? -8; // Mattel posts drop times in Pacific time
  const utc = Date.UTC(+m[3], month, +m[2], hour - offset, +m[5], +(m[6] || 0));
  return new Date(utc);
}

async function getText(url) {
  const res = await net.fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json' } });
  if (!res.ok) throw new Error(`Mattel Creations answered ${res.status}`);
  return res.text();
}

async function fetchAllProducts() {
  const all = [];
  for (let page = 1; page <= 4; page++) {
    const json = JSON.parse(await getText(`${FEED}&page=${page}`));
    const batch = json.products || [];
    all.push(...batch);
    if (batch.length < 250) break;
  }
  return all;
}

function isMerch(p) {
  // Print-on-demand shirts, mugs and so on: not dolls, never "drops".
  return p.tags.some((t) => /^(POD|Printful|DropShip: Printful)$/i.test(t));
}

function summarize(p) {
  const prices = p.variants.map((v) => parseFloat(v.price)).filter(Number.isFinite);
  const category = (p.tags.find((t) => t.startsWith('Category: ')) || '').replace('Category: ', '');
  return {
    id: p.id,
    title: p.title,
    url: `${SITE}/products/${p.handle}`,
    image: p.images?.[0]?.src || null,
    price: prices.length ? Math.min(...prices) : null,
    category,
    publishedAt: p.published_at,
    available: p.variants.some((v) => v.available),
  };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch (err) {
        out[i] = { error: err.message };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

async function checkReleases() {
  const now = Date.now();
  const products = (await fetchAllProducts()).filter((p) => !isMerch(p));
  const ageDays = (p) => (now - Date.parse(p.published_at)) / 86400000;

  const candidates = products.filter((p) => !p.variants.some((v) => v.available) && ageDays(p) <= CANDIDATE_DAYS);
  const pages = await mapLimit(candidates, 4, async (p) => {
    const html = await getText(`${SITE}/products/${p.handle}`);
    const comingSoon = /data-coming-soon="true"/.test(html) || /isComingSoon:\s*1/.test(html);
    const raw = (/data-coming-soon-date="([^"]+)"/.exec(html) || /expiry:\s*"([^"]+)"/.exec(html) || [])[1];
    return { comingSoon, launch: parseLaunch(raw) };
  });

  const upcoming = [];
  const dropped = [];
  candidates.forEach((p, i) => {
    const info = pages[i] || {};
    const item = summarize(p);
    if (info.launch && info.launch.getTime() > now) {
      upcoming.push({ ...item, launchAt: info.launch.toISOString() });
    } else if (info.comingSoon && !info.launch) {
      upcoming.push({ ...item, launchAt: null });
    } else if (info.launch && now - info.launch.getTime() <= RECENT_DAYS * 86400000) {
      dropped.push({ ...item, launchAt: info.launch.toISOString(), soldOut: true });
    }
  });

  // Recently published and buyable right now.
  for (const p of products) {
    if (p.variants.some((v) => v.available) && ageDays(p) <= RECENT_DAYS) {
      dropped.push({ ...summarize(p), launchAt: p.published_at, soldOut: false });
    }
  }

  upcoming.sort((a, b) => (a.launchAt ? Date.parse(a.launchAt) : Infinity) - (b.launchAt ? Date.parse(b.launchAt) : Infinity));
  dropped.sort((a, b) => Date.parse(b.launchAt) - Date.parse(a.launchAt));

  return { checkedAt: new Date(now).toISOString(), upcoming, dropped, failedPages: pages.filter((x) => x && x.error).length };
}

function createReleaseService(dataDir) {
  const cacheFile = path.join(dataDir, 'releases-cache.json');
  return {
    cached() {
      try {
        return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      } catch {
        return null;
      }
    },
    async check() {
      const result = await checkReleases();
      fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2));
      return result;
    },
    // Full product data for one Mattel Creations product page URL.
    async fetchProduct(url) {
      const m = /^https:\/\/creations\.mattel\.com\/products\/([a-z0-9-]+)/i.exec(url || '');
      if (!m) return null;
      return JSON.parse(await getText(`${SITE}/products/${m[1]}.json`)).product || null;
    },
    async downloadImage(url, destDir, fetcher = net.fetch) {
      if (!url || !/^https:\/\/([a-z0-9-]+\.)*(shopify\.com|mattel\.com|mhcollector\.com)\//i.test(url)) return null;
      const res = await fetcher(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) return null;
      const ext = (path.extname(new URL(url).pathname) || '.jpg').toLowerCase();
      const file = path.join(destDir, `mattel-${Date.now()}${ext}`);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return file;
    },
  };
}

module.exports = { createReleaseService, parseLaunch };
