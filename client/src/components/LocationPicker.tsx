import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Icon } from './Icon';
import MapView, { SatImage, type MapPoint } from './MapView';
import { Sheet } from './ui';
import { useDebounced, useSites } from '../hooks';
import type { MySite } from '../types';
import { fmtDate } from '../util';

export interface PickedLocation { siteName: string; siteRef: string | null; lat: number | null; lon: number | null }

type Tab = 'visited' | 'search' | 'map';

/**
 * Three ways to set where a dive happened:
 *  1. Visited — the diver's own previous sites (one tap).
 *  2. Search — mapped dive sites (OpenStreetMap snapshot) and places worldwide (Nominatim).
 *  3. Map — drop a pin anywhere and name it. Coordinates mark the entry point only; no route is implied.
 */
export default function LocationPicker({ open, onClose, value, onPick }: { open: boolean; onClose: () => void; value: PickedLocation; onPick: (v: PickedLocation) => void }) {
  const [mine, setMine] = useState<MySite[] | null>(null);
  const [tab, setTab] = useState<Tab>('visited');
  const [draft, setDraft] = useState<PickedLocation>(value);

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    api.get<{ sites: MySite[] }>('/api/mysites').then((r) => {
      setMine(r.sites);
      setTab(value.lat != null && !r.sites.some((s) => s.name === value.siteName) ? 'map' : r.sites.length ? 'visited' : 'search');
    }).catch(() => { setMine([]); setTab('search'); });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (v: PickedLocation) => { onPick({ ...v, siteName: v.siteName.trim() }); onClose(); };

  return (
    <Sheet open={open} onClose={onClose} title="Dive location">
      <div className="seg tabs" role="tablist" aria-label="How to choose the location">
        <button role="tab" aria-selected={tab === 'visited'} className={tab === 'visited' ? 'on' : ''} onClick={() => setTab('visited')}><Icon name="log" size={16} />Visited</button>
        <button role="tab" aria-selected={tab === 'search'} className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}><Icon name="search" size={16} />Search</button>
        <button role="tab" aria-selected={tab === 'map'} className={tab === 'map' ? 'on' : ''} onClick={() => setTab('map')}><Icon name="pin" size={16} />On map</button>
      </div>

      {tab === 'visited' && <VisitedTab sites={mine} onPick={(s) => choose({ siteName: s.name, siteRef: s.siteRef, lat: s.lat, lon: s.lon })} onSearch={() => setTab('search')} />}
      {tab === 'search' && <SearchTab onPick={choose} onPlace={(lat, lon, name) => { setDraft({ siteName: name, siteRef: null, lat, lon }); setTab('map'); }} />}
      {tab === 'map' && <MapTab draft={draft} setDraft={setDraft} onDone={() => choose(draft)} />}
    </Sheet>
  );
}

