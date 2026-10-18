import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ScoreBadge, Sheet, SpecialMark, SpeciesPhoto } from '../components/ui';
import { useStore } from '../store';
import { peekLocal, requestLocal, useBackgroundCards, useClickOutside, useNearViewport, useSpeciesVersion } from '../hooks';
import type { CollectionEntry, LocalBand, SizeClass } from '../types';
import { displayName, fmtDate, fmtSize, GROUP_LABELS, LOCAL_META, SIZE_META } from '../util';

type TimeKey = 'any' | '30d' | '365d' | `y${number}`;
type SortKey = 'recent' | 'score' | 'special' | 'sightings' | 'name';
type ScoreBand = '9-10' | '7-8' | '4-6' | '1-3';
const SCORE_BANDS: Record<ScoreBand, [number, number, string]> = { '9-10': [9, 10, 'Legendary · 9–10'], '7-8': [7, 8, 'Highlight · 7–8'], '4-6': [4, 6, 'Notable · 4–6'], '1-3': [1, 3, 'Everyday · 1–3'] };

const SORTS: Record<SortKey, string> = { recent: 'Recently discovered', score: 'Highest score first', special: 'Special encounters first', sightings: 'Most sighted', name: 'Name' };
const BAND_KEYS: LocalBand[] = ['frequent', 'occasional', 'rare', 'none'];

