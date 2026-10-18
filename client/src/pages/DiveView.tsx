import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import Journal from '../components/Journal';
import MapView from '../components/MapView';
import { SpecialMark, SpeciesPhoto, useToast } from '../components/ui';
import { useEnrichedCards } from '../hooks';
import { useStore } from '../store';
import type { SpeciesCard } from '../types';
import { displayName, durationMin, fmtDate } from '../util';

export default function DiveView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { dives, user, nameLang, deleteDive } = useStore();
  const idx = dives.findIndex((d) => d.id === Number(id));
  const d = dives[idx];
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useToast();
  const cards = useEnrichedCards((d?.sightings.map((s) => s.species).filter(Boolean) as SpeciesCard[]) || []);

  if (!d) {
    return <main className="page"><div className="empty glass"><h3>Dive not found</h3><Link className="btn" to="/log">Back to your log</Link></div></main>;
  }

  const onDelete = async () => {
    if (!confirm(`Delete dive #${d.number} at ${d.siteName}? Its photos will be deleted too.`)) return;
    setDeleting(true);
    try { await deleteDive(d.id); nav('/log', { replace: true }); }
    catch (e) { setToast((e as Error).message); setDeleting(false); }
  };

  const dur = durationMin(d);
  const airUsed = d.startBar != null && d.endBar != null ? d.startBar - d.endBar : null;

  return (
    <main className="page">
      {toast}
      <div className="page-head">
        <button className="back-btn" onClick={() => nav(-1)} aria-label="Back"><Icon name="left" size={28} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="page-title" style={{ fontSize: 28 }}>{d.siteName}</h1>
          <p className="page-sub">Dive #{d.number} · {fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 4 }}>
        <Link to={`/log/${d.id}/edit`} className="btn"><Icon name="edit" size={18} />Edit</Link>
        <button className="btn btn-danger" onClick={onDelete} disabled={deleting}><Icon name="trash" size={18} />Delete</button>
        <span className="spacer" />
      </div>

      <Journal key={d.id} dives={dives} nameLang={nameLang} ownerName={user?.name || ''} initialIndex={idx} onIndexChange={(i) => { const t = dives[i]; if (t && t.id !== d.id && t.id > 0) nav(`/log/${t.id}`, { replace: true }); }} />

      <div className="stat-row" style={{ marginTop: 16 }}>
        <div className="glass stat"><b>{d.maxDepth ?? '—'}{d.maxDepth != null && <small style={{ fontSize: 14 }}> m</small>}</b><span>Max depth</span></div>
        <div className="glass stat"><b>{dur ?? '—'}{dur != null && <small style={{ fontSize: 14 }}> min</small>}</b><span>Duration</span></div>
        <div className="glass stat"><b>{airUsed ?? '—'}{airUsed != null && <small style={{ fontSize: 14 }}> bar</small>}</b><span>Air used</span></div>
      </div>

      {cards.length > 0 && (
        <section className="glass section">
          <div className="section-head"><span className="ico"><Icon name="fish" size={20} /></span><span className="caps">Species seen ({cards.length})</span></div>
          <div className="sp-list">
            {cards.map((c) => {
              const s = d.sightings.find((x) => x.aphiaId === c.aphiaId)!;
              return (
                <Link key={c.aphiaId} to={`/species/${c.aphiaId}`} className="sp-row">
                  <SpeciesPhoto className="thumb" species={c} sizes="64px" maxWidth={250} alt={displayName(c, nameLang)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t1" dir="auto">{displayName(c, nameLang)}{s.count > 1 ? <span className="muted"> ×{s.count}</span> : null}</div>
                    <div className="t2">{c.scientificName}</div>
                  </div>
                  {s.special && <SpecialMark />}
                  {d.highlight === c.aphiaId && <span className="pill-dot" style={{ color: 'var(--accent)' }}>Highlight</span>}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {d.photos.length > 0 && (
        <section className="glass section">
          <div className="section-head"><span className="ico"><Icon name="camera" size={20} /></span><span className="caps">Photos ({d.photos.length})</span></div>
          <div className="dive-photos">{d.photos.map((p) => <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="Dive photo" loading="lazy" /></a>)}</div>
        </section>
      )}

      {d.notes && (
        <section className="glass section">
          <div className="section-head"><span className="ico"><Icon name="note" size={20} /></span><span className="caps">Notes</span></div>
          <p className="about-text" dir="auto" style={{ whiteSpace: 'pre-wrap' }}>{d.notes}</p>
        </section>
      )}

      {d.lat != null && d.lon != null && (
        <section className="glass section">
          <div className="section-head"><span className="ico"><Icon name="pin" size={20} /></span><span className="caps" style={{ flex: 1 }}>Entry point</span><span className="dim" style={{ fontSize: 12 }}>{d.lat.toFixed(4)}, {d.lon.toFixed(4)}</span></div>
          <div className="mini-map"><MapView points={[{ id: 'd', lat: d.lat, lon: d.lon, label: d.siteName, kind: 'mine' }]} /></div>
        </section>
      )}
    </main>
  );
}
