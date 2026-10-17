import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MapView, { MAP_CREDIT, SatImage, type MapPoint } from '../components/MapView';
import Journal from '../components/Journal';
import { Icon } from '../components/Icon';
import { useStore } from '../store';
import { useSites } from '../hooks';
import { api } from '../api';
import type { SiteDetail, SiteTuple } from '../types';

export function distKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const RADIUS_KM = 30;

export default function Home() {
  const { dives, user, nameLang } = useStore();
  const sites = useSites();
  const [journalIndex, setJournalIndex] = useState<number | null>(null);

  // Focus the map on the dive open in the journal (or the latest located dive).
  const focusDive = useMemo(() => {
    const located = dives.filter((d) => d.lat != null && d.lon != null);
    if (journalIndex != null && dives[journalIndex]?.lat != null) return dives[journalIndex];
    return located[located.length - 1] ?? null;
  }, [dives, journalIndex]);

  const nearby = useMemo(() => {
    if (!sites || !focusDive) return [];
    return sites
      .map((s) => ({ s, km: distKm(focusDive.lat!, focusDive.lon!, s[2], s[3]) }))
      .filter((x) => x.km <= RADIUS_KM && x.s[1])
      .sort((a, b) => a.km - b.km)
      .slice(0, 40)
      .map((x) => x.s);
  }, [sites, focusDive]);

  const [slide, setSlide] = useState(0);
  useEffect(() => setSlide(0), [focusDive?.id]);
  const current: SiteTuple | undefined = nearby[slide];

  const points: MapPoint[] = useMemo(() => {
    if (focusDive) {
      const pts: MapPoint[] = nearby.map((s) => ({ id: s[0], lat: s[2], lon: s[3], label: s[1], kind: 'site' }));
      pts.push({ id: `dive-${focusDive.id}`, lat: focusDive.lat!, lon: focusDive.lon!, label: focusDive.siteName, kind: 'mine' });
      return pts;
    }
    return (sites || []).map((s) => ({ id: s[0], lat: s[2], lon: s[3], label: s[1], kind: 'site' as const }));
  }, [nearby, focusDive, sites]);

  const areaName = focusDive?.area?.split(',')[0] || focusDive?.siteName;

  return (
    <main className="page">
      <section className="sites-card" aria-label="Dive sites map">
        <div className="sites-map">
          <MapView
            points={points}
            bare
            cluster={!focusDive}
            fit={!!focusDive}
            center={[20, 20]}
            zoom={1.6}
            selectedId={current?.[0] ?? null}
            flyTo={current ? { lat: current[2], lon: current[3], key: current[0], zoom: 13 } : null}
            areaLabel={focusDive && areaName ? { lat: focusDive.lat!, lon: focusDive.lon!, text: areaName } : null}
            onSelect={(p) => { const i = nearby.findIndex((s) => s[0] === p.id); if (i >= 0) setSlide(i); }}
          />
        </div>
        <div className="sites-title">
          {sites == null ? <h2>Loading dive sites…</h2> : focusDive ? (
            <>
              <h2>{nearby.length} Dive Site{nearby.length === 1 ? '' : 's'}</h2>
              <p>near {focusDive.area || focusDive.siteName}</p>
            </>
          ) : (
            <>
              <h2>{sites.length ? `${sites.length.toLocaleString()} Dive Sites` : 'Dive Sites'}</h2>
              <p>{sites.length ? 'around the world' : 'still loading from OpenStreetMap…'}</p>
            </>
          )}
        </div>
        {nearby.length > 1 && (
          <>
            <button className="map-arrow l" aria-label="Previous site" onClick={() => setSlide((s) => (s - 1 + nearby.length) % nearby.length)}><Icon name="left" size={26} /></button>
            <button className="map-arrow r" aria-label="Next site" onClick={() => setSlide((s) => (s + 1) % nearby.length)}><Icon name="right" size={26} /></button>
          </>
        )}
        {current ? (
          <>
            <div className="site-strip"><SiteCard site={current} /></div>
            <div className="dots" aria-hidden="true">
              {nearby.slice(0, Math.min(nearby.length, 7)).map((_, i) => <i key={i} className={i === slide % 7 ? 'on' : ''} />)}
            </div>
          </>
        ) : (
          <div style={{ padding: '12px 16px 14px', fontSize: 14 }} className="muted">
            {focusDive ? `No mapped dive sites within ${RADIUS_KM} km of this dive in OpenStreetMap yet.` : 'Log a dive to see the sites around it. Explore every mapped site in the Dive Sites tab.'}
          </div>
        )}
        <div className="map-credit">{MAP_CREDIT}</div>
      </section>

      <Journal
        dives={dives}
        nameLang={nameLang}
        ownerName={user?.name || ''}
        onIndexChange={setJournalIndex}
      />

      <Link to="/log/new" className="btn btn-primary btn-big" style={{ marginTop: 18 }}><Icon name="plus" /> Log a new dive</Link>
    </main>
  );
}

const detailCache = new Map<string, SiteDetail>();

function SiteCard({ site }: { site: SiteTuple }) {
  const [detail, setDetail] = useState<SiteDetail | null>(detailCache.get(site[0]) ?? null);
  useEffect(() => {
    if (detailCache.has(site[0])) { setDetail(detailCache.get(site[0])!); return; }
    setDetail(null);
    let live = true;
    api.get<{ site: SiteDetail }>(`/api/sites/${encodeURIComponent(site[0])}`)
      .then((r) => { detailCache.set(site[0], r.site); if (live) setDetail(r.site); })
      .catch(() => {});
    return () => { live = false; };
  }, [site]);
  const [, name, lat, lon, maxDepth, type] = site;
  return (
    <Link to={`/sites?site=${encodeURIComponent(site[0])}`} className="site-card">
      <div className="site-thumb"><SatImage lat={lat} lon={lon} zoom={15} alt={`Satellite view of ${name}`} /></div>
      <div className="site-info">
        <h3><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span><Icon name="right" size={18} style={{ marginLeft: 'auto', flex: 'none' }} /></h3>
        <div className="site-meta">
          {maxDepth != null && <span><Icon name="waves" size={17} />{maxDepth} m max</span>}
          {type && <span><Icon name="layers" size={16} />{type}</span>}
          {detail?.entry && <span><Icon name="diver" size={16} />{detail.entry} entry</span>}
        </div>
        <p className="site-desc">{detail?.description || (detail ? 'Mapped dive site from OpenStreetMap.' : '')}</p>
      </div>
    </Link>
  );
}