export default function Collection() {
  const { collection, nameLang, loaded } = useStore();
  const items = useBackgroundCards(collection);
  const [band, setBand] = useState<LocalBand | null>(null);
  const [special, setSpecial] = useState(false);
  const [scoreBand, setScoreBand] = useState<ScoreBand | null>(null);
  useSpeciesVersion();
  const [size, setSize] = useState<SizeClass | 'unknown' | null>(null);
  const [time, setTime] = useState<TimeKey>('any');
  const [area, setArea] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('recent');
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('dd:view') as 'grid' | 'list') || 'grid');
  const [sheet, setSheet] = useState(false);

  const years = useMemo(() => [...new Set(items.map((s) => s.firstSeen.slice(0, 4)))].sort().reverse(), [items]);
  const areas = useMemo(() => [...new Set(items.flatMap((s) => s.areas.length ? s.areas : s.sites))].sort(), [items]);
  const groups = useMemo(() => [...new Set(items.map((s) => s.group).filter(Boolean) as string[])], [items]);

  // Filtering by local frequency needs it for every species: fetch the rest in the background.
  useEffect(() => { if (band) for (const s of items) requestLocal(s.aphiaId, s.lastLat, s.lastLon, false); }, [band, items]);
  let pendingLocal = 0;

  const filtered = (() => {
    const now = Date.now();
    const out = items.filter((s) => {
      if (special && !s.special) return false;
      if (scoreBand) { const n = s.score?.score ?? 0; const [lo, hi] = SCORE_BANDS[scoreBand]; if (n < lo || n > hi) return false; }
      if (band) {
        const l = peekLocal(s.aphiaId, s.lastLat, s.lastLon);
        if (l === undefined) { pendingLocal++; return false; }
        if ((l?.band ?? 'unrated') !== band) return false;
      }
      if (size === 'unknown' ? s.sizeClass : size && s.sizeClass !== size) return false;
      if (group && s.group !== group) return false;
      if (area && !s.areas.includes(area) && !s.sites.includes(area)) return false;
      if (time !== 'any') {
        if (time.startsWith('y')) { if (!s.firstSeen.startsWith(time.slice(1))) return false; }
        else {
          const days = time === '30d' ? 30 : 365;
          if (now - new Date(s.firstSeen).getTime() > days * 86400e3) return false;
        }
      }
      return true;
    });
    out.sort((a, b) =>
      sort === 'score' ? (b.score?.score ?? 0) - (a.score?.score ?? 0) || b.lastSeen.localeCompare(a.lastSeen)
      : sort === 'special' ? Number(b.special) - Number(a.special) || b.lastSeen.localeCompare(a.lastSeen)
      : sort === 'sightings' ? (b.dives + b.manual) - (a.dives + a.manual)
      : sort === 'name' ? displayName(a, nameLang).localeCompare(displayName(b, nameLang))
      : b.firstSeen.localeCompare(a.firstSeen));
    return out;
  })();

  const anyFilter = band || scoreBand || special || size || time !== 'any' || area || group;
  const reset = () => { setBand(null); setScoreBand(null); setSpecial(false); setSize(null); setTime('any'); setArea(null); setGroup(null); };
  const setV = (v: 'grid' | 'list') => { setView(v); try { localStorage.setItem('dd:view', v); } catch { /* private mode */ } };

  const timeLabel = time === 'any' ? 'Time' : time === '30d' ? 'Last 30 days' : time === '365d' ? 'Last 12 months' : time.slice(1);

  return (
    <main className="page">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1 className="page-title">All Your Fish</h1>
          <p className="page-sub">Your marine life collection from around the world</p>
        </div>
        <button className="icon-btn glass" style={{ width: 54, height: 54, borderRadius: '50%' }} aria-label="Sort and more filters" onClick={() => setSheet(true)}>
          <Icon name="filter" size={24} />
        </button>
      </div>

      <div className="filters">
        <button className={`chip${!anyFilter ? ' active' : ''}`} onClick={reset}>All</button>
        <button className={`chip${special ? ' active' : ''}`} onClick={() => setSpecial((x) => !x)} aria-pressed={special}><Icon name="star" size={15} />Special</button>
        <Dropdown label={scoreBand ? SCORE_BANDS[scoreBand][2].split(' ·')[0] : 'Score'} active={!!scoreBand}>
          {(close) => (
            <>
              <MenuItem on={!scoreBand} onClick={() => { setScoreBand(null); close(); }}>Any score</MenuItem>
              {(Object.keys(SCORE_BANDS) as ScoreBand[]).map((k) => <MenuItem key={k} on={scoreBand === k} onClick={() => { setScoreBand(k); close(); }}>{SCORE_BANDS[k][2]}</MenuItem>)}
            </>
          )}
        </Dropdown>
        <Dropdown label={band ? LOCAL_META[band].short : 'Local'} active={!!band}>
          {(close) => (
            <>
              <MenuItem on={!band} onClick={() => { setBand(null); close(); }}>Any local frequency</MenuItem>
              {BAND_KEYS.map((k) => (
                <MenuItem key={k} on={band === k} onClick={() => { setBand(k); close(); }}>
                  <i style={{ width: 9, height: 9, borderRadius: '50%', background: LOCAL_META[k].color ?? undefined }} />{LOCAL_META[k].label}
                </MenuItem>
              ))}
              <MenuItem on={band === 'unrated'} onClick={() => { setBand('unrated'); close(); }}>Not rated (too few records)</MenuItem>
            </>
          )}
        </Dropdown>
        <Dropdown label={size ? (size === 'unknown' ? 'Size unknown' : SIZE_META[size].label) : 'Size'} active={!!size}>
          {(close) => (
            <>
              <MenuItem on={!size} onClick={() => { setSize(null); close(); }}>Any size</MenuItem>
              {(Object.keys(SIZE_META) as SizeClass[]).map((k) => (
                <MenuItem key={k} on={size === k} onClick={() => { setSize(k); close(); }}>{SIZE_META[k].label}<span className="dim" style={{ marginLeft: 'auto' }}>{SIZE_META[k].range}</span></MenuItem>
              ))}
              <MenuItem on={size === 'unknown'} onClick={() => { setSize('unknown'); close(); }}>No size data</MenuItem>
            </>
          )}
        </Dropdown>
        <Dropdown label={timeLabel} active={time !== 'any'}>
          {(close) => (
            <>
              {([['any', 'Any time'], ['30d', 'Last 30 days'], ['365d', 'Last 12 months']] as [TimeKey, string][]).map(([k, l]) => (
                <MenuItem key={k} on={time === k} onClick={() => { setTime(k); close(); }}>{l}</MenuItem>
              ))}
              {years.map((y) => <MenuItem key={y} on={time === `y${y}`} onClick={() => { setTime(`y${Number(y)}`); close(); }}>Discovered in {y}</MenuItem>)}
            </>
          )}
        </Dropdown>
        {areas.length > 0 && (
          <Dropdown label={area || 'Location'} active={!!area}>
            {(close) => (
              <>
                <MenuItem on={!area} onClick={() => { setArea(null); close(); }}>Everywhere</MenuItem>
                {areas.map((a) => <MenuItem key={a} on={area === a} onClick={() => { setArea(a); close(); }}>{a}</MenuItem>)}
              </>
            )}
          </Dropdown>
        )}
        <div className="spacer" />
        <div className="seg" role="group" aria-label="View">
          <button className={view === 'grid' ? 'on' : ''} onClick={() => setV('grid')} aria-label="Grid view" aria-pressed={view === 'grid'}><Icon name="grid" size={20} /></button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setV('list')} aria-label="List view" aria-pressed={view === 'list'}><Icon name="list" size={20} /></button>
        </div>
      </div>

      {loaded && items.length === 0 ? (
        <div className="empty glass">
          <Icon name="fish" size={44} />
          <h3>Your collection is empty</h3>
          <p>Every species you log on a dive is added here automatically.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <Link to="/log/new" className="btn btn-primary"><Icon name="plus" size={18} /> Log a dive</Link>
            <Link to="/discover" className="btn">Browse species</Link>
          </div>
        </div>
      ) : (
        <>
          {anyFilter && <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>{filtered.length} of {items.length} species{pendingLocal ? ` · checking local records for ${pendingLocal} more…` : ''}</p>}
          {view === 'grid' ? (
            <div className="sp-grid">
              {filtered.map((s) => <GridCard key={s.aphiaId} s={s} name={displayName(s, nameLang)} />)}
              <Link to="/discover" className="sp-card discover-tile">
                <div><span className="plus"><Icon name="plus" size={26} /></span>Discover More<br />Marine Life</div>
              </Link>
            </div>
          ) : (
            <div className="sp-list">
              {filtered.map((s) => (
                <Link key={s.aphiaId} to={`/species/${s.aphiaId}`} className="sp-row glass">
                  <SpeciesPhoto className="thumb" species={s} sizes="64px" maxWidth={250} alt={displayName(s, nameLang)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t1" dir="auto">{displayName(s, nameLang)}</div>
                    <div className="t2">{s.scientificName}</div>
                    <div className="t3">{seenText(s)} · first {fmtDate(s.firstSeen)}</div>
                  </div>
                  {s.special && <SpecialMark className="special-mark small" label={false} />}
                  <ScoreBadge score={s.score} className="pill-dot score-pill" />
                </Link>
              ))}
            </div>
          )}
          {filtered.length === 0 && items.length > 0 && !pendingLocal && (
            <div className="empty"><p>No species match these filters.</p><button className="btn" onClick={reset}>Clear filters</button></div>
          )}
        </>
      )}

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Sort & filter">
        <div className="caps" style={{ margin: '4px 0 8px' }}>Sort by</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(SORTS) as SortKey[]).map((k) => <button key={k} className={`chip${sort === k ? ' active' : ''}`} onClick={() => setSort(k)}>{SORTS[k]}</button>)}
        </div>
        {groups.length > 1 && (
          <>
            <div className="caps" style={{ margin: '18px 0 8px' }}>Animal group (from WoRMS taxonomy)</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button className={`chip${!group ? ' active' : ''}`} onClick={() => setGroup(null)}>All groups</button>
              {groups.map((g) => <button key={g} className={`chip${group === g ? ' active' : ''}`} onClick={() => setGroup(g)}>{GROUP_LABELS[g] || g}</button>)}
            </div>
          </>
        )}
        <p className="credits" style={{ marginTop: 20 }}>
          <b>Score</b> (1–10) is DiveDex's rating of how special most divers find an animal — mantas and whale sharks are 10, damselfish 1. It's popular opinion, not biology.
          <br /><b>Local frequency</b> ranks a species among the species of its group with GBIF records within {100} km of where you last saw it:
          frequent (top quarter), occasional (middle half), rarely recorded (bottom quarter), or no nearby records. It reflects where people
          record wildlife, not true abundance, and shows nothing when an area has too few records to judge.
          <br /><b>Special</b> marks the encounters you starred yourself. Size is the maximum body length in WoRMS; depth and day/night come from your dives.
        </p>
        <button className="btn btn-primary btn-big" style={{ marginTop: 10 }} onClick={() => setSheet(false)}>Show {filtered.length} species</button>
      </Sheet>
    </main>
  );
}

