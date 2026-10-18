import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Icon } from './Icon';
import { SpeciesPhoto } from './ui';
import { primeCard, useDebounced, useEnrichedCards } from '../hooks';
import { useStore } from '../store';
import type { SpeciesCard } from '../types';
import { displayName, GROUP_LABELS, isHebrew, SIZE_META, type NameLang } from '../util';

interface Props {
  /** Picker mode: toggles selection instead of navigating. */
  selected?: Set<number>;
  onToggle?: (c: SpeciesCard) => void;
  autoFocus?: boolean;
  showFilters?: boolean;
  initialQuery?: string;
}

const EXAMPLES = ['Nemo', 'lionfish', 'turtle', 'דג ליצן', 'Chaetodon', 'manta', 'octopus'];

// Completed searches are reused for 10 minutes: retyping or reopening the picker costs no requests.
const resultCache = new Map<string, { at: number; results: SpeciesCard[]; errors: string[] }>();
const CACHE_MS = 10 * 60e3;

export default function SpeciesSearch({ selected, onToggle, autoFocus, showFilters, initialQuery = '' }: Props) {
  const { nameLang, online } = useStore();
  const [q, setQ] = useState(initialQuery);
  const [group, setGroup] = useState('');
  const [size, setSize] = useState('');
  const [region, setRegion] = useState('');
  const [results, setResults] = useState<SpeciesCard[]>([]);
  const [phase, setPhase] = useState<'idle' | 'local' | 'remote' | 'done'>('idle');
  const [errors, setErrors] = useState<string[]>([]);
  const [kb, setKb] = useState(-1);
  const dq = useDebounced(q.trim(), 160);
  const dRegion = useDebounced(region.trim(), 500);
  const reqId = useRef(0);

  useEffect(() => {
    if (dq.length < 2) { setResults([]); setPhase('idle'); setErrors([]); return; }
    const id = ++reqId.current;
    const ctrl = new AbortController();
    const params = new URLSearchParams({ q: dq });
    if (group) params.set('group', group);
    if (size) params.set('size', size);
    if (dRegion) params.set('region', dRegion);
    const cached = resultCache.get(params.toString());
    if (cached && Date.now() - cached.at < CACHE_MS) {
      cached.results.forEach(primeCard);
      setResults(cached.results); setErrors(cached.errors); setPhase('done');
      return;
    }
    setPhase('local');
    // 1) instant: aliases + already-known species
    api.get<{ results: SpeciesCard[] }>(`/api/species/search?${params}&mode=local`, ctrl.signal)
      .then((r) => { if (id === reqId.current && !size && !dRegion) setResults(r.results); })
      .catch(() => {});
    // 2) full: WoRMS / Wikidata / Hebrew Wikipedia
    const t = setTimeout(() => {
      setPhase('remote');
      api.get<{ results: SpeciesCard[]; errors: string[] }>(`/api/species/search?${params}`, ctrl.signal)
        .then((r) => {
          if (!r.errors.length) resultCache.set(params.toString(), { at: Date.now(), results: r.results, errors: [] });
          if (id !== reqId.current) return;
          r.results.forEach(primeCard); setResults(r.results); setErrors(r.errors); setPhase('done');
        })
        .catch((e) => { if (id !== reqId.current || e.name === 'AbortError') return; setErrors([e.message]); setPhase('done'); });
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [dq, group, size, dRegion]);

  const shown = useEnrichedCards(results);
  useEffect(() => setKb(-1), [results]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!shown.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setKb((k) => Math.min(shown.length - 1, k + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setKb((k) => Math.max(0, k - 1)); }
    if (e.key === 'Enter' && kb >= 0 && onToggle) { e.preventDefault(); onToggle(shown[kb]); }
  };

  return (
    <div>
      <div className="search-box">
        <Icon name="search" className="lead" size={20} />
        <input
          className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
          placeholder="Common, scientific or Hebrew name…" autoFocus={autoFocus} dir={isHebrew(q) ? 'rtl' : 'ltr'}
          aria-label="Search species" autoComplete="off" spellCheck={false}
        />
        {phase === 'remote' && <span className="spinner" style={{ position: 'absolute', right: 14, top: 14 }} />}
      </div>

      {showFilters && (
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <select className="select" style={{ flex: '1 1 140px', width: 'auto' }} value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Animal group">
            <option value="">All groups</option>
            {Object.entries(GROUP_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="select" style={{ flex: '1 1 120px', width: 'auto' }} value={size} onChange={(e) => setSize(e.target.value)} aria-label="Size">
            <option value="">Any size</option>
            {Object.entries(SIZE_META).map(([k, s]) => <option key={k} value={k}>{s.label} ({s.range})</option>)}
          </select>
          <input className="input" style={{ flex: '2 1 180px', width: 'auto' }} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region, e.g. Red Sea" aria-label="Region" />
        </div>
      )}
      {showFilters && (size || dRegion) && <p className="credits" style={{ margin: '6px 2px 0' }}>Size and region filters only keep species with verified WoRMS trait / distribution records.</p>}

      {!online && <div className="banner warn" style={{ marginTop: 10 }}><Icon name="offline" size={18} />Offline — only species you've already seen or searched are available.</div>}
      {errors.length > 0 && <div className="banner info" style={{ marginTop: 10 }}><Icon name="info" size={18} />Some sources were slow or unavailable; results may be incomplete.</div>}

      {phase === 'idle' && (
        <div style={{ marginTop: 14 }}>
          <div className="caps" style={{ marginBottom: 8 }}>Try</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {EXAMPLES.map((x) => <button key={x} className="chip" onClick={() => setQ(x)} dir="auto">{x}</button>)}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10 }} role="listbox" aria-label="Species results">
        {shown.map((c, i) => <Result key={c.aphiaId} c={c} lang={nameLang} picked={selected?.has(c.aphiaId)} onToggle={onToggle} kb={i === kb} q={dq} />)}
        {phase === 'done' && shown.length === 0 && dq.length >= 2 && (
          <p className="muted" style={{ textAlign: 'center', padding: 18 }}>No marine species found for “{dq}”. Try the scientific name or a genus.</p>
        )}
      </div>
      {shown.length > 0 && <p className="credits" style={{ textAlign: 'center' }}>Names & taxonomy from WoRMS · Hebrew names via Wikidata/Wikipedia</p>}
    </div>
  );
}

function Result({ c, lang, picked, onToggle, kb, q }: { c: SpeciesCard; lang: NameLang; picked?: boolean; onToggle?: (c: SpeciesCard) => void; kb: boolean; q: string }) {
  const name = displayName(c, lang);
  const matchedOther = c.matched && ![name, c.scientificName, c.nameEn, c.nameHe].some((n) => n && n.toLowerCase() === c.matched!.toLowerCase());
  const body = (
    <>
      <SpeciesPhoto className="thumb" species={c} sizes="56px" maxWidth={250} alt={name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }} dir="auto">{name}</div>
        <div className="muted" style={{ fontSize: 13.5, fontStyle: 'italic' }}>{c.scientificName}{c.rank && c.rank !== 'Species' ? <span style={{ fontStyle: 'normal' }}> · {c.rank}</span> : null}</div>
        <div className="row" style={{ gap: 8, marginTop: 2 }}>
          {matchedOther && <span className="match-note" dir="auto">matches “{c.matched}”</span>}
          {!matchedOther && c.groupLabel && <span className="dim" style={{ fontSize: 12 }}>{c.groupLabel}</span>}
        </div>
      </div>
    </>
  );
  if (onToggle) {
    return (
      <button className={`result${kb ? ' kb' : ''}`} role="option" aria-selected={!!picked} onClick={() => onToggle(c)} title={q}>
        {body}
        <span className={`add${picked ? ' on' : ''}`}><Icon name={picked ? 'check' : 'plus'} size={18} /></span>
      </button>
    );
  }
  return <Link to={`/species/${c.aphiaId}`} className={`result${kb ? ' kb' : ''}`} role="option" aria-selected={false} style={{ color: 'inherit', textDecoration: 'none' }}>{body}<Icon name="right" size={18} className="dim" /></Link>;
}