function VisitedTab({ sites, onPick, onSearch }: { sites: MySite[] | null; onPick: (s: MySite) => void; onSearch: () => void }) {
  const [q, setQ] = useState('');
  if (sites === null) return <div className="skeleton" style={{ height: 160, borderRadius: 14, marginTop: 12 }} />;
  if (!sites.length) {
    return (
      <div className="empty" style={{ padding: '24px 8px' }}>
        <p style={{ margin: 0 }}>Sites you dive appear here so you can reuse them with one tap.</p>
        <button className="btn" style={{ marginTop: 12 }} onClick={onSearch}><Icon name="search" size={16} />Search for a site</button>
      </div>
    );
  }
  const n = q.trim().toLowerCase();
  const list = sites.filter((s) => !n || `${s.name} ${s.area || ''}`.toLowerCase().includes(n));
  return (
    <div style={{ marginTop: 12 }}>
      {sites.length > 6 && (
        <div className="search-box" style={{ marginBottom: 8 }}>
          <Icon name="search" className="lead" size={20} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter your sites" aria-label="Filter your sites" />
        </div>
      )}
      <div className="finder-list">
        {list.map((s) => (
          <button key={s.key} className="finder-row" onClick={() => onPick(s)}>
            <span className="loc-thumb small"><SatImage lat={s.lat} lon={s.lon} zoom={11} alt="" /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="finder-site" dir="auto">{s.name}</span>
              <span className="muted" style={{ fontSize: 13 }}>{s.count} dive{s.count > 1 ? 's' : ''} · last {fmtDate(s.lastDate)}{s.area ? ` · ${s.area}` : ''}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchTab({ onPick, onPlace }: { onPick: (v: PickedLocation) => void; onPlace: (lat: number, lon: number, name: string) => void }) {
  const sites = useSites();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 350);
  const [places, setPlaces] = useState<{ name: string; lat: number; lon: number }[] | null>(null);
  const [placeErr, setPlaceErr] = useState(false);

  const siteMatches = useMemo(() => {
    if (!sites || dq.length < 2) return [];
    const n = dq.toLowerCase();
    return sites.filter((s) => s[1]?.toLowerCase().includes(n)).slice(0, 8);
  }, [sites, dq]);

  useEffect(() => {
    setPlaceErr(false);
    if (dq.length < 3) { setPlaces(null); return; }
    let live = true;
    api.get<{ places: { name: string; lat: number; lon: number }[] }>(`/api/geocode?q=${encodeURIComponent(dq)}`)
      .then((r) => live && setPlaces(r.places)).catch(() => { if (live) { setPlaces([]); setPlaceErr(true); } });
    return () => { live = false; };
  }, [dq]);

  return (
    <div style={{ marginTop: 12 }}>
      <div className="search-box">
        <Icon name="search" className="lead" size={20} />
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dive site, town, island, country…" aria-label="Search location" autoFocus />
      </div>
      {dq.length < 2 && <p className="credits" style={{ margin: '8px 2px' }}>Searches {sites ? sites.length.toLocaleString() : '…'} dive sites mapped on OpenStreetMap, plus places worldwide.</p>}
      {siteMatches.length > 0 && <div className="caps" style={{ margin: '12px 2px 4px' }}>Dive sites</div>}
      {siteMatches.map((s) => (
        <button key={s[0]} className="result" onClick={() => onPick({ siteName: s[1] || '', siteRef: s[0], lat: s[2], lon: s[3] })}>
          <Icon name="pin" size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ flex: 1 }} dir="auto">{s[1]}<span className="dim" style={{ fontSize: 12, display: 'block' }}>{s[2].toFixed(2)}, {s[3].toFixed(2)}{s[4] != null ? ` · ${s[4]} m max` : ''}</span></span>
        </button>
      ))}
      {places && places.length > 0 && <div className="caps" style={{ margin: '12px 2px 4px' }}>Places — then place your pin</div>}
      {places?.map((p, i) => (
        <button key={i} className="result" onClick={() => onPlace(p.lat, p.lon, p.name.split(',')[0])}>
          <Icon name="globe" size={18} className="dim" />
          <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
        </button>
      ))}
      {dq.length >= 3 && places && !siteMatches.length && !places.length && (
        <p className="muted" style={{ textAlign: 'center', padding: 12 }}>{placeErr ? "Place search isn't reachable right now — try the map instead." : `Nothing found for “${dq}”.`}</p>
      )}
    </div>
  );
}

function MapTab({ draft, setDraft, onDone }: { draft: PickedLocation; setDraft: (f: (d: PickedLocation) => PickedLocation) => void; onDone: () => void }) {
  const sites = useSites();
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [fly, setFly] = useState<{ lat: number; lon: number; zoom?: number; key: number } | null>(draft.lat != null ? { lat: draft.lat, lon: draft.lon!, zoom: 13, key: 1 } : null);
  const points: MapPoint[] = useMemo(() => {
    const pts: MapPoint[] = (sites || []).map((s) => ({ id: s[0], lat: s[2], lon: s[3], label: s[1], kind: 'site' }));
    if (draft.lat != null && !draft.siteRef) pts.push({ id: 'picked', lat: draft.lat, lon: draft.lon!, label: draft.siteName, kind: 'picked' });
    return pts;
  }, [sites, draft]);

  const useMyLocation = () => {
    setGeoErr(null);
    if (!navigator.geolocation) { setGeoErr('Location is not available on this device.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { const lat = +p.coords.latitude.toFixed(5), lon = +p.coords.longitude.toFixed(5); setDraft((d) => ({ ...d, lat, lon, siteRef: null })); setFly({ lat, lon, zoom: 14, key: Date.now() }); },
      (e) => setGeoErr(e.message || 'Could not get your location.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div className="mini-map" style={{ height: 300 }}>
        <MapView
          points={points} cluster fit={false} center={draft.lat != null ? [draft.lat, draft.lon!] : [25, 20]} zoom={draft.lat != null ? 12 : 2}
          selectedId={draft.siteRef || (draft.lat != null ? 'picked' : null)} flyTo={fly}
          onSelect={(p) => { if (p.id !== 'picked') setDraft(() => ({ siteName: p.label || '', siteRef: p.id, lat: p.lat, lon: p.lon })); }}
          onMapClick={(lat, lon) => setDraft((d) => ({ ...d, lat: +lat.toFixed(5), lon: +lon.toFixed(5), siteRef: null }))}
        />
      </div>
      <p className="credits" style={{ margin: '6px 2px 10px' }}>Tap anywhere to drop a pin at your entry point, or tap a mapped site.</p>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" value={draft.siteName} onChange={(e) => setDraft((d) => ({ ...d, siteName: e.target.value }))} placeholder="Name this site, e.g. Coral Garden" aria-label="Site name" dir="auto" />
        <button className="btn" onClick={useMyLocation} title="Use my location" aria-label="Use my location"><Icon name="target" size={18} /></button>
      </div>
      {geoErr && <p className="field-err">{geoErr}</p>}
      <p className="muted" style={{ fontSize: 13, margin: '8px 2px' }}>
        {draft.lat != null ? `Entry point ${draft.lat.toFixed(4)}, ${draft.lon!.toFixed(4)}` : 'No pin yet — without one the dive won’t appear on your map.'}
        {draft.lat != null && <button className="link-caps" style={{ marginLeft: 8 }} onClick={() => setDraft((d) => ({ ...d, lat: null, lon: null, siteRef: null }))}>Clear</button>}
      </p>
      <button className="btn btn-primary btn-big" disabled={!draft.siteName.trim()} onClick={onDone}>
        <Icon name="check" /> {draft.siteName.trim() ? 'Use this location' : 'Name the site to continue'}
      </button>
    </div>
  );
}
