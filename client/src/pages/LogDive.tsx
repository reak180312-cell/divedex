import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Icon, type IconName } from '../components/Icon';
import LocationPicker, { type PickedLocation } from '../components/LocationPicker';
import { SatImage } from '../components/MapView';
import SpeciesSearch from '../components/SpeciesSearch';
import { Img, Sheet, useToast } from '../components/ui';
import { srcSetFor } from '../img';
import { useEnrichedCards } from '../hooks';
import { useStore, type NewPhoto } from '../store';
import type { Current, DiveFields, Light, Sighting, SpeciesCard } from '../types';
import { displayName, resizeImage, todayISO, uid } from '../util';

type Num = string; // numeric inputs are kept as strings while editing
interface Form {
  date: string; startTime: string; endTime: string; buddy: string;
  startBar: Num; endBar: Num; maxDepth: Num; avgDepth: Num; weights: Num; waterTemp: Num; visibility: Num;
  light: Light | ''; current: Current | ''; suit: string; notes: string;
}
const EMPTY: Form = { date: todayISO(), startTime: '', endTime: '', buddy: '', startBar: '', endBar: '', maxDepth: '', avgDepth: '', weights: '', waterTemp: '', visibility: '', light: '', current: '', suit: '', notes: '' };

const LIMITS: Partial<Record<keyof Form, [number, number, string]>> = {
  startBar: [0, 350, 'bar'], endBar: [0, 350, 'bar'], maxDepth: [0, 350, 'm'], avgDepth: [0, 350, 'm'],
  weights: [0, 40, 'kg'], waterTemp: [-3, 40, '°C'], visibility: [0, 100, 'm'],
};

