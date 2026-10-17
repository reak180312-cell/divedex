import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Img, RarityBadge, Sheet } from '../components/ui';
import { srcSetFor } from '../img';
import { useStore } from '../store';
import { useClickOutside, useEnrichedCards } from '../hooks';
import type { CollectionEntry, Rarity, SizeClass } from '../types';
import { displayName, fmtDate, fmtSize, GROUP_LABELS, RARITY_META, SIZE_META } from '../util';

type TimeKey = 'any' | '30d' | '365d' | `y${number}`;
type SortKey = 'recent' | 'rarity' | 'sightings' | 'name';

const SORTS: Record<SortKey, string> = { recent: 'Recently discovered', rarity: 'Rarest first', sightings: 'Most sighted', name: 'Name' };

export default function Collection() {
  const { collection, nameLang, loaded } = useStore();
  const items = useEnrichedCards(collection);
  const [rarity, setRarity] = useState<Rarity | null>(null);
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

  const filtered = useMemo(() => {
    const now = Date.now();
    const out = items.filter((s) => {
      if (rarity && s.rarity !== rarity) return false;
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
    const r = (s: CollectionEntry) => (s.rarity ? RARITY_META[s.rarity].order : -1);
    out.sort((a, b) =>
      sort === 'rarity' ? r(b) - r(a) || (a.gbifCount ?? 1e12) - (b.gbifCount ?? 1e12)
      : sort === 'sightings' ? b.dives - a.dives
      : sort === 'name' ? displayName(a, nameLang).localeCompare(displayName(b, nameLang))
      : b.firstSeen.localeCompare(a.firstSeen));
    return out;
  }, [items, rarity, size, group, area, time, sort, nameLang]);

  const anyFilter = rarity || size || time !== 'any' || area || group;
  const reset = () => { setRarity(null); setSize(null); setTime('any'); setArea(null); setGroup(null); };
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
        <Dropdown label={rarity ? RARITY_META[rarity].label : 'Rarity'} active={!!rarity}>
          {(close) => (
            <>
              <MenuItem on={!rarity} onClick={() => { setRarity(null); close(); }}>Any rarity</MenuItem>
              {(Object.keys(RARITY_META) as Rarity[]).map((k) => (
                <MenuItem key={k} on={rarity === k} onClick={() => { setRarity(k); close(); }}>
                  <i style={{ width: 9, height: 9, borderRadius: '50%', background: RARITY_META[k].color }} />{RARITY_META[k].label}
                </MenuItem>
              ))}
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
          {anyFilter && <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>{filtered.length} of {items.length} species</p>}
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
                  <div className="thumb"><Img src={s.image?.url} srcSet={srcSetFor(s.image)} sizes="64px" alt={displayName(s, nameLang)} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t1" dir="auto">{displayName(s, nameLang)}</div>
                    <div className="t2">{s.scientificName}</div>
                    <div className="t3">Seen on {s.dives} dive{s.dives > 1 ? 's' : ''} · first {fmtDate(s.firstSeen)}</div>
                  </div>
                  <RarityBadge rarity={s.rarity} className="pill-dot" />
                </Link>
              ))}
            </div>
          )}
          {filtered.length === 0 && items.length > 0 && (
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
          Rarity reflects how many occurrence records GBIF holds for a species worldwide (Common ≥ 100,000 · Uncommon ≥ 10,000 · Rare ≥ 1,000 · Very rare ≥ 100 · Exceptional &lt; 100).
          Size is the maximum body length recorded in WoRMS traits. Depth ranges and day/night come from your own dives.
        </p>
        <button className="btn btn-primary btn-big" style={{ marginTop: 10 }} onClick={() => setSheet(false)}>Show {filtered.length} species</button>
      </Sheet>
    </main>
  );
}

function GridCard({ s, name }: { s: CollectionEntry; name: string }) {
  const depth = s.depthMin != null && s.depthMax != null ? (s.depthMin === s.depthMax ? `${s.depthMax} m` : `${s.depthMin}–${s.depthMax} m`) : null;
  const night = s.nightDives > s.dayDives;
  return (
    <Link to={`/species/${s.aphiaId}`} className="sp-card">
      <Img src={s.image?.url} srcSet={srcSetFor(s.image)} sizes="(max-width: 520px) 50vw, 260px" alt={name} />
      <span className="sp-count" title={`Seen on ${s.dives} dive${s.dives > 1 ? 's' : ''}`}>{s.dives}</span>
      <RarityBadge rarity={s.rarity} />
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
