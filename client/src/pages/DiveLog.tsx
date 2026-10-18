import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useStore } from '../store';
import { durationMin, fmtDate } from '../util';

export default function DiveLog() {
  const { dives, drafts, collection, loaded } = useStore();
  const [q, setQ] = useState('');

  const stats = useMemo(() => {
    const mins = dives.reduce((s, d) => s + (durationMin(d) || 0), 0);
    const deepest = dives.reduce((m, d) => Math.max(m, d.maxDepth ?? 0), 0);
    return { mins, deepest };
  }, [dives]);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return [...dives].reverse().filter((d) => !n || [d.siteName, d.area, d.buddy, d.notes].some((x) => x?.toLowerCase().includes(n)));
  }, [dives, q]);

  return (
    <main className="page">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1 className="page-title">Dive Log</h1>
          <p className="page-sub">{dives.length ? `${dives.length} dive${dives.length > 1 ? 's' : ''} logged` : 'Every dive you log lands here and in your journal'}</p>
        </div>
        <Link to="/log/new" className="btn btn-primary" style={{ height: 48 }}><Icon name="plus" size={20} />Log Dive</Link>
      </div>

      {dives.length > 0 && (
        <div className="stat-row">
          <div className="glass stat"><b>{dives.length}</b><span>Dives</span></div>
          <div className="glass stat"><b>{stats.mins >= 60 ? `${Math.floor(stats.mins / 60)}h ${stats.mins % 60}m` : `${stats.mins}m`}</b><span>Bottom time</span></div>
          <div className="glass stat"><b>{collection.length}</b><span>Species</span></div>
        </div>
      )}

      {dives.length > 3 && (
        <div className="search-box" style={{ marginBottom: 12 }}>
          <Icon name="search" className="lead" size={20} />
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sites, buddies, notes" aria-label="Search dives" />
        </div>
      )}

      {drafts.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <div className="caps" style={{ marginBottom: 8 }}>Drafts — not in your journal yet</div>
          <div className="stack">
            {drafts.map((d) => (
              <Link key={d.id} to={`/log/${d.id}/edit`} className="dive-row glass draft-row">
                <span className="dive-num"><Icon name="edit" size={20} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.siteName || 'Untitled dive'}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{d.date ? fmtDate(d.date) : 'No date yet'} · {d.sightings.length} species · tap to finish</div>
                </div>
                <Icon name="right" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {loaded && dives.length === 0 && (
        <div className="empty glass">
          <Icon name="book" size={44} />
          <h3>No dives yet</h3>
          <p>Log your first dive and it will be written into your journal.</p>
          <Link to="/log/new" className="btn btn-primary" style={{ marginTop: 10 }}><Icon name="plus" size={18} />Log your first dive</Link>
        </div>
      )}

      <div className="stack">
        {list.map((d) => {
          const dur = durationMin(d);
          return (
            <Link key={`${d.id}-${d.clientId}`} to={`/log/${d.id}`} className="dive-row glass">
              <span className="dive-num">{d.number}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.siteName}</div>
                <div className="muted" style={{ fontSize: 13.5 }}>
                  {fmtDate(d.date)}{d.area ? ` · ${d.area}` : ''}
                </div>
                <div className="row" style={{ gap: 12, fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
                  {d.maxDepth != null && <span className="row" style={{ gap: 4 }}><Icon name="waves" size={15} />{d.maxDepth} m</span>}
                  {dur != null && <span className="row" style={{ gap: 4 }}><Icon name="clock" size={15} />{dur} min</span>}
                  {d.sightings.length > 0 && <span className="row" style={{ gap: 4 }}><Icon name="fish" size={15} />{d.sightings.length}</span>}
                </div>
              </div>
              <Icon name="right" />
            </Link>
          );
        })}
      </div>
      {stats.deepest > 0 && <p className="credits" style={{ textAlign: 'center', marginTop: 16 }}>Deepest dive: {stats.deepest} m</p>}
    </main>
  );
}
