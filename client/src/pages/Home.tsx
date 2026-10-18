import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MapView, { MAP_CREDIT, SatImage, type MapPoint } from '../components/MapView';
import Journal from '../components/Journal';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/ui';
import { useStore } from '../store';
import { api } from '../api';
import type { MySite } from '../types';
import { fmtDate } from '../util';

export function distKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The diver's own sites (every place with at least one saved dive), refreshed whenever dives change. */
export function useMySites() {
  const { dives } = useStore();
  const [sites, setSites] = useState<MySite[] | null>(null);
  const key = dives.map((d) => `${d.id}:${d.lat},${d.lon}:${d.siteName}:${d.date}`).join('|');
  useEffect(() => {
    let live = true;
    api.get<{ sites: MySite[] }>('/api/mysites').then((r) => live && setSites(r.sites)).catch(() => live && setSites([]));
    return () => { live = false; };
  }, [key]);
  return sites;
}

export default function Home() {
  const { dives, user, nameLang, loaded } = useStore();
  const sites = useMySites();
  const [slide, setSlide] = useState(0);
  const [openSite, setOpenSite] = useState<MySite | null>(null);
  const [journalIndex, setJournalIndex] = useState<number | null>(null);

  // When the journal turns to a dive, show that dive's site on the map.
  useEffect(() => {
    const d = journalIndex != null ? dives[journalIndex] : null;
    if (!d || !sites) return;
    const i = sites.findIndex((s) => s.dives.some((x) => x.id === d.id));
    if (i >= 0) setSlide(i);
  }, [journalIndex, sites]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = sites?.[Math.min(slide, (sites?.length ?? 1) - 1)] ?? null;
  const points: MapPoint[] = useMemo(() => (sites || []).map((s) => ({ id: s.key, lat: s.lat, lon: s.lon, label: `${s.name} · ${s.count} dive${s.count > 1 ? 's' : ''}`, kind: 'mine' })), [sites]);
  const totalDives = dives.length;
  const areaName = current?.area?.split(',')[0] || current?.name;

  return (
    <main className="page">
      <section className="sites-card" aria-label="Your dive sites">
        {sites && sites.length > 0 ? (
          <>
            <div className="sites-map">
              <MapView
                points={points}
                bare
                fit
                cluster={sites.length > 40}
                selectedId={current?.key ?? null}
                flyTo={current && sites.length > 1 ? { lat: current.lat, lon: current.lon, key: current.key, zoom: 11 } : null}
                areaLabel={current && areaName ? { lat: current.lat, lon: current.lon, text: areaName } : null}
                onSelect={(p) => { const i = sites.findIndex((s) => s.key === p.id); if (i >= 0) { setSlide(i); setOpenSite(sites[i]); } }}
              />
            </div>
            <div className="sites-title">
              <h2>{sites.length} Dive Site{sites.length === 1 ? '' : 's'}</h2>
              <p>{totalDives} dive{totalDives === 1 ? '' : 's'} logged{current?.area ? ` · ${current.area}` : ''}</p>
            </div>
            {sites.length > 1 && (
              <>
                <button className="map-arrow l" aria-label="Previous site" onClick={() => setSlide((x) => (x - 1 + sites.length) % sites.length)}><Icon name="left" size={26} /></button>
                <button className="map-arrow r" aria-label="Next site" onClick={() => setSlide((x) => (x + 1) % sites.length)}><Icon name="right" size={26} /></button>
              </>
            )}
            {current && (
              <div className="site-strip">
                <button className="site-card" onClick={() => setOpenSite(current)} style={{ width: '100%', textAlign: 'left' }}>
                  <div className="site-thumb"><SatImage lat={current.lat} lon={current.lon} zoom={12} alt={`Satellite view of ${current.name}`} /></div>
                  <div className="site-info">
                    <h3><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="auto">{current.name}</span><Icon name="right" size={18} style={{ marginLeft: 'auto', flex: 'none' }} /></h3>
                    <div className="site-meta">
                      <span><Icon name="log" size={16} />{current.count} dive{current.count > 1 ? 's' : ''}</span>
                      <span><Icon name="calendar" size={16} />Last {fmtDate(current.lastDate)}</span>
                    </div>
                    {current.area && <p className="site-desc" dir="auto">{current.area}</p>}
                  </div>
                </button>
              </div>
            )}
            {sites.length > 1 && (
              <div className="dots" aria-hidden="true">
                {sites.slice(0, 7).map((_, i) => <i key={i} className={i === Math.min(slide, 6) ? 'on' : ''} />)}
              </div>
            )}
            <div className="map-credit">{MAP_CREDIT}</div>
          </>
        ) : sites === null || !loaded ? (
          <div className="sites-map photo" aria-label="Loading your dive map" />
        ) : (
          <div className="map-empty">
            <div className="map-empty-art" aria-hidden="true"><Icon name="sites" size={46} /></div>
            <h2>Your dive map starts here</h2>
            <p>Every place you log a dive appears on this map — one pin per site, with all your dives there.{dives.length === 0 ? '' : ' Your dives so far have no location yet: edit a dive and choose where it was.'}</p>
            <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>
              <Link to="/log/new" className="btn btn-primary"><Icon name="plus" size={18} />Log a dive</Link>
              <Link to="/sites" className="btn">Explore dive sites</Link>
            </div>
          </div>
        )}
      </section>

      <Journal dives={dives} nameLang={nameLang} ownerName={user?.name || ''} onIndexChange={setJournalIndex} />

      <Link to="/log/new" className="btn btn-primary btn-big" style={{ marginTop: 18 }}><Icon name="plus" /> Log a new dive</Link>

      <Sheet open={!!openSite} onClose={() => setOpenSite(null)} title={openSite?.name}>
        {openSite && (
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>
              {openSite.count} dive{openSite.count > 1 ? 's' : ''} here · most recent {fmtDate(openSite.lastDate)}{openSite.area ? ` · ${openSite.area}` : ''}
            </p>
            {openSite.dives.map((d) => (
              <Link key={d.id} to={`/log/${d.id}`} className="dive-row glass" onClick={() => setOpenSite(null)}>
                <span className="dive-num">{d.number}</span>
                <span style={{ flex: 1 }}>{fmtDate(d.date)}{d.maxDepth != null ? <span className="muted"> · {d.maxDepth} m</span> : null}</span>
                <Icon name="right" />
              </Link>
            ))}
            {openSite.siteRef && <Link to={`/sites?site=${encodeURIComponent(openSite.siteRef)}`} className="btn" onClick={() => setOpenSite(null)}>Site details</Link>}
          </div>
        )}
      </Sheet>
    </main>
  );
}