export default function LogDive() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { dives, saveDive, deletePhoto, nameLang } = useStore();
  const editing = editId != null ? dives.find((d) => d.id === editId) : undefined;

  const [form, setForm] = useState<Form>(EMPTY);
  const [loc, setLoc] = useState<PickedLocation>({ siteName: '', siteRef: null, lat: null, lon: null });
  const [seen, setSeen] = useState<Sighting[]>([]);
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [buddies, setBuddies] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Form | 'site', string>>>({});
  const [toast, setToast] = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);

  // Prefill when editing
  useEffect(() => {
    if (!editing || hydrated.current) return;
    hydrated.current = true;
    const s = (v: number | null | undefined) => (v == null ? '' : String(v));
    setForm({
      date: editing.date, startTime: editing.startTime || '', endTime: editing.endTime || '', buddy: editing.buddy || '',
      startBar: s(editing.startBar), endBar: s(editing.endBar), maxDepth: s(editing.maxDepth), avgDepth: s(editing.avgDepth),
      weights: s(editing.weights), waterTemp: s(editing.waterTemp), visibility: s(editing.visibility),
      light: editing.light || '', current: editing.current || '', suit: editing.suit || '', notes: editing.notes || '',
    });
    setLoc({ siteName: editing.siteName, siteRef: editing.siteRef || null, lat: editing.lat ?? null, lon: editing.lon ?? null });
    setSeen(editing.sightings);
  }, [editing]);

  // New dive: carry over the last buddy/weights/suit — divers usually repeat them
  useEffect(() => {
    if (editId != null || hydrated.current || !dives.length) return;
    hydrated.current = true;
    const last = dives[dives.length - 1];
    setForm((f) => ({ ...f, buddy: last.buddy || '', weights: last.weights != null ? String(last.weights) : '', suit: last.suit || '' }));
  }, [dives, editId]);

  // ?species=123 from a species page
  useEffect(() => {
    const sid = Number(params.get('species'));
    if (!sid) return;
    api.get<{ cards: SpeciesCard[] }>(`/api/species/cards?ids=${sid}`).then(({ cards }) => {
      if (cards[0]) setSeen((s) => (s.some((x) => x.aphiaId === sid) ? s : [...s, { aphiaId: sid, count: 1, species: cards[0] }]));
    }).catch(() => {});
  }, [params]);

  // ?site=osm:node/123 from the Dive Sites map
  useEffect(() => {
    const sid = params.get('site');
    if (!sid || editId != null) return;
    api.get<{ site: { id: string; name: string | null; lat: number; lon: number } }>(`/api/sites/${encodeURIComponent(sid)}`)
      .then(({ site }) => setLoc({ siteName: site.name || '', siteRef: site.id, lat: site.lat, lon: site.lon }))
      .catch(() => {});
  }, [params, editId]);

  useEffect(() => { api.get<{ buddies: string[] }>('/api/buddies').then((r) => setBuddies(r.buddies)).catch(() => {}); }, []);
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const seenCards = useEnrichedCards(seen.map((s) => s.species).filter(Boolean) as SpeciesCard[]);
  const cardOf = (aphiaId: number) => seenCards.find((c) => c.aphiaId === aphiaId) || seen.find((s) => s.aphiaId === aphiaId)?.species || null;
  const selectedIds = useMemo(() => new Set(seen.map((s) => s.aphiaId)), [seen]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const toggleSpecies = (c: SpeciesCard) => setSeen((s) => (s.some((x) => x.aphiaId === c.aphiaId) ? s.filter((x) => x.aphiaId !== c.aphiaId) : [...s, { aphiaId: c.aphiaId, count: 1, species: c }]));
  const bump = (aphiaId: number, d: number) => setSeen((s) => s.map((x) => (x.aphiaId === aphiaId ? { ...x, count: Math.max(1, x.count + d) } : x)));

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const next: NewPhoto[] = [];
    for (const f of Array.from(files)) {
      if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type) && !/\.(jpe?g|png|webp)$/i.test(f.name)) { setToast(`${f.name} isn't a supported image`); continue; }
      try {
        const r = await resizeImage(f);
        next.push({ key: uid(), ...r, aphiaId: null, preview: URL.createObjectURL(r.blob) });
      } catch { setToast(`Couldn't read ${f.name}`); }
    }
    setPhotos((p) => [...p, ...next]);
    if (fileRef.current) fileRef.current.value = '';
  }

  function validate(): DiveFields | null {
    const e: typeof errors = {};
    if (!loc.siteName.trim()) e.site = 'Choose where you dived';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) e.date = 'Pick a date';
    else if (form.date > todayISO()) e.date = "Date can't be in the future";
    const num = (k: keyof Form): number | null => {
      const raw = String(form[k]).trim().replace(',', '.');
      if (!raw) return null;
      const v = Number(raw);
      const [lo, hi] = LIMITS[k]!;
      if (!Number.isFinite(v) || v < lo || v > hi) { e[k] = `Between ${lo} and ${hi}`; return null; }
      return v;
    };
    const f: DiveFields = {
      siteName: loc.siteName.trim(), siteRef: loc.siteRef, lat: loc.lat, lon: loc.lon, date: form.date,
      startTime: form.startTime || null, endTime: form.endTime || null, buddy: form.buddy.trim() || null,
      startBar: num('startBar'), endBar: num('endBar'), maxDepth: num('maxDepth'), avgDepth: num('avgDepth'),
      weights: num('weights'), waterTemp: num('waterTemp'), visibility: num('visibility'),
      light: form.light || null, current: form.current || null, suit: form.suit.trim() || null, notes: form.notes.trim() || null,
    };
    if (f.startBar != null && f.endBar != null && f.endBar > f.startBar) e.endBar = 'Higher than start air';
    if (f.avgDepth != null && f.maxDepth != null && f.avgDepth > f.maxDepth) e.avgDepth = 'Deeper than max depth';
    setErrors(e);
    return Object.keys(e).length ? null : f;
  }

  async function onSave() {
    const fields = validate();
    if (!fields) { setToast('Check the highlighted fields'); return; }
    setSaving(true);
    try {
      const { dive } = await saveDive({ id: editId ?? undefined, fields, sightings: seen, newPhotos: photos });
      setPhotos([]);
      nav(`/log/${dive.id}`, { replace: true });
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (editId != null && !editing) {
    return <main className="page"><div className="empty glass"><h3>Dive not found</h3><Link className="btn" to="/log">Back to your log</Link></div></main>;
  }

  return (
    <main className="page">
      {toast}
      <div className="page-head">
        <button className="back-btn" onClick={() => nav(-1)} aria-label="Back"><Icon name="left" size={28} /></button>
        <div>
          <h1 className="page-title">{editing ? 'Edit Dive' : 'Log Dive'}</h1>
          <p className="page-sub">{editing ? `Dive #${editing.number} · ${editing.siteName}` : 'Add a new dive to your log'}</p>
        </div>
      </div>

      <div className="stack">
        <Field icon="users" label="Dive partner">
          <input list="dd-buddies" value={form.buddy} onChange={(e) => set('buddy', e.target.value)} placeholder="Who did you dive with?" style={{ fontSize: 22 }} />
          <datalist id="dd-buddies">{buddies.map((b) => <option key={b} value={b} />)}</datalist>
          <Icon name="down" size={20} className="muted" />
        </Field>

        <div className="grid2" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)' }}>
          <Field icon="calendar" label="Date" error={errors.date}>
            <input type="date" value={form.date} max={todayISO()} onChange={(e) => set('date', e.target.value)} onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* unsupported */ } }} required />
          </Field>
          <Field icon={form.light === 'night' ? 'moon' : form.light === 'dusk' ? 'dusk' : 'sun'} label="Light">
            <select value={form.light} onChange={(e) => set('light', e.target.value as Light | '')} style={{ fontSize: 20 }}>
              <option value="">—</option><option value="day">Day</option><option value="dusk">Dusk</option><option value="night">Night</option>
            </select>
          </Field>
        </div>

        <div className="grid2">
          <NumField icon="tank" label="Start air" k="startBar" form={form} set={set} error={errors.startBar} />
          <NumField icon="tank" label="End air" k="endBar" form={form} set={set} error={errors.endBar} />

          <Field icon="clock" label="Start time"><input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} /></Field>
          <Field icon="clock" label="End time"><input type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} /></Field>

          <NumField icon="waves" label="Max depth" k="maxDepth" form={form} set={set} error={errors.maxDepth} />
          <NumField icon="weight" label="Weight" k="weights" form={form} set={set} error={errors.weights} />

          <NumField icon="thermo" label="Water temp" k="waterTemp" form={form} set={set} error={errors.waterTemp} />
          <NumField icon="eye" label="Visibility" k="visibility" form={form} set={set} error={errors.visibility} />

          <Field icon="current" label="Current">
            <select value={form.current} onChange={(e) => set('current', e.target.value as Current | '')} style={{ fontSize: 20 }}>
              <option value="">—</option><option value="none">None</option><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="strong">Strong</option>
            </select>
          </Field>
          <Field icon="diver" label="Suit">
            <input value={form.suit} onChange={(e) => set('suit', e.target.value)} placeholder="e.g. 5mm wet" style={{ fontSize: 19 }} maxLength={40} />
          </Field>
        </div>

        <section className="glass" style={{ padding: '12px 10px 10px' }}>
          <div className="row" style={{ padding: '0 4px 8px' }}>
            <Icon name="fish" size={30} style={{ color: 'var(--accent)', fill: 'rgba(98,230,236,.2)' }} />
            <span className="caps" style={{ fontSize: 15, letterSpacing: '.12em', color: 'var(--text)' }}>Seen</span>
            <span className="spacer" />
            <button className="btn" onClick={() => setPicker(true)}><Icon name="plus" size={18} />Add Species</button>
          </div>
          {seen.length === 0 ? (
            <button className="muted" style={{ padding: '10px 6px 6px', fontSize: 14.5, textAlign: 'left' }} onClick={() => setPicker(true)}>
              Search by common, scientific or Hebrew name — try “Nemo”.
            </button>
          ) : (
            <div className="seen-row">
              {seen.map((s) => {
                const c = cardOf(s.aphiaId);
                return (
                  <div key={s.aphiaId} className="seen-item">
                    <Img src={c?.image?.url} srcSet={srcSetFor(c?.image)} sizes="132px" alt={displayName(c, nameLang)} />
                    <div className="cnt" aria-label={`${s.count} seen`}>
                      <button onClick={() => bump(s.aphiaId, -1)} aria-label="One fewer"><Icon name="minus" size={13} /></button>
                      <span style={{ minWidth: 14, textAlign: 'center' }}>{s.count}</span>
                      <button onClick={() => bump(s.aphiaId, 1)} aria-label="One more"><Icon name="plus" size={13} /></button>
                    </div>
                    <button className="x" onClick={() => setSeen((x) => x.filter((y) => y.aphiaId !== s.aphiaId))} aria-label={`Remove ${displayName(c, nameLang)}`}><Icon name="close" size={14} /></button>
                    <div className="nm" dir="auto">{displayName(c, nameLang)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="glass" style={{ padding: 12 }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="field-ico-sm"><Icon name="camera" size={20} style={{ color: 'var(--accent)' }} /></span>
            <span className="caps">Your photos</span>
            <span className="spacer" />
            <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="plus" size={18} />Add</button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          </div>
          {(editing?.photos.length || 0) + photos.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 14 }}>Attach your own underwater shots. Tag one with a species to feature it in your journal.</p>}
          <div className="photo-strip">
            {editing?.photos.map((p) => (
              <div key={p.id} className="ph">
                <img src={p.url} alt="Dive photo" />
                <button className="seen-x" onClick={async () => { if (confirm('Delete this photo?')) { try { await deletePhoto(p.id); } catch (e) { setToast((e as Error).message); } } }} aria-label="Delete photo"><Icon name="trash" size={14} /></button>
                {p.aphiaId && <span className="ph-tag">{displayName(cardOf(p.aphiaId), nameLang)}</span>}
              </div>
            ))}
            {photos.map((p) => (
              <div key={p.key} className="ph">
                <img src={p.preview} alt="New dive photo" />
                <button className="seen-x" onClick={() => { URL.revokeObjectURL(p.preview); setPhotos((x) => x.filter((y) => y.key !== p.key)); }} aria-label="Remove photo"><Icon name="close" size={14} /></button>
                {seen.length > 0 && (
                  <select className="ph-select" value={p.aphiaId ?? ''} onChange={(e) => setPhotos((x) => x.map((y) => (y.key === p.key ? { ...y, aphiaId: e.target.value ? Number(e.target.value) : null } : y)))} aria-label="Species in this photo">
                    <option value="">No species tag</option>
                    {seen.map((s) => <option key={s.aphiaId} value={s.aphiaId}>{displayName(cardOf(s.aphiaId), nameLang)}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
          
        </section>

        <section className="glass" style={{ padding: 12 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <Icon name="note" size={20} style={{ color: 'var(--accent)' }} />
            <span className="caps">Dive information / notes</span>
          </div>
          <textarea className="textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Add notes about this dive..." dir="auto" maxLength={5000} />
        </section>

        <section className={`glass${errors.site ? ' field invalid' : ''}`} style={{ padding: 12, display: 'block', minHeight: 0 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <Icon name="pin" size={20} style={{ color: 'var(--accent)' }} />
            <span className="caps">Location</span>
          </div>
          <button className="loc-tile" onClick={() => setLocOpen(true)}>
            <div className="loc-thumb">{loc.lat != null ? <SatImage lat={loc.lat} lon={loc.lon!} zoom={13} alt="Satellite view of the dive site" /> : <div className="sp-noimg" style={{ position: 'static', height: '100%' }}><Icon name="globe" size={26} /></div>}</div>
            <span style={{ flex: 1, fontSize: 18, fontWeight: 500 }}>{loc.siteName || <span className="muted">Choose dive site</span>}</span>
            <Icon name="right" />
          </button>
          {errors.site && <div className="field-err">{errors.site}</div>}
        </section>

        <button className="btn btn-primary btn-big" onClick={onSave} disabled={saving}>
          {saving ? <span className="spinner" style={{ borderTopColor: 'var(--accent-ink)' }} /> : <Icon name="log" size={24} />} {editing ? 'Save Changes' : 'Save Dive'}
        </button>
      </div>

      <Sheet open={picker} onClose={() => setPicker(false)} title="Add species" actions={seen.length ? <span className="muted" style={{ fontSize: 14 }}>{seen.length} selected</span> : null}>
        <SpeciesSearch autoFocus selected={selectedIds} onToggle={toggleSpecies} />
        {seen.length > 0 && <button className="btn btn-primary btn-big" style={{ marginTop: 14, position: 'sticky', bottom: 0 }} onClick={() => setPicker(false)}>Done</button>}
      </Sheet>

      <LocationPicker open={locOpen} onClose={() => setLocOpen(false)} value={loc} onPick={(v) => { setLoc(v); setErrors((e) => ({ ...e, site: undefined })); }} />
    </main>
  );
}

function Field({ icon, label, children, error }: { icon: IconName; label: string; children: ReactNode; error?: string }) {
  return (
    <label className={`glass field${error ? ' invalid' : ''}`}>
      <span className="ico"><Icon name={icon} size={24} /></span>
      <span className="body">
        <span className="caps">{label}</span>
        <span className="val">{children}</span>
        {error && <span className="field-err">{error}</span>}
      </span>
    </label>
  );
}

function NumField({ icon, label, k, form, set, error, placeholder }: { icon: IconName; label: string; k: keyof Form; form: Form; set: (k: keyof Form, v: string) => void; error?: string; placeholder?: string }) {
  const [lo, hi, unit] = LIMITS[k]!;
  return (
    <Field icon={icon} label={label} error={error}>
      <input type="number" inputMode="decimal" min={lo} max={hi} step="any" value={form[k] as string} onChange={(e) => set(k, e.target.value)} placeholder={placeholder ?? "–"} />
      <span className="unit">{unit}</span>
    </Field>
  );
}
