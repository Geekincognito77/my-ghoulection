import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Skull from './Skull.jsx';

const FLAG_LABELS = { E: 'Exclusive', B: 'Budget', F: 'Fashion pack', R: 'Reissue' };

const cleanError = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

function ago(iso) {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (days < 1) return 'today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function StatusButtons({ item, doll, busy, onAdd, onOpenDoll, compact }) {
  if (busy) return <span className="muted adding">Adding&hellip;</span>;
  if (doll?.status === 'owned') {
    return <button className="btn ghost small owned" onClick={() => onOpenDoll(doll)} title="Open in your collection">&#10003; Owned</button>;
  }
  return (
    <div className="row">
      <button className="btn primary small" onClick={() => onAdd(item, 'owned')}>+ {compact ? 'Own it' : 'Add to collection'}</button>
      {doll?.status === 'wanted' ? (
        <button className="btn ghost small wished" onClick={() => onOpenDoll(doll)} title="Open on your wishlist">&#9829; Wishlist</button>
      ) : (
        <button className="btn ghost small" onClick={() => onAdd(item, 'wanted')} title="Add to wishlist">&#9825;</button>
      )}
    </div>
  );
}

function DetailModal({ item, doll, busy, onClose, onAdd, onOpenDoll }) {
  const [full, setFull] = useState(item.hasDetails ? item : null);
  const [error, setError] = useState('');
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (item.hasDetails) return;
    let live = true;
    api.catalogDetails(item.url).then((d) => live && setFull(d)).catch((e) => live && setError(cleanError(e)));
    return () => { live = false; };
  }, [item]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = full || item;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal catalog-detail" role="dialog" aria-label={shown.name}>
        <header className="editor__head">
          <h2>{shown.name}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">&times;</button>
        </header>
        <div className="catalog-detail__body">
          <div className="catalog-detail__img">
            {shown.image && !imgFailed ? <img src={shown.image} alt={shown.name} onError={() => setImgFailed(true)} /> : <Skull />}
            {!full && !error && <p className="muted">Loading details&hellip;</p>}
          </div>
          <div className="catalog-detail__info">
            <dl>
              {shown.character && <><dt>Character</dt><dd>{shown.character}</dd></>}
              <dt>Series</dt><dd>{shown.series}</dd>
              {shown.year && <><dt>Released</dt><dd>{shown.year}</dd></>}
              {shown.modelNumber && <><dt>Model number</dt><dd>{shown.modelNumber}</dd></>}
              {shown.flags.length > 0 && <><dt>Type</dt><dd>{shown.flags.map((f) => FLAG_LABELS[f]).join(', ')}</dd></>}
            </dl>
            {error && <p className="error-text">Couldn&rsquo;t load the full details: {error}</p>}
            {shown.description && shown.description.split('\n\n').map((p, i) => <p key={i} className="desc">{p}</p>)}
            <div className="row wrap">
              <StatusButtons item={shown} doll={doll} busy={busy} onAdd={onAdd} onOpenDoll={(d) => { onClose(); onOpenDoll(d); }} />
              <a className="btn ghost small" href={shown.url} target="_blank" rel="noreferrer">View on MHcollector &#8599;</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Catalog({ dolls, onAdded, onOpenDoll, notify }) {
  const [data, setData] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [series, setSeries] = useState('');
  const [kind, setKind] = useState('doll');
  const [flag, setFlag] = useState('');
  const [show, setShow] = useState('all');
  const [busy, setBusy] = useState(() => new Set());
  const [open, setOpen] = useState(null);

  const update = async () => {
    setUpdating(true);
    setError('');
    try {
      setData(await api.catalogRefresh());
    } catch (err) {
      setError(`Couldn’t update the catalog from MHcollector: ${cleanError(err)}`);
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    api.catalogList().then((d) => {
      setData(d);
      const stale = !d.updatedAt || Date.now() - Date.parse(d.updatedAt) > 7 * 86400000;
      if (!d.items.length || stale) update();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byUrl = useMemo(() => {
    const m = new Map();
    for (const d of dolls) if (d.catalogUrl) m.set(d.catalogUrl, d);
    return m;
  }, [dolls]);

  const items = data?.items || [];
  const seriesList = useMemo(() => [...new Set(items.filter((i) => kind === 'all' || i.kind === kind).map((i) => i.series))], [items, kind]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (kind !== 'all' && i.kind !== kind) return false;
      if (series && i.series !== series) return false;
      if (flag && !i.flags.includes(flag)) return false;
      const doll = byUrl.get(i.url);
      if (show === 'owned' && doll?.status !== 'owned') return false;
      if (show === 'missing' && doll?.status === 'owned') return false;
      if (show === 'wanted' && doll?.status !== 'wanted') return false;
      if (q && !`${i.name} ${i.series} ${i.year} ${i.character || ''} ${i.modelNumber || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, kind, series, flag, show, query, byUrl]);

  const groups = useMemo(() => {
    const g = new Map();
    for (const i of filtered) {
      if (!g.has(i.series)) g.set(i.series, []);
      g.get(i.series).push(i);
    }
    return [...g.entries()];
  }, [filtered]);

  const seriesTotals = useMemo(() => {
    const t = new Map();
    for (const i of items) {
      const cur = t.get(i.series) || { total: 0, owned: 0 };
      cur.total++;
      if (byUrl.get(i.url)?.status === 'owned') cur.owned++;
      t.set(i.series, cur);
    }
    return t;
  }, [items, byUrl]);

  const dollItems = items.filter((i) => i.kind === 'doll');
  const ownedDolls = dollItems.filter((i) => byUrl.get(i.url)?.status === 'owned').length;

  const add = async (item, status) => {
    setBusy((s) => new Set(s).add(item.url));
    try {
      const doll = await api.catalogAdd(item.url, status);
      onAdded(doll);
      notify(`${item.name} was added to your ${status === 'wanted' ? 'wishlist' : 'collection'}.`);
    } catch (err) {
      notify(cleanError(err), true);
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(item.url); return n; });
    }
  };

  if (!data || (!items.length && (updating || error))) {
    return (
      <div className="empty">
        <Skull className="big" />
        <h2>{updating || !data ? 'Downloading the doll catalog…' : 'No catalog yet'}</h2>
        <p className="muted">Every Monster High release, from MHcollector.com.</p>
        {error && <p className="error-text">{error}</p>}
        {error && <button className="btn primary" onClick={update}>Try again</button>}
      </div>
    );
  }

  const filtersOn = query || series || flag || show !== 'all';

  return (
    <div className="catalog">
      <div className="cs-bar">
        <p className="muted">
          {items.length.toLocaleString()} releases from <a href={data.source} target="_blank" rel="noreferrer">MHcollector.com</a> &middot; updated {ago(data.updatedAt)}
        </p>
        <button className="btn ghost" onClick={update} disabled={updating}>{updating ? 'Updating…' : '↻ Update catalog'}</button>
      </div>
      {error && <p className="error-text">{error}</p>}

      <section className="progress-card">
        <div>
          <span className="stat__value">{ownedDolls} <span className="muted">of {dollItems.length}</span></span>
          <span className="stat__label">catalog dolls in your collection</span>
        </div>
        <div className="progress"><div style={{ width: `${dollItems.length ? (ownedDolls / dollItems.length) * 100 : 0}%` }} /></div>
      </section>

      <section className="toolbar">
        <input className="search" type="search" placeholder="Search the catalog: name, series, year, SKU…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={kind} onChange={(e) => { setKind(e.target.value); setSeries(''); }} aria-label="Type">
          <option value="doll">Dolls</option>
          <option value="other">Accessories &amp; more</option>
          <option value="all">Everything</option>
        </select>
        <select value={series} onChange={(e) => setSeries(e.target.value)} aria-label="Series">
          <option value="">All series</option>
          {seriesList.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={flag} onChange={(e) => setFlag(e.target.value)} aria-label="Release type">
          <option value="">Any release</option>
          {Object.entries(FLAG_LABELS).map(([k, v]) => <option key={k} value={k}>{v}s</option>)}
        </select>
        <select value={show} onChange={(e) => setShow(e.target.value)} aria-label="Show">
          <option value="all">Owned &amp; missing</option>
          <option value="missing">Missing only</option>
          <option value="owned">Owned only</option>
          <option value="wanted">On my wishlist</option>
        </select>
      </section>

      {groups.length === 0 ? (
        <div className="empty">
          <h2>Nothing matches</h2>
          {filtersOn && <button className="btn ghost" onClick={() => { setQuery(''); setSeries(''); setFlag(''); setShow('all'); }}>Clear filters</button>}
        </div>
      ) : (
        groups.map(([name, list]) => {
          const t = seriesTotals.get(name) || { total: list.length, owned: 0 };
          return (
            <section className="series" key={name}>
              <h3 className="series__title">
                {name}
                <span className={`series__count ${t.owned === t.total ? 'complete' : ''}`}>{t.owned}/{t.total}</span>
              </h3>
              <ul className="catalog-list">
                {list.map((item) => {
                  const doll = byUrl.get(item.url);
                  return (
                    <li key={item.url} className={doll?.status === 'owned' ? 'is-owned' : ''}>
                      <button className="catalog-item__name" onClick={() => setOpen(item)}>
                        {item.name}
                      </button>
                      <span className="muted year">{item.year || ''}</span>
                      <span className="badges">
                        {item.flags.map((f) => <span key={f} className={`badge flag-${f}`} title={FLAG_LABELS[f]}>{FLAG_LABELS[f]}</span>)}
                      </span>
                      <StatusButtons item={item} doll={doll} busy={busy.has(item.url)} onAdd={add} onOpenDoll={onOpenDoll} compact />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}

      {open && (
        <DetailModal
          item={open}
          doll={byUrl.get(open.url)}
          busy={busy.has(open.url)}
          onClose={() => setOpen(null)}
          onAdd={add}
          onOpenDoll={onOpenDoll}
        />
      )}
    </div>
  );
}
