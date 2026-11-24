import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { CONDITIONS, GENERATIONS, displayName, fmtMoney } from './constants.js';
import DollCard from './components/DollCard.jsx';
import DollEditor from './components/DollEditor.jsx';
import ComingSoon from './components/ComingSoon.jsx';
import Catalog from './components/Catalog.jsx';
import Updates from './components/Updates.jsx';
import ValueCheck from './components/ValueCheck.jsx';
import Skull from './components/Skull.jsx';

const STALE_MS = 3 * 60 * 60 * 1000; // re-check Mattel Creations after 3 hours

const SORTS = {
  recent: { label: 'Recently added', fn: (a, b) => b.id - a.id },
  name: { label: 'Name A–Z', fn: (a, b) => displayName(a).localeCompare(displayName(b)) },
  year: { label: 'Year (oldest first)', fn: (a, b) => (a.year || 9999) - (b.year || 9999) },
  value: { label: 'Value (highest first)', fn: (a, b) => (b.estValue ?? b.pricePaid ?? b.targetPrice ?? -1) - (a.estValue ?? a.pricePaid ?? a.targetPrice ?? -1) },
};

export default function App() {
  const [dolls, setDolls] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('owned');
  const [query, setQuery] = useState('');
  const [generation, setGeneration] = useState('');
  const [condition, setCondition] = useState('');
  const [sort, setSort] = useState('recent');
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  // The catalog stays mounted once opened, so its filters survive switching tabs.
  const [catalogSeen, setCatalogSeen] = useState(false);
  const [valueCheck, setValueCheck] = useState(false);
  useEffect(() => { if (tab === 'catalog') setCatalogSeen(true); }, [tab]);

  const [releases, setReleases] = useState(null);
  const [checking, setChecking] = useState(false);
  const [releaseError, setReleaseError] = useState('');

  const notify = useCallback((text, isError = false) => {
    setToast({ text, isError, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const load = () => api.listDolls().then((list) => { setDolls(list); setLoaded(true); });
    load();
    // The desktop side may fill in details for older entries after launch.
    return api.onDollsChanged(load);
  }, []);

  const checkReleases = useCallback(async () => {
    setChecking(true);
    setReleaseError('');
    try {
      setReleases(await api.checkReleases());
    } catch (err) {
      setReleaseError(`Couldn’t reach Mattel Creations: ${err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`);
    } finally {
      setChecking(false);
    }
  }, []);

  // Show the last known drops immediately, then refresh in the background if they're old.
  useEffect(() => {
    api.cachedReleases().then((cached) => {
      if (cached) setReleases(cached);
      if (!cached || Date.now() - Date.parse(cached.checkedAt) > STALE_MS) checkReleases();
    });
  }, [checkReleases]);

  // Desktop notification when a drop goes live while the app is open.
  const notified = useRef(new Set());
  useEffect(() => {
    if (!releases) return;
    const tick = () => {
      const now = Date.now();
      for (const item of releases.upcoming) {
        if (!item.launchAt || notified.current.has(item.id)) continue;
        const t = Date.parse(item.launchAt);
        if (t <= now && now - t < 10 * 60 * 1000) {
          notified.current.add(item.id);
          const n = new Notification('A Monster High drop is live!', { body: item.title });
          n.onclick = () => window.open(item.url, '_blank');
        }
      }
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [releases]);

  const upsert = useCallback((doll) => {
    setDolls((list) => (list.some((d) => d.id === doll.id) ? list.map((d) => (d.id === doll.id ? doll : d)) : [doll, ...list]));
  }, []);

  const wishlistRelease = async (item) => {
    try {
      const doll = await api.wishlistRelease(item);
      upsert(doll);
      notify(`Added “${item.title}” to your wishlist.`);
    } catch (err) {
      notify(err.message, true);
    }
  };

  const wishlistedUrls = useMemo(() => {
    const urls = new Set();
    for (const d of dolls) for (const m of (d.notes || '').matchAll(/https:\/\/creations\.mattel\.com\/products\/[^\s]+/g)) urls.add(m[0]);
    return urls;
  }, [dolls]);

  const owned = useMemo(() => dolls.filter((d) => d.status === 'owned'), [dolls]);
  const wanted = useMemo(() => dolls.filter((d) => d.status === 'wanted'), [dolls]);

  const stats = useMemo(() => {
    const sum = (list, key) => list.reduce((t, d) => t + (d[key] ?? 0), 0);
    const paid = sum(owned, 'pricePaid');
    const value = owned.reduce((t, d) => t + (d.estValue ?? d.pricePaid ?? 0), 0);
    return { paid, value, gain: value - paid, wishTotal: sum(wanted, 'targetPrice'), boxed: owned.filter((d) => d.condition === 'NRFB' || d.condition === 'NIB').length };
  }, [owned, wanted]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tab === 'wanted' ? wanted : owned)
      .filter((d) => !generation || d.generation === generation)
      .filter((d) => tab === 'wanted' || !condition || d.condition === condition)
      .filter((d) => !q || [d.character, d.dollName, d.line, d.modelNumber, d.notes, d.year].some((v) => String(v ?? '').toLowerCase().includes(q)))
      .sort(SORTS[sort].fn);
  }, [tab, owned, wanted, query, generation, condition, sort]);

  const upcomingCount = releases ? releases.upcoming.filter((i) => !i.launchAt || Date.parse(i.launchAt) > Date.now()).length : 0;
  const filtersOn = query || generation || condition;

  const exportCsv = async () => {
    try {
      const file = await api.exportCsv();
      if (file) notify(`Exported to ${file}`);
    } catch (err) {
      notify(err.message, true);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Skull className="logo" />
          <h1>My Ghoulection</h1>
        </div>
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'owned'} className={tab === 'owned' ? 'on' : ''} onClick={() => setTab('owned')}>
            Collection <span className="count">{owned.length}</span>
          </button>
          <button role="tab" aria-selected={tab === 'wanted'} className={tab === 'wanted' ? 'on' : ''} onClick={() => setTab('wanted')}>
            Wishlist <span className="count">{wanted.length}</span>
          </button>
          <button role="tab" aria-selected={tab === 'catalog'} className={tab === 'catalog' ? 'on' : ''} onClick={() => setTab('catalog')}>
            Catalog
          </button>
          <button role="tab" aria-selected={tab === 'drops'} className={tab === 'drops' ? 'on' : ''} onClick={() => setTab('drops')}>
            Coming Soon {upcomingCount > 0 && <span className="count hot">{upcomingCount}</span>}
          </button>
        </nav>
        <div className="row">
          <Updates />
          <button className="btn ghost small" onClick={exportCsv} title="Save your collection as a spreadsheet">Export</button>
          {api.canOpenDataFolder && (
            <button className="btn ghost small" onClick={() => api.openDataFolder()} title="Open the folder with your database and photos (for backups)">
              Data folder
            </button>
          )}
        </div>
      </header>

      {catalogSeen && (
        <main className="content" hidden={tab !== 'catalog'}>
          <Catalog dolls={dolls} onAdded={upsert} onOpenDoll={setEditing} notify={notify} />
        </main>
      )}

      {tab === 'catalog' ? null : tab === 'drops' ? (
        <main className="content">
          <ComingSoon data={releases} checking={checking} error={releaseError} onCheck={checkReleases} onWishlist={wishlistRelease} wishlistedUrls={wishlistedUrls} />
        </main>
      ) : (
        <main className="content">
          <section className="stats">
            {tab === 'owned' ? (
              <>
                <Stat label="Ghouls" value={owned.length} />
                <Stat label="Boxed (NRFB / NIB)" value={stats.boxed} />
                <Stat label="Total paid" value={fmtMoney(stats.paid)} />
                <Stat label="Estimated value" value={fmtMoney(stats.value)} accent onClick={() => setValueCheck(true)} hint="Check eBay sold prices ›" />
                <Stat label={stats.gain >= 0 ? 'Value gained' : 'Value lost'} value={fmtMoney(Math.abs(stats.gain))} tone={stats.gain >= 0 ? 'up' : 'down'} />
              </>
            ) : (
              <>
                <Stat label="Still hunting" value={wanted.length} />
                <Stat label="High priority" value={wanted.filter((d) => d.priority === 'High').length} />
                <Stat label="Wishlist budget" value={fmtMoney(stats.wishTotal)} accent />
              </>
            )}
          </section>

          <section className="toolbar">
            <input className="search" type="search" placeholder="Search by name, line, SKU, notes…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select value={generation} onChange={(e) => setGeneration(e.target.value)} aria-label="Generation">
              <option value="">All generations</option>
              {GENERATIONS.map((g) => <option key={g}>{g}</option>)}
            </select>
            {tab === 'owned' && (
              <select value={condition} onChange={(e) => setCondition(e.target.value)} aria-label="Condition">
                <option value="">Any condition</option>
                {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
              </select>
            )}
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
            <button className="btn primary" onClick={() => setEditing({ status: tab })}>
              + {tab === 'wanted' ? 'Add to wishlist' : 'Add a ghoul'}
            </button>
          </section>

          {loaded && visible.length === 0 ? (
            <div className="empty">
              <Skull className="big" />
              {filtersOn ? (
                <>
                  <h2>No ghouls match</h2>
                  <button className="btn ghost" onClick={() => { setQuery(''); setGeneration(''); setCondition(''); }}>Clear filters</button>
                </>
              ) : tab === 'wanted' ? (
                <>
                  <h2>Your wishlist is empty</h2>
                  <p className="muted">Add dolls you&rsquo;re hunting for, or check Coming Soon for new drops.</p>
                </>
              ) : (
                <>
                  <h2>Your crypt is empty</h2>
                  <p className="muted">Pick your dolls from the catalog of every Monster High release, or add one by hand.</p>
                  <div className="row">
                    <button className="btn primary" onClick={() => setTab('catalog')}>Browse the catalog</button>
                    <button className="btn ghost" onClick={() => setEditing({ status: 'owned' })}>+ Add by hand</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="doll-grid">
              {visible.map((d) => <DollCard key={d.id} doll={d} onOpen={setEditing} />)}
            </div>
          )}
        </main>
      )}

      {editing && (
        <DollEditor
          key={editing.id ?? 'new'}
          doll={editing}
          latest={editing.id ? dolls.find((d) => d.id === editing.id) : undefined}
          onClose={() => setEditing(null)}
          onChanged={upsert}
          onDeleted={(id) => setDolls((list) => list.filter((d) => d.id !== id))}
          notify={notify}
        />
      )}

      {valueCheck && (
        <ValueCheck
          dolls={owned}
          onClose={() => setValueCheck(false)}
          onSaved={upsert}
          onOpenDoll={(d) => { setValueCheck(false); setEditing(d); }}
        />
      )}

      {toast && <div key={toast.key} className={`toast ${toast.isError ? 'error' : ''}`} role="status">{toast.text}</div>}
    </div>
  );
}

function Stat({ label, value, accent, tone, onClick, hint }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`stat ${accent ? 'accent' : ''} ${tone || ''} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
      {hint && <span className="stat__hint">{hint}</span>}
    </Tag>
  );
}
