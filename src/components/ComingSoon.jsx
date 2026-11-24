import { useState } from 'react';
import { fmtMoney } from '../constants.js';
import Countdown, { useNow } from './Countdown.jsx';
import Skull from './Skull.jsx';

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function ago(iso, now) {
  const mins = Math.round((now - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function ProductImage({ src }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Skull />;
}

export default function ComingSoon({ data, checking, error, onCheck, onWishlist, wishlistedUrls }) {
  const now = useNow(1000);

  if (!data) {
    return (
      <div className="empty">
        <Skull className="big" />
        <h2>{checking ? 'Peeking at Mattel Creations…' : 'No drop info yet'}</h2>
        {error && <p className="error-text">{error}</p>}
        {!checking && <button className="btn primary" onClick={onCheck}>Check for drops</button>}
      </div>
    );
  }

  const upcoming = data.upcoming.filter((i) => !i.launchAt || Date.parse(i.launchAt) > now - 60 * 60 * 1000);
  const [next, ...rest] = upcoming;

  const actions = (item) => {
    const onList = wishlistedUrls.has(item.url);
    return (
      <div className="row wrap">
        <a className="btn primary" href={item.url} target="_blank" rel="noreferrer">View on Mattel Creations</a>
        <button className="btn ghost" disabled={onList} onClick={() => onWishlist(item)}>
          {onList ? '✓ On wishlist' : '+ Wishlist'}
        </button>
      </div>
    );
  };

  return (
    <div className="coming-soon">
      <div className="cs-bar">
        <p className="muted">
          Upcoming Monster High drops posted on <strong>Mattel Creations</strong>. Last checked {ago(data.checkedAt, now)}.
          {data.failedPages > 0 && ` (${data.failedPages} product page${data.failedPages === 1 ? '' : 's'} didn’t load.)`}
        </p>
        <button className="btn ghost" onClick={onCheck} disabled={checking}>{checking ? 'Checking…' : '↻ Check now'}</button>
      </div>
      {error && <p className="error-text">{error}</p>}

      {next ? (
        <section className="hero">
          <div className="hero__img"><ProductImage src={next.image} /></div>
          <div className="hero__info">
            <span className="eyebrow">Next drop</span>
            <h2>{next.title}</h2>
            <p className="muted">
              {next.launchAt ? dateFmt.format(new Date(next.launchAt)) : 'Launch date not announced yet'}
              {next.price != null && <> &middot; {fmtMoney(next.price)}</>}
            </p>
            <Countdown target={next.launchAt} now={now} size="big" />
            {actions(next)}
          </div>
        </section>
      ) : (
        <section className="hero empty-hero">
          <Skull className="big" />
          <div>
            <h2>No drops announced right now</h2>
            <p className="muted">Mattel usually posts new Monster High drops a few days before they go live. Check back soon!</p>
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <>
          <h3 className="section-title">Also coming</h3>
          <div className="drop-grid">
            {rest.map((item) => (
              <article className="drop-card" key={item.id}>
                <div className="drop-card__img"><ProductImage src={item.image} /></div>
                <h4>{item.title}</h4>
                <p className="muted">
                  {item.launchAt ? dateFmt.format(new Date(item.launchAt)) : 'Date TBA'}
                  {item.price != null && <> &middot; {fmtMoney(item.price)}</>}
                </p>
                <Countdown target={item.launchAt} now={now} />
                {actions(item)}
              </article>
            ))}
          </div>
        </>
      )}

      {data.dropped.length > 0 && (
        <>
          <h3 className="section-title">Recently dropped</h3>
          <div className="drop-grid compact">
            {data.dropped.map((item) => (
              <article className="drop-card" key={item.id}>
                <div className="drop-card__img"><ProductImage src={item.image} /></div>
                <h4>{item.title}</h4>
                <p className="muted">
                  {dateFmt.format(new Date(item.launchAt))}
                  {item.price != null && <> &middot; {fmtMoney(item.price)}</>}
                </p>
                <span className={`badge ${item.soldOut ? 'sold-out' : 'in-stock'}`}>{item.soldOut ? 'Sold out' : 'Available'}</span>
                {actions(item)}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
