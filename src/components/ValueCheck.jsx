import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { CONDITIONS, displayName, fmtMoney } from '../constants.js';
import Skull from './Skull.jsx';

// eBay's condition filter: boxed dolls compare against New listings, loose ones against Used.
const EBAY_CONDITION = {
  NRFB: { ids: '1000', label: 'New' },
  NIB: { ids: '1000|1500', label: 'New / New other' },
  'Loose complete': { ids: '3000', label: 'Used' },
  'Loose incomplete': { ids: '3000', label: 'Used' },
  'Needs TLC': { ids: '3000|7000', label: 'Used / For parts' },
};

export function ebaySoldUrl(doll) {
  const words = [];
  const add = (s) => {
    for (const w of String(s || '').split(/\s+/)) {
      if (w && !words.some((x) => x.toLowerCase() === w.toLowerCase())) words.push(w);
    }
  };
  add('Monster High');
  if (doll.line && !/exclusive|mattel creations|^basic/i.test(doll.line)) add(doll.line.replace(/[:,!()]/g, ''));
  add(doll.character || doll.dollName);
  if (doll.character && doll.dollName && doll.dollName.split(/\s+/).length <= 3) add(doll.dollName);
  const params = new URLSearchParams({ _nkw: words.join(' '), LH_Sold: '1', LH_Complete: '1', _sop: '13' });
  const cond = EBAY_CONDITION[doll.condition];
  if (cond) params.set('LH_ItemCondition', cond.ids);
  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

function checkedLabel(iso) {
  if (!iso) return 'Never checked';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return days < 1 ? 'Checked today' : days === 1 ? 'Checked yesterday' : `Checked ${days} days ago`;
}

const toNumber = (v) => {
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

function Row({ doll, onSaved, onOpenDoll }) {
  const [value, setValue] = useState(doll.estValue ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(doll.estValue ?? ''), [doll.estValue]);

  const save = async () => {
    const n = toNumber(value);
    if (n === (doll.estValue ?? null)) return;
    setSaving(true);
    try {
      onSaved(await api.saveDoll({ ...doll, estValue: n, valueCheckedAt: n == null ? null : new Date().toISOString() }));
    } finally {
      setSaving(false);
    }
  };

  const setCondition = async (e) => onSaved(await api.saveDoll({ ...doll, condition: e.target.value || null }));

  const cover = doll.photos[0];
  const cond = EBAY_CONDITION[doll.condition];
  const stale = !doll.valueCheckedAt || Date.now() - Date.parse(doll.valueCheckedAt) > 90 * 86400000;

  return (
    <li className="vc-row">
      <button className="vc-thumb" onClick={() => onOpenDoll(doll)} title="Open details">
        {cover ? <img src={api.photoUrl(cover)} alt="" /> : <Skull />}
      </button>
      <div className="vc-name">
        <button className="link-btn" onClick={() => onOpenDoll(doll)}>{displayName(doll)}</button>
        <span className="muted">{[doll.dollName !== displayName(doll) ? doll.dollName : null, doll.line, doll.year].filter(Boolean).join(' · ')}</span>
        <span className="badges">
          <select
            className={`vc-cond ${doll.condition ? '' : 'warn'}`}
            value={doll.condition || ''}
            onChange={setCondition}
            aria-label="Condition"
            title="Condition decides whether eBay shows New or Used sales"
          >
            <option value="">Set condition…</option>
            {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
          </select>
          {cond && <span className="muted small">eBay: {cond.label}</span>}
        </span>
      </div>
      <div className="vc-paid">
        <span className="muted small">Paid</span>
        <span>{fmtMoney(doll.pricePaid)}</span>
      </div>
      <a className="btn ghost small" href={ebaySoldUrl(doll)} target="_blank" rel="noreferrer">eBay sold &#8599;</a>
      <div className="vc-value">
        <label className="muted small" htmlFor={`vc-${doll.id}`}>Value</label>
        <input
          id={`vc-${doll.id}`}
          inputMode="decimal"
          placeholder="$"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          disabled={saving}
        />
        <span className={`small ${stale ? 'warn-text' : 'muted'}`}>{checkedLabel(doll.valueCheckedAt)}</span>
      </div>
    </li>
  );
}

export default function ValueCheck({ dolls, onClose, onSaved, onOpenDoll }) {
  // Keep the order stable while you work through the list: least recently checked first.
  const [order] = useState(() =>
    [...dolls].sort((a, b) => (a.valueCheckedAt ? Date.parse(a.valueCheckedAt) : 0) - (b.valueCheckedAt ? Date.parse(b.valueCheckedAt) : 0)).map((d) => d.id),
  );
  const byId = useMemo(() => new Map(dolls.map((d) => [d.id, d])), [dolls]);
  const list = order.map((id) => byId.get(id)).filter(Boolean);

  const paid = dolls.reduce((t, d) => t + (d.pricePaid ?? 0), 0);
  const value = dolls.reduce((t, d) => t + (d.estValue ?? d.pricePaid ?? 0), 0);
  const checked = dolls.filter((d) => d.valueCheckedAt).length;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !e.target.closest?.('input') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal value-check" role="dialog" aria-label="Value check">
        <header className="editor__head">
          <h2>Value check</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">&times;</button>
        </header>
        <div className="vc-summary">
          <div><span className="stat__value">{fmtMoney(value)}</span><span className="stat__label">estimated value</span></div>
          <div><span className="stat__value">{fmtMoney(paid)}</span><span className="stat__label">paid</span></div>
          <div><span className={`stat__value ${value - paid >= 0 ? 'up' : 'down'}`}>{value - paid >= 0 ? '+' : '−'}{fmtMoney(Math.abs(value - paid))}</span><span className="stat__label">{value - paid >= 0 ? 'gained' : 'lost'}</span></div>
          <div><span className="stat__value">{checked}/{dolls.length}</span><span className="stat__label">values checked</span></div>
        </div>
        <p className="muted vc-help">
          <strong>eBay sold &#8599;</strong> opens recently sold listings for that doll, filtered to match its condition. Look at what similar ones
          actually sold for, type a typical price under <strong>Value</strong>, and press Enter. Dolls you haven&rsquo;t checked lately are at the top.
        </p>
        {list.length === 0 ? (
          <div className="empty"><Skull className="big" /><h2>No dolls in your collection yet</h2></div>
        ) : (
          <ul className="vc-list">
            {list.map((d) => <Row key={d.id} doll={d} onSaved={onSaved} onOpenDoll={onOpenDoll} />)}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
