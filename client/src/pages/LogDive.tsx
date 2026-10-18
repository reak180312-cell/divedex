import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Icon, type IconName } from '../components/Icon';
import LocationPicker, { type PickedLocation } from '../components/LocationPicker';
import { SatImage } from '../components/MapView';
import SpeciesSearch from '../components/SpeciesSearch';
import { Sheet, SpeciesPhoto, useToast } from '../components/ui';
import { useEnrichedCards } from '../hooks';
import { useStore, type NewPhoto } from '../store';
import type { Current, Dive, DiveFields, Light, Sighting, SpeciesCard } from '../types';
import { displayName, fmtTime, minutesBetween, resizeImage, todayISO, uid } from '../util';

type Num = string; // numeric inputs are kept as strings while editing
interface Form {
  date: string; startTime: string; endTime: string; duration: Num; buddy: string;
  startBar: Num; endBar: Num; maxDepth: Num; avgDepth: Num; weights: Num; waterTemp: Num; visibility: Num;
  light: Light | ''; current: Current | ''; suit: string; notes: string;
}
const EMPTY: Form = { date: todayISO(), startTime: '', endTime: '', duration: '', buddy: '', startBar: '', endBar: '', maxDepth: '', avgDepth: '', weights: '', waterTemp: '', visibility: '', light: '', current: '', suit: '', notes: '' };

const LIMITS: Partial<Record<keyof Form, [number, number, string]>> = {
  startBar: [0, 350, 'bar'], endBar: [0, 350, 'bar'], maxDepth: [0, 350, 'm'], avgDepth: [0, 350, 'm'],
  weights: [0, 40, 'kg'], waterTemp: [-3, 40, '°C'], visibility: [0, 100, 'm'], duration: [1, 600, 'min'],
};
const DEPTH_SLIDER_MAX = 60;

/** Everything typed so far — kept in localStorage so leaving the screen by accident loses nothing. */
interface Autosave { form: Form; loc: PickedLocation; seen: Sighting[]; highlight: number | null; durManual: boolean; at: number }
const autosaveKey = (editId: number | null) => `dd:unsaved:${editId ?? 'new'}`;
const readAutosave = (k: string): Autosave | null => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };

export default function LogDive() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { dives, drafts, saveDive, deletePhoto, nameLang } = useStore();
  const editing: Dive | undefined = editId != null ? [...dives, ...drafts].find((d) => d.id === editId) : undefined;
  const isDraft = !!editing?.draft;

  const [form, setForm] = useState<Form>(EMPTY);
  const [durManual, setDurManual] = useState(false);
  const [loc, setLoc] = useState<PickedLocation>({ siteName: '', siteRef: null, lat: null, lon: null });
  const [seen, setSeen] = useState<Sighting[]>([]);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [buddies, setBuddies] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [saving, setSaving] = useState<null | 'save' | 'draft'>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form | 'site', string>>>({});
  const [restored, setRestored] = useState<number | null>(null);
  const [toast, setToast] = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);
  const dirty = useRef(false);
  const akey = autosaveKey(editId);

  // Prefill: unsaved edits first (if newer than the saved record), else the saved dive, else sensible carry-overs.
  useEffect(() => {
    if (hydrated.current) return;
    if (editId != null && !editing) return; // wait for the store
    hydrated.current = true;
    const auto = readAutosave(akey);
    const savedAt = editing ? Date.parse(editing.updatedAt ?? '') || 0 : 0;
    if (auto && auto.at > savedAt) {
      setForm({ ...EMPTY, ...auto.form }); setLoc(auto.loc); setSeen(auto.seen); setHighlight(auto.highlight); setDurManual(auto.durManual);
      setRestored(auto.at);
      return;
    }
    if (editing) {
      const s = (v: number | null | undefined) => (v == null ? '' : String(v));
      const derived = minutesBetween(editing.startTime, editing.endTime);
      setForm({
        date: editing.date || '', startTime: editing.startTime || '', endTime: editing.endTime || '',
        duration: s(editing.duration ?? derived), buddy: editing.buddy || '',
        startBar: s(editing.startBar), endBar: s(editing.endBar), maxDepth: s(editing.maxDepth), avgDepth: s(editing.avgDepth),
        weights: s(editing.weights), waterTemp: s(editing.waterTemp), visibility: s(editing.visibility),
        light: editing.light || '', current: editing.current || '', suit: editing.suit || '', notes: editing.notes || '',
      });
      setDurManual(editing.duration != null && editing.duration !== derived);
      setLoc({ siteName: editing.siteName || '', siteRef: editing.siteRef || null, lat: editing.lat ?? null, lon: editing.lon ?? null });
      setSeen(editing.sightings);
      setHighlight(editing.highlight ?? null);
    } else if (dives.length) {
      // divers usually repeat buddy, weights and suit
      const last = dives[dives.length - 1];
      setForm((f) => ({ ...f, buddy: last.buddy || '', weights: last.weights != null ? String(last.weights) : '', suit: last.suit || '' }));
    }
  }, [editing, dives]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave every change (debounced) so nothing is lost if the screen is left by accident.
  useEffect(() => {
    if (!hydrated.current || !dirty.current) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(akey, JSON.stringify({ form, loc, seen: seen.map(({ species, ...s }) => ({ ...s, species })), highlight, durManual, at: Date.now() } satisfies Autosave)); } catch { /* storage full / private mode */ }
    }, 400);
    return () => clearTimeout(t);
  }, [form, loc, seen, highlight, durManual, akey]);
  const touch = () => { dirty.current = true; };

  // ?species=123 from a species page
  useEffect(() => {
    const sid = Number(params.get('species'));
    if (!sid) return;
    api.get<{ cards: SpeciesCard[] }>(`/api/species/cards?ids=${sid}`).then(({ cards }) => {
      if (cards[0]) setSeen((s) => (s.some((x) => x.aphiaId === sid) ? s : [...s, { aphiaId: sid, count: 1, special: !!cards[0].suggestSpecial, species: cards[0] }]));
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

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    touch();
    setForm((f) => {
      const next = { ...f, [k]: v };
      // duration follows start/end time unless the diver typed their own
      if ((k === 'startTime' || k === 'endTime') && !durManual) {
        const m = minutesBetween(next.startTime, next.endTime);
        if (m != null) next.duration = String(m);
      }
      return next;
    });
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const setDuration = (v: string) => {
    touch();
    setDurManual(v.trim() !== '');
    setForm((f) => {
      const next = { ...f, duration: v };
      // start + duration → fill in a missing end time
      const n = Number(v);
      if (f.startTime && !f.endTime && Number.isFinite(n) && n > 0 && n < 600) {
        const [h, m] = f.startTime.split(':').map(Number);
        const t = (h * 60 + m + n) % 1440;
        next.endTime = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      }
      return next;
    });
    setErrors((e) => ({ ...e, duration: undefined }));
  };

  const toggleSpecies = (c: SpeciesCard) => {
    touch();
    setSeen((s) => (s.some((x) => x.aphiaId === c.aphiaId) ? s.filter((x) => x.aphiaId !== c.aphiaId) : [...s, { aphiaId: c.aphiaId, count: 1, special: !!c.suggestSpecial, species: c }]));
    setHighlight((h) => (h === c.aphiaId ? null : h));
  };
  const removeSpecies = (aphiaId: number) => { touch(); setSeen((x) => x.filter((y) => y.aphiaId !== aphiaId)); setHighlight((h) => (h === aphiaId ? null : h)); };
  const bump = (aphiaId: number, d: number) => { touch(); setSeen((s) => s.map((x) => (x.aphiaId === aphiaId ? { ...x, count: Math.max(1, x.count + d) } : x))); };
  const toggleSpecial = (aphiaId: number) => { touch(); setSeen((s) => s.map((x) => (x.aphiaId === aphiaId ? { ...x, special: !x.special } : x))); };

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

  /** Builds the record. A draft skips the "required" checks; numbers out of range are always flagged. */
  function validate(draft: boolean): DiveFields | null {
    const e: typeof errors = {};
    if (!draft && !loc.siteName.trim()) e.site = 'Choose where you dived';
    if (form.date && !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) e.date = 'Pick a date';
    else if (!draft && !form.date) e.date = 'Pick a date';
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
      startTime: form.startTime || null, endTime: form.endTime || null, duration: num('duration'), buddy: form.buddy.trim() || null,
      startBar: num('startBar'), endBar: num('endBar'), maxDepth: num('maxDepth'), avgDepth: num('avgDepth'),
      weights: num('weights'), waterTemp: num('waterTemp'), visibility: num('visibility'),
      light: form.light || null, current: form.current || null, suit: form.suit.trim() || null, notes: form.notes.trim() || null,
      highlight: highlight != null && seen.some((s) => s.aphiaId === highlight) ? highlight : null,
    };
    if (f.startBar != null && f.endBar != null && f.endBar > f.startBar) e.endBar = 'Higher than start air';
    if (f.avgDepth != null && f.maxDepth != null && f.avgDepth > f.maxDepth) e.avgDepth = 'Deeper than max depth';
    setErrors(e);
    return Object.keys(e).length ? null : f;
  }

  async function onSave(draft: boolean) {
    const fields = validate(draft);
    if (!fields) { setToast(draft ? 'Fix the highlighted numbers first' : 'Add the missing details, or save as a draft'); return; }
    setSaving(draft ? 'draft' : 'save');
    try {
      const { dive } = await saveDive({ id: editId ?? undefined, fields, sightings: seen, newPhotos: photos, draft });
      setPhotos([]);
      try { localStorage.removeItem(akey); } catch { /* ignore */ }
      if (draft) { setToast('Draft saved — finish it any time from your Dive Log'); nav('/log', { replace: true }); }
      else nav(`/log/${dive.id}`, { replace: true });
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const discardRestored = () => {
    try { localStorage.removeItem(akey); } catch { /* ignore */ }
    hydrated.current = false; dirty.current = false; setRestored(null);
    setForm(EMPTY); setSeen([]); setHighlight(null); setLoc({ siteName: '', siteRef: null, lat: null, lon: null });
  };

  if (editId != null && !editing) {
    return <main className="page"><div className="empty glass"><h3>Dive not found</h3><Link className="btn" to="/log">Back to your log</Link></div></main>;
  }

  const depthNum = Number(form.maxDepth.replace(',', '.'));
  const derived = minutesBetween(form.startTime, form.endTime);

  return (
    <main className="page">
      {toast}
      <div className="page-head">
        <button className="back-btn" onClick={() => nav(-1)} aria-label="Back"><Icon name="left" size={28} /></button>
        <div>
          <h1 className="page-title">{editing && !isDraft ? 'Edit Dive' : 'Log Dive'}</h1>
          <p className="page-sub">{editing && !isDraft ? `Dive #${editing.number} · ${editing.siteName}` : isDraft ? 'Finishing a draft' : 'Add a new dive to your log'}</p>
        </div>
      </div>

      {restored && (
        <div className="banner info" role="status">
          <Icon name="sync" size={18} />
          <span style={{ flex: 1 }}>Restored what you were typing ({new Date(restored).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}). Photos need re-adding.</span>
          <button className="link-caps" onClick={discardRestored}>Discard</button>
        </div>
      )}

      <div className="stack">
        <Field icon="users" label="Dive partner">
          <input list="dd-buddies" value={form.buddy} onChange={(e) => set('buddy', e.target.value)} placeholder="Who did you dive with?" style={{ fontSize: 22 }} />
          <datalist id="dd-buddies">{buddies.map((b) => <option key={b} value={b} />)}</datalist>
          <Icon name="down" size={20} className="muted" />
        </Field>

        <div className="grid2" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)' }}>
          <Field icon="calendar" label="Date" error={errors.date}>
            <input type="date" value={form.date} max={todayISO()} onChange={(e) => set('date', e.target.value)} onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* unsupported */ } }} />
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

          <Field icon="hourglass" label={durManual || derived == null ? 'Duration' : 'Duration · auto'} error={errors.duration}>
            <input type="number" inputMode="numeric" min={1} max={600} step={1} value={form.duration} onChange={(e) => setDuration(e.target.value)} placeholder="–" aria-describedby="dur-hint" />
            <span className="unit">min</span>
          </Field>
          <NumField icon="weight" label="Weight" k="weights" form={form} set={set} error={errors.weights} />
        </div>
        {durManual && derived != null && Number(form.duration) !== derived && (
          <p id="dur-hint" className="credits" style={{ margin: '-4px 4px 0' }}>
            Times give {derived} min. <button className="link-caps" onClick={() => { setDurManual(false); set('duration', String(derived)); }}>Use {derived} min</button>
          </p>
        )}

        <div className={`glass field depth-field${errors.maxDepth ? ' invalid' : ''}`}>
          <span className="ico"><Icon name="waves" size={24} /></span>
          <span className="body">
            <label className="caps" htmlFor="maxDepth">Max depth</label>
            <span className="val">
              <input id="maxDepth" type="number" inputMode="decimal" min={0} max={350} step="any" value={form.maxDepth} onChange={(e) => set('maxDepth', e.target.value)} placeholder="–" />
              <span className="unit">m</span>
            </span>
            <input className="depth-range" type="range" min={0} max={DEPTH_SLIDER_MAX} step={0.5} aria-label="Max depth slider"
              value={Number.isFinite(depthNum) ? Math.min(depthNum, DEPTH_SLIDER_MAX) : 0}
              onChange={(e) => set('maxDepth', String(Number(e.target.value)))} />
            {errors.maxDepth && <span className="field-err">{errors.maxDepth}</span>}
          </span>
        </div>

        <div className="grid2">
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
              Optional. Search by common, scientific or Hebrew name — try “Nemo”.
            </button>
          ) : (
            <>
              <div className="seen-row">
                {seen.map((s) => {
                  const c = cardOf(s.aphiaId);
                  const nm = displayName(c, nameLang);
                  const hl = highlight === s.aphiaId;
                  return (
                    <div key={s.aphiaId} className={`seen-item${hl ? ' is-highlight' : ''}`}>
                      {c && <SpeciesPhoto className="fill" species={c} sizes="132px" maxWidth={500} alt={nm} />}
                      <div className="cnt" aria-label={`${s.count} seen`}>
                        <button onClick={() => bump(s.aphiaId, -1)} aria-label="One fewer"><Icon name="minus" size={13} /></button>
                        <span style={{ minWidth: 14, textAlign: 'center' }}>{s.count}</span>
                        <button onClick={() => bump(s.aphiaId, 1)} aria-label="One more"><Icon name="plus" size={13} /></button>
                      </div>
                      <button className="x" onClick={() => removeSpecies(s.aphiaId)} aria-label={`Remove ${nm}`}><Icon name="close" size={14} /></button>
                      <div className="seen-actions">
                        <button className={s.special ? 'on special' : ''} onClick={() => toggleSpecial(s.aphiaId)} aria-pressed={!!s.special} title="Special encounter (your own judgement)"><Icon name="star" size={14} />Special</button>
                        <button className={hl ? 'on' : ''} onClick={() => { touch(); setHighlight(hl ? null : s.aphiaId); }} aria-pressed={hl} title="Feature on this dive's journal page"><Icon name="book" size={14} />Highlight</button>
                      </div>
                      <div className="nm" dir="auto">{nm}</div>
                    </div>
                  );
                })}
              </div>
              <p className="credits" style={{ margin: '6px 4px 0' }}>
                <b>Special</b> marks encounters that felt special to you (sharks, mantas, turtles and similar start starred — change it freely).
                <b> Highlight</b> picks the species shown on this dive's journal page.
              </p>
            </>
          )}
        </section>

        <section className="glass" style={{ padding: 12 }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <Icon name="camera" size={20} style={{ color: 'var(--accent)' }} />
            <span className="caps">Your photos</span>
            <span className="spacer" />
            <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="plus" size={18} />Add</button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          </div>
          {(editing?.photos.length || 0) + photos.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 14 }}>Optional. Your first photo goes on the journal page; tag one with the highlighted species to use it there.</p>}
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
            <div className="loc-thumb">{loc.lat != null ? <SatImage lat={loc.lat} lon={loc.lon!} zoom={11} alt="Satellite view of the dive site" /> : <div className="sp-noimg" style={{ position: 'static', height: '100%' }}><Icon name="globe" size={26} /></div>}</div>
            <span style={{ flex: 1, fontSize: 18, fontWeight: 500 }} dir="auto">{loc.siteName || <span className="muted">Choose dive site</span>}
              {loc.siteName && loc.lat == null && <span className="muted" style={{ display: 'block', fontSize: 13, fontWeight: 400 }}>No pin — won’t appear on your map</span>}
            </span>
            <Icon name="right" />
          </button>
          {errors.site && <div className="field-err">{errors.site}</div>}
        </section>

        <button className="btn btn-primary btn-big" onClick={() => onSave(false)} disabled={!!saving}>
          {saving === 'save' ? <span className="spinner" style={{ borderTopColor: 'var(--accent-ink)' }} /> : <Icon name="log" size={24} />} {editing && !isDraft ? 'Save Changes' : 'Save Dive'}
        </button>
        {(!editing || isDraft) && (
          <button className="btn btn-big" onClick={() => onSave(true)} disabled={!!saving} style={{ height: 50 }}>
            {saving === 'draft' ? <span className="spinner" /> : <Icon name="edit" size={18} />} Save as draft
          </button>
        )}
        <p className="credits" style={{ textAlign: 'center', margin: 0 }}>Only the site and date are needed to save. Everything else is optional{form.startTime && form.endTime ? ` · ${fmtTime(form.startTime)}–${fmtTime(form.endTime)}` : ''}.</p>
      </div>

      <Sheet open={picker} onClose={() => setPicker(false)} title="Add species" actions={seen.length ? <span className="muted" style={{ fontSize: 14 }}>{seen.length} selected</span> : null}>
        <SpeciesSearch autoFocus selected={selectedIds} onToggle={toggleSpecies} />
        {seen.length > 0 && (
          <div className="picker-confirm">
            <span dir="auto">{seen.slice(0, 3).map((s) => displayName(cardOf(s.aphiaId), nameLang)).join(', ')}{seen.length > 3 ? ` +${seen.length - 3}` : ''}</span>
            <button className="btn btn-primary" onClick={() => setPicker(false)}><Icon name="check" size={18} />Add {seen.length} to dive</button>
          </div>
        )}
      </Sheet>

      <LocationPicker open={locOpen} onClose={() => setLocOpen(false)} value={loc} onPick={(v) => { touch(); setLoc(v); setErrors((e) => ({ ...e, site: undefined })); }} />
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

function NumField({ icon, label, k, form, set, error }: { icon: IconName; label: string; k: keyof Form; form: Form; set: (k: keyof Form, v: string) => void; error?: string }) {
  const [lo, hi, unit] = LIMITS[k]!;
  return (
    <Field icon={icon} label={label} error={error}>
      <input type="number" inputMode="decimal" min={lo} max={hi} step="any" value={form[k] as string} onChange={(e) => set(k, e.target.value)} placeholder="–" />
      <span className="unit">{unit}</span>
    </Field>
  );
}
