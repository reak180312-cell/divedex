import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Icon } from '../components/Icon';
import MapView, { type MapPoint } from '../components/MapView';
import { Sheet } from '../components/ui';
import { useDebounced, useSites } from '../hooks';
import { useStore } from '../store';
import type { SiteDetail } from '../types';
import { fmtDate } from '../util';
import { distKm } from './Home';

export default function Sites() {
  const sites = useSites();
  const { dives } = useStore();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const selected = params.get('site');
  const [detail, setDetail] = useState<SiteDetail | null>(null);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim().toLowerCase(), 200);
  const [fly, setFly] = useState<{ lat: number; lon: number; zoom?: number; key: number } | null>(null);

  const points: MapPoint[] = useMemo(() => {
    const pts: MapPoint[] = (sites || []).map((s) => ({ id: s[0], lat: s[2], lon: s[3], label: s[1], kind: 'site' }));
    for (const d of dives) if (d.lat != null && d.lon != null && !d.siteRef) pts.push({ id: `dive:${d.id}`, lat: d.lat, lon: d.lon!, label: d.siteName, kind: 'mine' });
    return pts;
  }, [sites, dives]);

  const matches = useMemo(() => (dq.length < 2 || !sites ? [] : sites.filter((s) => s[1]?.toLowerCase().includes(dq)).slice(0, 12)), [sites, dq]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    if (selected.startsWith('dive:')) return;
    let live = true;
    api.get<{ site: SiteDetail }>(`/api/sites/${encodeURIComponent(selected)}`).then((r) => {
      if (!live) return;
      setDetail(r.site);
      setFly((f) => (f && Math.abs(f.lat - r.site.lat) < 1e-6 ? f : { lat: r.site.lat, lon: r.site.lon, zoom: 14, key: Date.now() }));
    }).catch(() => live && setDetail(null));
    return () => { live = false; };
  }, [selected]);

  const select = (id: string | null) => setParams(id ? { site: id } : {}, { replace: true });

  const myDivesHere = useMemo(() => {
    if (!detail) return [];
    return dives.filter((d) => d.siteRef === detail.id || (d.lat != null && distKm(d.lat, d.lon!, detail.lat, detail.lon) < 0.3));
  }, [detail, dives]);

  return (
    <main className="page" style={{ paddingBottom: 0 }}>
      <div className="sites-full">
        <MapView
          className="map" points={points} cluster fit={false} center={[22, 25]} zoom={2}
          selectedId={selected} flyTo={fly}
          onSelect={(p) => {
            if (p.id.startsWith('dive:')) { const d = dives.find((x) => `dive:${x.id}` === p.id); if (d) nav(`/log/${d.id}`); return; }
            select(p.id);
          }}
        />
        <div className="map-search">
          <div className="search-box">
            <Icon name="search" className="lead" size={20} />
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={sites ? `Search ${sites.length.toLocaleString()} dive sites` : 'Loading dive sites…'} aria-label="Search dive sites" style={{ background: 'rgba(4,22,30,.88)' }} />
          </div>
          {matches.length > 0 && (
            <div className="results">
              {matches.map((s) => (
                <button key={s[0]} onClick={() => { select(s[0]); setFly({ lat: s[2], lon: s[3], zoom: 14, key: Date.now() }); setQ(''); }}>
                  {s[1]}{s[4] != null && <span className="dim"> · {s[4]} m</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="map-legend">
          <span className="row" style={{ gap: 6 }}><Icon name="pin" size={14} style={{ color: '#fff' }} />Mapped site</span>
          <span className="row" style={{ gap: 6 }}><Icon name="pin" size={14} style={{ color: 'var(--accent)' }} />Your dive</span>
        </div>
      </div>

      <Sheet open={!!detail} onClose={() => select(null)} title={detail?.name || 'Unnamed dive site'}>
        {detail && (
          <div className="stack">
            <dl className="kv">
              {detail.maxDepth != null && <><dt>Max depth</dt><dd>{detail.maxDepth} m</dd></>}
              {detail.type && <><dt>Type</dt><dd style={{ textTransform: 'capitalize' }}>{detail.type}</dd></>}
              {detail.entry && <><dt>Entry</dt><dd style={{ textTransform: 'capitalize' }}>{detail.entry}</dd></>}
              {detail.difficulty && <><dt>Difficulty</dt><dd>{detail.difficulty}</dd></>}
              {detail.place && <><dt>Area</dt><dd>{detail.place}</dd></>}
              <dt>Coordinates</dt><dd>{detail.lat.toFixed(5)}, {detail.lon.toFixed(5)}</dd>
            </dl>
            {detail.description && <p className="about-text" dir="auto">{detail.description}</p>}
            {myDivesHere.length > 0 && (
              <div>
                <div className="caps" style={{ marginBottom: 6 }}>Your dives here</div>
                {myDivesHere.map((d) => <Link key={d.id} to={`/log/${d.id}`} className="dive-row glass" style={{ marginBottom: 6 }}><span className="dive-num">{d.number}</span><span style={{ flex: 1 }}>{fmtDate(d.date)}</span><Icon name="right" /></Link>)}
              </div>
            )}
            <Link to={`/log/new?site=${encodeURIComponent(detail.id)}`} className="btn btn-primary btn-big"><Icon name="plus" />Log a dive here</Link>
            <p className="credits">
              Site data from <a href={detail.osmUrl} target="_blank" rel="noreferrer">OpenStreetMap</a> (ODbL).
              {detail.website && <> · <a href={detail.website} target="_blank" rel="noreferrer">Website</a></>}
            </p>
          </div>
        )}
      </Sheet>
    </main>
  );
}
