import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { CHARACTERS, CONDITIONS, EXTRAS, GENERATIONS, LINES, PRIORITIES, displayName } from '../constants.js';
import Skull from './Skull.jsx';
import { ebaySoldUrl } from './ValueCheck.jsx';

const BLANK = {
  status: 'owned', character: '', dollName: '', line: '', year: '', generation: '', modelNumber: '',
  condition: '', extras: [], notes: '', pricePaid: '', purchasedFrom: '', purchaseDate: '',
  estValue: '', targetPrice: '', priority: '', catalogUrl: '', msrp: '', msrpEstimated: false, valueCheckedAt: '', photos: [],
};

const isBlank = (v) => v === '' || v === null || v === undefined;

const fromDoll = (doll) => {
  const form = { ...BLANK };
  for (const key of Object.keys(BLANK)) if (doll[key] !== null && doll[key] !== undefined) form[key] = doll[key];
  if (doll.id) form.id = doll.id;
  return form;
};

const comparable = (f) => JSON.stringify({ ...f, photos: undefined });

export default function DollEditor({ doll, onClose, onChanged, onDeleted, notify }) {
  const [form, setForm] = useState(() => fromDoll(doll));
  const [saved, setSaved] = useState(() => comparable(fromDoll(doll)));
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const firstField = useRef(null);

  const dirty = comparable(form) !== saved;
  const wanted = form.status === 'wanted';
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  // Typing your own MSRP replaces the typical-price estimate.
  const setMsrp = (e) => setForm((f) => ({ ...f, msrp: e.target.value, msrpEstimated: false }));
  // Moving a doll into the collection defaults "price paid" to its MSRP.
  const setStatus = (status) =>
    setForm((f) => ({ ...f, status, pricePaid: status === 'owned' && isBlank(f.pricePaid) && !isBlank(f.msrp) ? f.msrp : f.pricePaid }));
  const msrpField = (
    <label>
      <span>Retail price (MSRP){form.msrpEstimated && !isBlank(form.msrp) && <span className="est-tag" title="A typical price for this kind of release, not the official MSRP. Type over it if you know the real one."> estimate</span>}</span>
      <input inputMode="decimal" value={form.msrp} onChange={setMsrp} placeholder="$" />
    </label>
  );

  useEffect(() => firstField.current?.focus(), []);

  const requestClose = () => {
    if (dirty && !window.confirm('Close without saving your changes?')) return;
    onClose();
  };

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && requestClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const persist = async () => {
    const result = await api.saveDoll(form);
    setForm(fromDoll(result));
    setSaved(comparable(fromDoll(result)));
    onChanged(result);
    return result;
  };

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const result = await persist();
      notify(`${displayName(result)} is ${result.status === 'wanted' ? 'on your wishlist' : 'saved to your collection'}.`);
      onClose();
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  };

  const addPhotos = async (files) => {
    const images = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    setBusy(true);
    try {
      // A doll needs to exist before photos can be attached, so new dolls save first.
      const target = form.id ? form : await persist();
      const updated = await api.addPhotoFiles(target.id, images);
      setForm((f) => ({ ...f, id: updated.id, photos: updated.photos }));
      onChanged(updated);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  };

  const photoAction = async (fn, photoId) => {
    const updated = await fn(photoId);
    if (updated) {
      setForm((f) => ({ ...f, photos: updated.photos }));
      onChanged(updated);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${displayName(form)} and all of their photos? This can’t be undone.`)) return;
    await api.deleteDoll(form.id);
    onDeleted(form.id);
    notify(`${displayName(form)} was removed.`);
    onClose();
  };

  const toggleExtra = (extra) =>
    setForm((f) => ({ ...f, extras: f.extras.includes(extra) ? f.extras.filter((x) => x !== extra) : [...f.extras, extra] }));

  const [cover, ...others] = form.photos;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <form className="modal editor" onSubmit={save} aria-label="Doll details">
        <header className="editor__head">
          <h2>{form.id ? displayName(form) : 'New ghoul'}</h2>
          <div className="segmented" role="radiogroup" aria-label="Status">
            <button type="button" role="radio" aria-checked={!wanted} className={!wanted ? 'on' : ''} onClick={() => setStatus('owned')}>
              In my collection
            </button>
            <button type="button" role="radio" aria-checked={wanted} className={wanted ? 'on' : ''} onClick={() => setStatus('wanted')}>
              On my wishlist
            </button>
          </div>
          <button type="button" className="icon-btn" onClick={requestClose} aria-label="Close">&times;</button>
        </header>

        <div className="editor__body">
          <section
            className={`photos ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addPhotos(e.dataTransfer.files); }}
          >
            <div className="photos__cover">
              {cover ? <img src={api.photoUrl(cover)} alt={`${displayName(form)}`} /> : <Skull />}
              {!cover && <p className="muted">Drop photos here</p>}
            </div>
            {others.length > 0 && (
              <div className="photos__strip">
                {others.map((p) => (
                  <div className="thumb" key={p.id}>
                    <img src={api.photoUrl(p)} alt="" />
                    <div className="thumb__actions">
                      <button type="button" title="Make cover photo" onClick={() => photoAction(api.setCover, p.id)}>&#9733;</button>
                      <button type="button" title="Remove photo" onClick={() => photoAction(api.removePhoto, p.id)}>&times;</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="photos__buttons">
              <button type="button" className="btn ghost" onClick={() => fileInput.current.click()} disabled={busy}>+ Add photos</button>
              {cover && (
                <button type="button" className="btn ghost danger" onClick={() => photoAction(api.removePhoto, cover.id)} disabled={busy}>
                  Remove cover
                </button>
              )}
            </div>
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
          </section>

          <div className="fields">
            <fieldset>
              <legend>Who is it?</legend>
              <div className="grid-2">
                <label>Character<input ref={firstField} list="characters" value={form.character} onChange={set('character')} placeholder="e.g. Draculaura" /></label>
                <label>Doll / release name<input value={form.dollName} onChange={set('dollName')} placeholder="e.g. Sweet 1600" /></label>
                <label>Line / series<input list="lines" value={form.line} onChange={set('line')} /></label>
                <label>Year<input type="number" min="2008" max="2100" value={form.year} onChange={set('year')} /></label>
                <label>Generation
                  <select value={form.generation} onChange={set('generation')}>
                    <option value="">&mdash;</option>
                    {GENERATIONS.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </label>
                <label>Model / SKU number<input value={form.modelNumber} onChange={set('modelNumber')} placeholder="e.g. HHK57" /></label>
              </div>
            </fieldset>

            {wanted ? (
              <fieldset>
                <legend>The hunt</legend>
                <div className="grid-2">
                  <label>Priority
                    <select value={form.priority} onChange={set('priority')}>
                      <option value="">&mdash;</option>
                      {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </label>
                  <label>Hoping to pay<input inputMode="decimal" value={form.targetPrice} onChange={set('targetPrice')} placeholder="$" /></label>
                  {msrpField}
                </div>
              </fieldset>
            ) : (
              <>
                <fieldset>
                  <legend>Condition</legend>
                  <label>Condition
                    <select value={form.condition} onChange={set('condition')}>
                      <option value="">&mdash;</option>
                      {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </label>
                  <div className="extras" aria-label="Included extras">
                    {EXTRAS.map((x) => (
                      <label key={x} className={`chip ${form.extras.includes(x) ? 'on' : ''}`}>
                        <input type="checkbox" checked={form.extras.includes(x)} onChange={() => toggleExtra(x)} />
                        {x}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Value</legend>
                  <div className="grid-2">
                    {msrpField}
                    <label>Price paid<input inputMode="decimal" value={form.pricePaid} onChange={set('pricePaid')} placeholder="$" /></label>
                    <label>Estimated value now<input inputMode="decimal" value={form.estValue} onChange={set('estValue')} placeholder="$" /></label>
                    <div className="ebay-cell">
                      <a className="btn ghost small" href={ebaySoldUrl(form)} target="_blank" rel="noreferrer">Check eBay sold prices &#8599;</a>
                    </div>
                    <label>Bought from<input value={form.purchasedFrom} onChange={set('purchasedFrom')} placeholder="e.g. Target, eBay, convention" /></label>
                    <label>Date bought<input type="date" value={form.purchaseDate} onChange={set('purchaseDate')} /></label>
                  </div>
                </fieldset>
              </>
            )}

            <fieldset>
              <legend>Notes</legend>
              <textarea rows="3" value={form.notes} onChange={set('notes')} placeholder="Anything else: flaws, repaints, stories…" />
            </fieldset>
          </div>
        </div>

        <footer className="editor__foot">
          {form.id ? <button type="button" className="btn ghost danger" onClick={remove}>Delete</button> : <span />}
          <div className="row">
            <button type="button" className="btn ghost" onClick={requestClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </footer>

        <datalist id="characters">{CHARACTERS.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="lines">{LINES.map((l) => <option key={l} value={l} />)}</datalist>
      </form>
    </div>
  );
}
