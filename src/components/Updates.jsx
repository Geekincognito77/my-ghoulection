import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Skull from './Skull.jsx';

const RELEASES_URL = 'https://github.com/Geekincognito77/my-ghoulection/releases';

export default function Updates() {
  const [state, setState] = useState({ status: 'idle' });
  const [version, setVersion] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.appVersion().then(setVersion);
    api.updateState().then(setState);
    return api.onUpdateState(setState);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const check = async () => {
    setOpen(true);
    setState({ status: 'checking' });
    setState(await api.checkForUpdates());
  };

  const pending = state.status === 'available' || state.status === 'ready';
  const s = state.status;

  return (
    <>
      <button
        className={`btn ghost small ${pending ? 'update-ready' : ''}`}
        onClick={() => (pending || s === 'downloading' ? setOpen(true) : check())}
        title={`My Ghoulection v${version}`}
      >
        {pending ? `✨ Update to v${state.version}` : s === 'downloading' ? `Updating… ${state.percent || 0}%` : 'Check for updates'}
      </button>

      {open && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal update-modal" role="dialog" aria-label="Updates">
            <header className="editor__head">
              <h2>Updates</h2>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">&times;</button>
            </header>
            <div className="update-body">
              <Skull className="update-skull" />
              <p className="muted">You have My Ghoulection <strong>v{version}</strong>.</p>

              {s === 'checking' && <h3>Checking for updates&hellip;</h3>}

              {s === 'none' && (
                <>
                  <h3>You&rsquo;re up to date!</h3>
                  <p className="muted">This is the newest version.</p>
                </>
              )}

              {s === 'available' && (
                <>
                  <h3>Version {state.version} is available</h3>
                  {state.notes && <pre className="update-notes">{state.notes}</pre>}
                  <button className="btn primary" onClick={() => api.downloadUpdate()}>Download update</button>
                </>
              )}

              {s === 'downloading' && (
                <>
                  <h3>Downloading version {state.version}&hellip;</h3>
                  <div className="progress"><div style={{ width: `${state.percent || 0}%` }} /></div>
                  <p className="muted">{state.percent || 0}% &middot; you can keep using the app.</p>
                </>
              )}

              {s === 'ready' && (
                <>
                  <h3>Version {state.version} is ready</h3>
                  <p className="muted">The app will close, install the update, and reopen. Your collection is kept.</p>
                  <button className="btn primary" onClick={() => api.installUpdate()}>Restart &amp; update</button>
                </>
              )}

              {s === 'error' && (
                <>
                  <h3>Couldn&rsquo;t check for updates</h3>
                  <p className="error-text">{state.message}</p>
                  <div className="row">
                    <button className="btn primary" onClick={check}>Try again</button>
                    <a className="btn ghost" href={RELEASES_URL} target="_blank" rel="noreferrer">Open releases page</a>
                  </div>
                </>
              )}

              {s === 'dev' && <p className="muted">{state.message}</p>}

              {(s === 'none' || s === 'available') && (
                <a className="muted small-link" href={RELEASES_URL} target="_blank" rel="noreferrer">See all releases on GitHub &#8599;</a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
