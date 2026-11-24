// Shared helpers for filling in doll details: generation guesses, typical retail
// prices (MSRP estimates), and turning a Mattel Creations product into doll fields.
const vocab = require('./vocab.json');

const COLLECTOR_RE = /skullector|haunt couture|collector|signature|comic[- ]?con|sdcc|reproduction|universal monsters|wednesday|buffy/i;

function guessGeneration({ series, name, year }) {
  const s = `${series || ''} ${name || ''}`;
  if (COLLECTOR_RE.test(s)) return 'Collector';
  if (!year) return null;
  if (year <= 2015) return 'G1';
  if (year <= 2019) return 'G2';
  if (year >= 2022) return 'G3';
  return null;
}

// Typical US retail price for a kind of release, used when the real MSRP isn't known.
// Always stored with msrpEstimated = true so the app can label it as an estimate.
const PLAYSET_RE = /\b(playset|play set|studio|roadster|lounge|oasis|pool|bedroom|classroom|café|cafe|locker|vanity|room|salon|spa|carriage|car|bus|shop|boutique|house|deadluxe|ballroom|kitchen|theater|theatre)\b/i;

function estimateMsrp(item) {
  if (!item || item.kind === 'other') return null; // accessories, figures, etc. vary too much
  const name = `${item.series || ''} ${item.name || ''}`;
  const flags = item.flags || [];
  const year = item.year || 0;
  const g3 = year >= 2022;
  const pack = /(\d)-pack/i.exec(name);
  const count = pack ? +pack[1] : /&/.test(item.name || '') && !PLAYSET_RE.test(item.name) ? 2 : 1;

  if (COLLECTOR_RE.test(name)) {
    if (/reproduction/i.test(name)) return count > 1 ? 30 * count : 30;
    return count > 1 ? 90 : 50;
  }
  if (PLAYSET_RE.test(item.name || '')) return g3 ? 49.99 : 39.99;
  if (flags.includes('F')) return g3 ? 14.99 : 12.99;
  if (flags.includes('B')) return g3 ? 14.99 : 9.99;
  if (count >= 3) return g3 ? 69.99 : 49.99;
  if (count === 2) return g3 ? 49.99 : 34.99;
  if (g3) return 24.99;
  if (year >= 2016) return 16.99;
  return 19.99;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 1 && !['monster', 'high', 'doll', 'dolls', 'the', 'and', 'x'].includes(w)));

// Finds the MHcollector catalog entry that best matches a Mattel title, if any.
function matchCatalog(title, catalogItems) {
  const t = tokens(title);
  let best = null;
  let bestScore = 0;
  // Words that mark a different release of the same doll: both sides must agree on them.
  const markers = ['reproduction', 'reissue'].filter((w) => t.has(w));
  for (const item of catalogItems || []) {
    if (item.kind !== 'doll') continue;
    const c = tokens(`${item.series} ${item.name}`);
    if (markers.some((w) => !c.has(w))) continue;
    if (!c.size) continue;
    let shared = 0;
    for (const w of c) if (t.has(w)) shared++;
    const score = shared / Math.max(c.size, t.size);
    if (score > bestScore) { best = item; bestScore = score; }
  }
  return bestScore >= 0.75 ? best : null;
}

// Mattel Creations product JSON -> doll fields.
function fromMattelProduct(product, { launchAt, catalogItems } = {}) {
  const title = product.title || '';
  const variant = (product.variants || [])[0] || {};
  const price = parseFloat(variant.price);
  // The collection feed gives tags as a list; the single-product endpoint as "a, b, c".
  const tags = Array.isArray(product.tags) ? product.tags : String(product.tags || '').split(',').map((t) => t.trim());
  const tagYear = tags.find((t) => /^20\d\d$/.test(t));
  const year = tagYear ? +tagYear : launchAt ? new Date(launchAt).getFullYear() : product.published_at ? new Date(product.published_at).getFullYear() : null;

  const out = {
    modelNumber: variant.sku || null,
    msrp: Number.isFinite(price) ? price : null,
    msrpEstimated: false,
    year,
  };

  const lowered = norm(title);
  const line = [...vocab.lines].sort((a, b) => b.length - a.length).find((l) => lowered.includes(norm(l))) || null;
  const character = vocab.characters.find((c) => lowered.includes(norm(c))) || null;

  // What's left after removing the brand, line and generic words, e.g. "Krampus".
  let rest = title.replace(/^monster high\s+(x\s+)?/i, '');
  if (line) rest = rest.replace(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '');
  rest = rest.replace(/\b(series|dolls?|set|2-pack|3-pack|figure|collectible|reproduction)\b/gi, '').replace(/\s+/g, ' ').trim();

  out.line = line === 'Reproduction' && /dawn of the dance/i.test(title) ? 'Dawn of the Dance' : line;
  out.character = character || (rest && rest.split(' ').length <= 3 ? rest : null);
  out.dollName = title.replace(/^monster high\s+/i, '').replace(/\s+doll$/i, '');
  out.generation = guessGeneration({ series: line, name: title, year }) || (tags.includes('MC_Exclusive') ? 'Collector' : null);

  // If MHcollector already lists this release, its series/name/year win, and it gets linked.
  const match = matchCatalog(title, catalogItems);
  if (match) {
    out.character = match.character || vocab.characters.find((c) => norm(match.name).includes(norm(c))) || out.character;
    out.dollName = match.name !== out.character ? match.name : null;
    out.line = match.series || out.line;
    out.year = match.year || out.year;
    out.catalogUrl = match.url;
    out.generation = guessGeneration({ series: match.series, name: match.name, year: out.year }) || out.generation;
  }
  return out;
}

module.exports = { guessGeneration, estimateMsrp, matchCatalog, fromMattelProduct };
