import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  label?: string | null;
  kind?: 'site' | 'mine' | 'sighting' | 'picked';
}

interface Props {
  points: MapPoint[];
  selectedId?: string | null;
  onSelect?: (p: MapPoint) => void;
  onMapClick?: (lat: number, lon: number) => void;
  /** Fit the view to these points when they change (else uses center/zoom). */
  fit?: boolean;
  center?: [number, number];
  zoom?: number;
  cluster?: boolean;
  interactive?: boolean;
  labels?: boolean;
  className?: string;
  /** Imperatively fly to this location whenever it changes. */
  flyTo?: { lat: number; lon: number; zoom?: number; key: string | number } | null;
  areaLabel?: { lat: number; lon: number; text: string } | null;
  onView?: (bounds: L.LatLngBounds, zoom: number) => void;
  /** Hide Leaflet's overlay credits/zoom when the caller renders credits itself (MAP_CREDIT). */
  bare?: boolean;
}

export const MAP_CREDIT = 'Imagery © Esri, Maxar, Earthstar Geographics · Dive sites © OpenStreetMap contributors (ODbL)';
const TILE_ATTR = 'Imagery © Esri, Maxar, Earthstar Geographics &amp; GIS User Community · Dive sites © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

function pinHtml(kind: MapPoint['kind'], big: boolean) {
  const fill = kind === 'mine' || kind === 'sighting' || kind === 'picked' ? '#0b3a48' : '#121212';
  const dot = kind === 'mine' || kind === 'sighting' || kind === 'picked' ? '#62e6ec' : '#ffffff';
  return `<svg class="dd-pin${big ? ' big' : ''}" viewBox="0 0 30 38"><path d="M15 37s12-11.4 12-21.6C27 8 21.6 2 15 2S3 8 3 15.4C3 25.6 15 37 15 37Z" fill="${fill}" stroke="${big ? '#62e6ec' : '#fff'}" stroke-width="2.4"/><circle cx="15" cy="15" r="5" fill="${dot}"/></svg>`;
}

const iconCache = new Map<string, L.DivIcon>();
function pinIcon(kind: MapPoint['kind'], big = false) {
  const k = `${kind}-${big}`;
  if (!iconCache.has(k)) {
    const [w, h] = big ? [40, 50] : [30, 38];
    iconCache.set(k, L.divIcon({ html: pinHtml(kind, big), className: '', iconSize: [w, h], iconAnchor: [w / 2, h - 1] }));
  }
  return iconCache.get(k)!;
}

