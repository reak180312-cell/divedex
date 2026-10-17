import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Icon } from './Icon';
import MapView, { type MapPoint } from './MapView';
import { Sheet } from './ui';
import { useDebounced, useSites } from '../hooks';

export interface PickedLocation { siteName: string; siteRef: string | null; lat: number | null; lon: number | null }

export default function LocationPicker({ open, onClose, value, onPick }: { open: boolean; onClose: () => void; value: PickedLocation; onPick: (v: PickedLocation) => void }) {
  const sites = useSites();
  const [draft, setDraft] = useState<PickedLocation>(value);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 350);
  const [places, setPlaces] = useState<{ name: string; lat: number; lon: number }[]>([]);
  const [fly, setFly] = useState<{ lat: number; lon: number; zoom?: number; key: number } | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);

  useEffect(() => { if (open) { setDraft(value); setQ(''); setFly(value.lat != null ? { lat: value.lat, lon: value.lon!, zoom: 13, key: Date.now() } : null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const siteMatches = useMemo(() => {
    if (!sites || dq.length < 2) return [];
    const n = dq.toLowerCase();
    return sites.filter((s) => s[1]?.toLowerCase().includes(n)).slice(0, 6);
  }, [sites, dq]);

  useEffect(() => {
    if (dq.length < 3) { setPlaces([]); return; }
    let live = true;
    api.get<{ places: { name: string; lat: number; lon: number }[] }>(`/api/geocode?q=${encodeURIComponent(dq)}`)
      .then((r) => live && setPlaces(r.places)).catch(() => live && setPlaces([]));
    return () => { live = false; };
  }, [dq]);

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
    <Sheet open={open} onClose={onClose} title="Dive location">
      <div className="search-box" style={{ position: 'relative' }}>
        <Icon name="search" className="lead" size={20} />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dive sites or places" aria-label="Search location" />
      </div>
      {(siteMatches.length > 0 || places.length > 0) && (
        <div className="glass" style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
          {siteMatches.map((s) => (
            <button key={s[0]} className="result" onClick={() => { setDraft({ siteName: s[1] || '', siteRef: s[0], lat: s[2], lon: s[3] }); setFly({ lat: s[2], lon: s[3], zoom: 15, key: Date.now() }); setQ(''); }}>
              <Icon name="pin" size={18} style={{ color: 'var(--accent)' }} />
              <span style={{ flex: 1 }}>{s[1]}<span className="dim" style={{ fontSize: 12, display: 'block' }}>Dive site · {s[2].toFixed(2)}, {s[3].toFixed(2)}{s[4] != null ? ` · ${s[4]} m` : ''}</span></span>
            </button>
          ))}
          {places.map((p, i) => (
            <button key={i} className="result" onClick={() => { setFly({ lat: p.lat, lon: p.lon, zoom: 12, key: Date.now() }); setQ(''); }}>
              <Icon name="globe" size={18} className="dim" />
              <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mini-map" style={{ height: 300, marginTop: 10 }}>
        <MapView
          points={points} cluster fit={false} center={value.lat != null ? [value.lat, value.lon!] : [25, 20]} zoom={value.lat != null ? 12 : 2}
          selectedId={draft.siteRef || (draft.lat != null ? 'picked' : null)} flyTo={fly}
          onSelect={(p) => { if (p.id !== 'picked') setDraft({ siteName: p.label || '', siteRef: p.id, lat: p.lat, lon: p.lon }); }}
          onMapClick={(lat, lon) => setDraft((d) => ({ ...d, lat: +lat.toFixed(5), lon: +lon.toFixed(5), siteRef: null }))}
        />
      </div>
      <p className="credits" style={{ margin: '6px 2px 10px' }}>Tap a pin to choose a mapped dive site, or tap anywhere to mark your entry point.</p>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" value={draft.siteName} onChange={(e) => setDraft((d) => ({ ...d, siteName: e.target.value }))} placeholder="Site name, e.g. Coral Garden" aria-label="Site name" />
        <button className="btn" onClick={useMyLocation} title="Use my location" aria-label="Use my location"><Icon name="target" size={18} /></button>
      </div>
      {geoErr && <p className="field-err">{geoErr}</p>}
      <p className="muted" style={{ fontSize: 13, margin: '8px 2px' }}>
        {draft.lat != null ? `Entry point ${draft.lat.toFixed(4)}, ${draft.lon!.toFixed(4)}` : 'No coordinates — the dive will not appear on maps.'}
        {draft.lat != null && <button className="link-caps" style={{ marginLeft: 8 }} onClick={() => setDraft((d) => ({ ...d, lat: null, lon: null, siteRef: null }))}>Clear</button>}
      </p>
      <button className="btn btn-primary btn-big" disabled={!draft.siteName.trim()} onClick={() => { onPick({ ...draft, siteName: draft.siteName.trim() }); onClose(); }}>
        <Icon name="check" /> Use this location
      </button>
    </Sheet>
  );
}
