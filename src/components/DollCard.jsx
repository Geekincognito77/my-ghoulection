import { api } from '../api.js';
import { displayName, fmtMoney } from '../constants.js';
import Skull from './Skull.jsx';

export default function DollCard({ doll, onOpen }) {
  const cover = doll.photos[0];
  const wanted = doll.status === 'wanted';
  const parts = [doll.character && doll.dollName ? doll.dollName : null, doll.line, doll.year].filter(Boolean);
  const subtitle = [...new Set(parts.map(String))].join(' · ');

  return (
    <button className="doll-card" onClick={() => onOpen(doll)}>
      <div className="doll-card__photo">
        {cover ? <img src={api.photoUrl(cover)} alt="" loading="lazy" /> : <Skull />}
        {doll.photos.length > 1 && <span className="photo-count">{doll.photos.length} photos</span>}
      </div>
      <div className="doll-card__body">
        <h3>{displayName(doll)}</h3>
        {subtitle && <p className="muted">{subtitle}</p>}
        <div className="badges">
          {doll.generation && <span className="badge teal">{doll.generation}</span>}
          {!wanted && doll.condition && <span className="badge">{doll.condition}</span>}
          {wanted && doll.priority && <span className={`badge prio-${doll.priority.toLowerCase()}`}>{doll.priority} priority</span>}
        </div>
        <p className="doll-card__value">
          {wanted ? (
            doll.targetPrice != null && <>Hoping to pay {fmtMoney(doll.targetPrice)}</>
          ) : doll.estValue != null ? (
            <>Worth ~{fmtMoney(doll.estValue)}</>
          ) : doll.pricePaid != null ? (
            <>Paid {fmtMoney(doll.pricePaid)}</>
          ) : null}
        </p>
      </div>
    </button>
  );
}