export default function MapView({
  points, selectedId, onSelect, onMapClick, fit = true, center = [20, 10], zoom = 2, cluster = false,
  interactive = true, labels = true, className, flyTo, areaLabel, onView, bare = false,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const labelLayer = useRef<L.Layer | null>(null);
  const cb = useRef({ onSelect, onMapClick, onView });
  cb.current = { onSelect, onMapClick, onView };
  const data = useRef({ points, selectedId, cluster });
  data.current = { points, selectedId, cluster };

  // init once
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, {
      center, zoom, zoomControl: false, attributionControl: !bare, worldCopyJump: true,
      dragging: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive, touchZoom: interactive, keyboard: interactive,
      minZoom: 2, maxZoom: 18,
    });
    // detectRetina: on high-DPI screens fetch one zoom level deeper at half size → twice the pixel density.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 17, detectRetina: true, attribution: TILE_ATTR }).addTo(m);
    if (labels) L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, opacity: 0.9 }).addTo(m);
    m.attributionControl?.setPrefix(false);
    if (interactive && !bare) L.control.zoom({ position: 'bottomright' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => cb.current.onMapClick?.(e.latlng.lat, e.latlng.lng));
    m.on('moveend zoomend', () => { draw(); cb.current.onView?.(m.getBounds(), m.getZoom()); });
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw markers; when clustering, bucket points on a 64px screen grid within the viewport.
  function draw() {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const { points: pts, selectedId: sel, cluster: doCluster } = data.current;
    const bounds = m.getBounds().pad(0.2);
    const visible = pts.filter((p) => bounds.contains([p.lat, p.lon]) || p.id === sel);
    const addPin = (p: MapPoint) => {
      const mk = L.marker([p.lat, p.lon], { icon: pinIcon(p.kind, p.id === sel), zIndexOffset: p.id === sel ? 1000 : p.kind === 'mine' ? 500 : 0, keyboard: false, title: p.label || undefined });
      mk.on('click', (e) => { L.DomEvent.stopPropagation(e); cb.current.onSelect?.(p); });
      g.addLayer(mk);
    };
    if (!doCluster || m.getZoom() >= 13 || visible.length < 60) { visible.forEach(addPin); return; }
    const cells = new Map<string, MapPoint[]>();
    const size = 64;
    for (const p of visible) {
      if (p.id === sel || p.kind === 'mine') { addPin(p); continue; }
      const pt = m.latLngToLayerPoint([p.lat, p.lon]);
      const key = `${Math.floor(pt.x / size)}:${Math.floor(pt.y / size)}`;
      (cells.get(key) || cells.set(key, []).get(key)!).push(p);
    }
    for (const list of cells.values()) {
      if (list.length === 1) { addPin(list[0]); continue; }
      const lat = list.reduce((s, p) => s + p.lat, 0) / list.length;
      const lon = list.reduce((s, p) => s + p.lon, 0) / list.length;
      const d = list.length > 99 ? 46 : list.length > 9 ? 40 : 34;
      const mk = L.marker([lat, lon], { icon: L.divIcon({ html: `<div class="dd-cluster" style="width:${d}px;height:${d}px">${list.length}</div>`, className: '', iconSize: [d, d] }) });
      mk.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        m.fitBounds(L.latLngBounds(list.map((p) => [p.lat, p.lon] as [number, number])).pad(0.3), { maxZoom: 14 });
      });
      g.addLayer(mk);
    }
  }

  useEffect(() => {
    draw();
    const m = map.current;
    if (m && fit && points.length) {
      const b = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
      if (points.length === 1) m.setView(b.getCenter(), Math.max(m.getZoom(), 11), { animate: false });
      else m.fitBounds(b.pad(0.25), { animate: false, maxZoom: 13 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, fit]);

  useEffect(() => { draw(); }, [selectedId, cluster]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (flyTo && map.current) map.current.flyTo([flyTo.lat, flyTo.lon], flyTo.zoom ?? Math.max(map.current.getZoom(), 12), { duration: 0.8 });
  }, [flyTo?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (labelLayer.current) { m.removeLayer(labelLayer.current); labelLayer.current = null; }
    if (areaLabel) {
      labelLayer.current = L.tooltip({ permanent: true, direction: 'center', className: 'map-label', interactive: false })
        .setLatLng([areaLabel.lat, areaLabel.lon]).setContent(areaLabel.text).addTo(m);
    }
  }, [areaLabel?.lat, areaLabel?.lon, areaLabel?.text]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={className} style={{ width: '100%', height: '100%' }} />;
}

const TILE_URL = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

/**
 * Sharp static satellite picture centred on a point. Stitches as many tiles as the box needs and
 * fetches them at the screen's pixel density; `zoom` sets the framing as it would look at 1x.
 */
export function SatImage({ lat, lon, zoom, alt, className }: { lat: number; lon: number; zoom: number; alt: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tiles: { key: string; src: string; left: number; top: number; s: number }[] = [];
  if (size && size.w > 0 && size.h > 0) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    // Big boxes (e.g. the full-screen journal) need a deeper zoom for the same framing to stay sharp.
    const zr = Math.max(1, Math.min(18, zoom + Math.round(Math.log2(dpr))));
    const k = 2 ** (zr - zoom); // world pixels at zoom zr per CSS pixel
    const n = 2 ** zr;
    const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
    const px = ((lon + 180) / 360) * 256 * n;
    const py = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * n;
    const left = px - (size.w / 2) * k, top = py - (size.h / 2) * k;
    const s = 256 / k;
    for (let ty = Math.floor(top / 256); ty <= Math.floor((top + size.h * k) / 256); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(left / 256); tx <= Math.floor((left + size.w * k) / 256); tx++) {
        const wx = ((tx % n) + n) % n;
        tiles.push({ key: `${zr}/${tx}/${ty}`, src: TILE_URL(zr, wx, ty), left: (tx * 256 - left) / k, top: (ty * 256 - top) / k, s });
      }
    }
  }
  return (
    <div ref={ref} className={className} role="img" aria-label={alt} style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', background: '#203a44' }}>
      {tiles.map((t) => (
        <img key={t.key} src={t.src} alt="" draggable={false} loading="lazy" decoding="async"
          style={{ position: 'absolute', left: t.left, top: t.top, width: t.s + 1, height: t.s + 1, maxWidth: 'none' }} />
      ))}
    </div>
  );
}