const seenText = (s: CollectionEntry) => {
  const n = s.dives + s.manual;
  return s.dives ? `Seen on ${s.dives} dive${s.dives > 1 ? 's' : ''}${s.manual ? ` + ${s.manual} more` : ''}` : `Seen ${n} time${n > 1 ? 's' : ''}`;
};

function GridCard({ s, name }: { s: CollectionEntry; name: string }) {
  const depth = s.depthMin != null && s.depthMax != null ? (s.depthMin === s.depthMax ? `${s.depthMax} m` : `${s.depthMin}–${s.depthMax} m`) : null;
  const night = s.nightDives > s.dayDives;
  const [ref] = useNearViewport<HTMLAnchorElement>(200);
  return (
    <Link ref={ref} to={`/species/${s.aphiaId}`} className="sp-card">
      <SpeciesPhoto species={s} sizes="(max-width: 520px) 46vw, 240px" maxWidth={500} alt={name} />
      <span className="sp-count" title={seenText(s)}>{s.dives + s.manual}{s.special && <SpecialMark className="special-mark" label={false} />}</span>
      <ScoreBadge score={s.score} />
      <div className="sp-foot">
        <div className="sp-name" dir="auto">{name}</div>
        <div className="sp-meta">
          {depth && <span title="Max depth of the dives you saw it on"><Icon name="waves" size={16} />{depth}</span>}
          {s.sizeCm != null && <span title="Max body length (WoRMS)"><Icon name="ruler" size={15} />{fmtSize(s.sizeCm)}</span>}
          <span title={night ? 'Mostly seen on night dives' : 'Seen on day dives'}><Icon name={night ? 'moon' : 'sun'} size={16} /></span>
        </div>
      </div>
    </Link>
  );
}

function Dropdown({ label, active, children }: { label: string; active: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside<HTMLDivElement>(close);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className={`chip${active ? ' has-value' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label}<Icon name="down" size={16} />
      </button>
      {open && <div className="menu" style={{ position: 'fixed' }} ref={(el) => {
        // position under the chip but keep inside the viewport (chips row scrolls horizontally)
        if (!el || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        el.style.top = `${r.bottom}px`;
        el.style.left = `${Math.min(r.left, window.innerWidth - el.offsetWidth - 12)}px`;
      }}>{children(close)}</div>}
    </div>
  );
}

function MenuItem({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button className={on ? 'on' : ''} onClick={onClick}>{children}{on && <Icon name="check" size={16} style={{ marginLeft: 'auto' }} />}</button>;
}
