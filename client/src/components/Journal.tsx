import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Bubbles, Ink, Seaweed, type InkName } from './JournalArt';
import { SatImage } from './MapView';
import { isBad, markBad, sourcesFor } from '../img';
import { Sheet } from './ui';
import { mergeSpecies, requestCard, useSpeciesVersion } from '../hooks';
import type { SpeciesImage } from '../types';
import type { Dive } from '../types';
import { displayName, durationMin, fmtDate, fmtTime, highlightSighting, type NameLang } from '../util';

type PageRender = () => ReactNode;

interface Props {
  dives: Dive[];
  nameLang: NameLang;
  ownerName: string;
  /** Spread index to open at (defaults to most recent dive). */
  initialIndex?: number;
  onIndexChange?: (i: number) => void;
  /** Rendered inside the full-screen reader (no expand button). */
  expanded?: boolean;
}

const FLIP_MS = 680;

export default function Journal({ dives, nameLang, ownerName, initialIndex, onIndexChange, expanded }: Props) {
  const spreads: { left: PageRender; right: PageRender; dive?: Dive }[] = dives.length
    ? dives.map((d) => ({ left: () => <LeftPage d={d} nameLang={nameLang} />, right: () => <RightPage d={d} nameLang={nameLang} />, dive: d }))
    : [{ left: () => <LeftPage d={null} nameLang={nameLang} />, right: () => <RightPage d={null} nameLang={nameLang} /> }];

  const last = spreads.length - 1;
  const [index, setIndex] = useState(() => Math.min(initialIndex ?? last, last));
  // flip: dir 1 = forward (right page turns left), -1 = back. p = progress 0..1
  const [flip, setFlip] = useState<{ dir: 1 | -1; p: number; animating: boolean } | null>(null);
  const [reader, setReader] = useState(false);
  const [finder, setFinder] = useState(false);
  const bookRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; dir: 1 | -1; width: number; moved: boolean } | null>(null);
  const done = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Jump to the newest dive when one is added.
  const count = spreads.length;
  const prevCount = useRef(count);
  useEffect(() => {
    if (count !== prevCount.current) { setIndex(Math.min(initialIndex ?? count - 1, count - 1)); prevCount.current = count; }
  }, [count, initialIndex]);
  useEffect(() => { onIndexChange?.(index); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback((dir: 1 | -1, complete: boolean) => {
    setFlip({ dir, p: complete ? 1 : 0, animating: true });
    if (done.current) clearTimeout(done.current);
    done.current = setTimeout(() => {
      if (complete) setIndex((i) => Math.max(0, Math.min(last, i + dir)));
      setFlip(null);
    }, FLIP_MS + 20);
  }, [last]);

  const go = useCallback((dir: 1 | -1) => {
    if (flip) return;
    if ((dir === 1 && index >= last) || (dir === -1 && index <= 0)) return;
    setFlip({ dir, p: 0, animating: false });
    requestAnimationFrame(() => requestAnimationFrame(() => finish(dir, true)));
  }, [flip, index, last, finish]);

  useEffect(() => {
    if (reader) return; // the reader's own journal handles keys
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [go, reader]);
  useEffect(() => () => { if (done.current) clearTimeout(done.current); }, []);

  // --- drag to turn ---
  const onPointerDown = (e: React.PointerEvent) => {
    if (flip || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('a,button')) return;
    const r = bookRef.current!.getBoundingClientRect();
    const dir: 1 | -1 = e.clientX - r.left > r.width / 2 ? 1 : -1;
    if ((dir === 1 && index >= last) || (dir === -1 && index <= 0)) return;
    drag.current = { x: e.clientX, dir, width: r.width, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 8) return;
    if (!d.moved) { d.moved = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
    const p = Math.max(0, Math.min(1, (d.dir === 1 ? -dx : dx) / (d.width * 0.85)));
    setFlip({ dir: d.dir, p, animating: false });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) { go(d.dir); return; } // a tap turns the page
    finish(d.dir, (flip?.p ?? 0) > 0.3);
  };

  // --- what is visible ---
  let staticLeft = spreads[index].left, staticRight = spreads[index].right;
  let leaf: { front: PageRender; back: PageRender; angle: number } | null = null;
  if (flip) {
    const a = flip.dir === 1 ? index : index - 1; // leaf's front = right page of spread a, back = left page of a+1
    const b = a + 1;
    if (spreads[a] && spreads[b]) {
      staticLeft = spreads[a].left;
      staticRight = spreads[b].right;
      const progress = flip.dir === 1 ? flip.p : 1 - flip.p;
      leaf = { front: spreads[a].right, back: spreads[b].left, angle: progress * 180 };
    }
  }
  const shade = leaf ? Math.sin((leaf.angle * Math.PI) / 180) : 0;
  const cur = spreads[index].dive;
  const t = flip?.animating ? `opacity ${FLIP_MS}ms` : undefined;

  return (
    <div className={`journal-wrap${expanded ? ' expanded' : ''}`}>
      <div className="journal-toolbar">
        <span className="caps">{dives.length ? `Dive ${cur?.number ?? index + 1} of ${dives.length}` : 'Your dive journal'}</span>
        <span className="row" style={{ gap: 14 }}>
          {cur && cur.id > 0 && !expanded && <Link to={`/log/${cur.id}`} className="link-caps">Open entry <Icon name="right" size={14} /></Link>}
          {dives.length > 1 && <button className="link-caps" onClick={() => setFinder(true)} aria-label="Find a dive in the journal"><Icon name="search" size={15} /> Find</button>}
          {!expanded && <button className="link-caps" onClick={() => setReader(true)} aria-label="Open the journal full screen"><Icon name="expand" size={16} /> Expand</button>}
        </span>
      </div>
      <div
        className="book"
        ref={bookRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { if (drag.current?.moved) finish(drag.current.dir, false); drag.current = null; }}
        aria-roledescription="book"
        aria-label={cur ? `Dive ${cur.number}: ${cur.siteName}` : 'Dive journal'}
      >
        <div className="book-lining">
          <div className="spread">
            <div className="page-paper left stack">{staticLeft()}</div>
            <div className="page-paper right stack">
              {staticRight()}
              {leaf && <div className="shade" style={{ background: `linear-gradient(90deg, rgba(40,25,5,${0.3 * shade}), transparent 60%)` }} />}
            </div>
            <div className="spine" />
            {leaf && (
              <div className={`leaf${flip?.animating ? ' animating' : ''}`} style={{ transform: `rotateY(${-leaf.angle}deg)` }}>
                <div className="face front page-paper right">
                  {leaf.front()}
                  <div className="shade" style={{ background: `linear-gradient(270deg, rgba(40,25,5,${0.35 * shade}), rgba(255,255,255,${0.12 * shade}) 70%)`, transition: t }} />
                </div>
                <div className="face back page-paper left">
                  {leaf.back()}
                  <div className="shade" style={{ background: `linear-gradient(90deg, rgba(40,25,5,${0.3 * shade}), transparent 70%)` }} />
                </div>
              </div>
            )}
          </div>
        </div>
        <span className="hinge top" aria-hidden="true" /><span className="hinge bottom" aria-hidden="true" />
        <button className="book-nav prev" onClick={() => go(-1)} disabled={index <= 0 || !!flip} aria-label="Previous dive"><Icon name="left" size={18} /></button>
        <button className="book-nav next" onClick={() => go(1)} disabled={index >= last || !!flip} aria-label="Next dive"><Icon name="right" size={18} /></button>
      </div>

      <DiveFinder open={finder} dives={dives} current={index} onClose={() => setFinder(false)} onPick={(i) => { setFlip(null); setIndex(i); setFinder(false); }} />
      {reader && createPortal(
        <div className="reader" role="dialog" aria-modal="true" aria-label="Dive journal">
          <button className="reader-close" onClick={() => setReader(false)} aria-label="Close"><Icon name="close" size={24} /></button>
          <Journal dives={dives} nameLang={nameLang} ownerName={ownerName} initialIndex={index} expanded
            onIndexChange={(i) => setIndex(i)} />
          {!dives.length && <Link to="/log/new" className="btn btn-primary" onClick={() => setReader(false)} style={{ marginTop: 14 }}><Icon name="plus" size={18} />Log your first dive</Link>}
        </div>,
        document.body,
      )}
      <ReaderKeys open={reader} onClose={() => setReader(false)} />
    </div>
  );
}

function ReaderKeys({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [open, onClose]);
  return null;
}

// ---------------------------------------------------------------- page parts

/** Label + ruled line with the handwritten value on it (blank line when empty) + unit. */
function Field({ icon, label, value, unit, iconStyle }: { icon?: InkName; label: string; value?: ReactNode; unit?: string; iconStyle?: CSSProperties }) {
  const empty = value == null || value === '';
  return (
    <div className="jf">
      {icon ? <Ink name={icon} style={iconStyle} /> : <span className="jf-noicon" />}
      <span className="jf-label">{label}</span>
      <span className="jf-line">{empty ? ' ' : value}</span>
      {unit && <span className="jf-unit">{unit}</span>}
    </div>
  );
}

function Tape({ style }: { style: CSSProperties }) {
  return <span className="tape" style={style} />;
}

/** A taped print. `corners` = four diagonal tapes, else one strip on top (polaroid). */
function Print({ src, srcSet, candidates, sat, alt, aspect, rotate, corners = true, polaroid, credit, className, style }: {
  src?: string | null; srcSet?: string; candidates?: SpeciesImage[]; sat?: { lat: number; lon: number; zoom: number } | null; alt: string; aspect: number; rotate: number; corners?: boolean; polaroid?: boolean;
  credit?: ReactNode; className?: string; style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const [ci, setCi] = useState(0);
  useEffect(() => { setFailed(false); setCi(0); }, [src, candidates?.[0]?.url]);
  // species photos: walk the verified list of the same species when one fails
  const pool = (candidates || []).filter((c) => !isBad(c.url));
  const cand = !src && pool.length ? pool[Math.min(ci, pool.length - 1)] : null;
  const cs = cand ? sourcesFor(cand, 1280) : null;
  if (cand) { src = cs!.src; srcSet = cs!.srcSet; }
  if (cand && credit === undefined) credit = `${cand.author ? `${cand.author.slice(0, 40)} · ` : ''}${cand.licenseLabel}`;
  const onFail = () => { if (cand) { markBad(cand.url); if (ci < pool.length - 1) { setCi(ci + 1); return; } } setFailed(true); };
  return (
    <figure className={`print${polaroid ? ' polaroid' : ''} ${className || ''}`} style={{ transform: `rotate(${rotate}deg)`, ...style }}>
      <div className="print-img" style={{ aspectRatio: aspect }}>
        {src && !failed && <img src={src} srcSet={srcSet} sizes="(min-width: 900px) 40vw, 50vw" alt={alt} draggable={false} loading="lazy" referrerPolicy="no-referrer" onError={onFail} />}
        {!src && sat && <SatImage lat={sat.lat} lon={sat.lon} zoom={sat.zoom} alt={alt} />}
        {credit && (src || sat) && !failed && <span className="print-credit">{credit}</span>}
      </div>
      {corners ? (
        <>
          <Tape style={{ top: '-0.55em', left: '-1.1em', transform: 'rotate(-38deg)' }} />
          <Tape style={{ top: '-0.55em', right: '-1.1em', transform: 'rotate(38deg)' }} />
          <Tape style={{ bottom: '-0.55em', left: '-1.1em', transform: 'rotate(38deg)' }} />
          <Tape style={{ bottom: '-0.55em', right: '-1.1em', transform: 'rotate(-38deg)' }} />
        </>
      ) : (
        <Tape style={{ top: '-0.7em', left: '50%', transform: 'translateX(-50%) rotate(-3deg)', width: '3.6em' }} />
      )}
    </figure>
  );
}

const cap = (s?: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : null);

function LeftPage({ d, nameLang }: { d: Dive | null; nameLang: NameLang }) {
  const dur = d ? durationMin(d) : null;
  const { main, polaroid } = d ? photoPlan(d) : { main: null, polaroid: null };
  const photo1 = main?.url ?? null;
  // zoom 11 keeps the coastline in frame even when the entry point is out in deep (dark) water
  const sat = !photo1 && d?.lat != null && d.lon != null ? { lat: d.lat, lon: d.lon, zoom: 11 } : null;
  const satellite = !!sat;
  useSpeciesVersion();
  useEffect(() => { d?.sightings.forEach((s) => { if (s.species && !s.species.enriched) requestCard(s.aphiaId, false); }); }, [d?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const seen = d?.sightings.filter((s) => s.species).map((s) => `${displayName(mergeSpecies(s.species!), nameLang)}${s.count > 1 ? ` ×${s.count}` : ''}`) ?? [];
  return (
    <div className="page-inner">
      <span className="j-tape-label"><Ink name="diver" style={{ width: '1.5em', height: '1.5em' }} /> Dive Log</span>
      <div className="jf jf-site">
        <Ink name="pin" />
        <span className="jf-label">Dive Site</span>
        <span className="jf-line" dir="auto">{d ? d.siteName : ' '}</span>
      </div>
      {d?.area && <div className="j-area" dir="auto">{d.area}</div>}

      <Print src={photo1} sat={sat} alt={satellite ? 'Satellite view of the dive site' : 'Dive photo'} aspect={2.25} rotate={-0.6} className="j-main"
        credit={satellite ? 'Satellite © Esri, Maxar' : undefined} />

      <div className="j-fields-left" style={d && !polaroid ? { width: '78%' } : undefined}>
        <Field icon="calendar" label="Date" value={d ? fmtDate(d.date) : null} />
        <Field icon="clock" label="Start Time" value={fmtTime(d?.startTime)} />
        <Field icon="clock" label="End Time" value={fmtTime(d?.endTime)} />
        <Field icon="hourglass" label="Duration" value={dur != null ? `${dur} min` : null} />
        <div className="j-gap" />
        <Field icon="pin" label="Max Depth" value={d?.maxDepth} unit="m" />
        <Field icon="thermo" label="Water Temp." value={d?.waterTemp} unit="°C" />
        <Field icon="eye" label="Visibility" value={d?.visibility != null ? `~ ${d.visibility}` : null} unit="m" />
        <Field icon="waves" label="Current" value={cap(d?.current)} />
      </div>

      {(polaroid || !d) && <Print src={polaroid?.url ?? null} alt={polaroid ? 'Dive photo' : 'Empty photo'} aspect={1} rotate={3.5} corners={false} polaroid className="j-polaroid" />}

      <div className="j-notes-block">
        <div className="jf jf-head"><Ink name="doc" /><span className="jf-label">Notes</span></div>
        <div className="j-ruled" dir="auto"><span>{seen.length ? `Seen: ${seen.join(', ')}` : ' '}</span></div>
      </div>

      <Seaweed style={{ right: '3%', bottom: '4%', width: '20%' }} />
      {d && <span className="j-num">#{d.number}</span>}
    </div>
  );
}

function RightPage({ d, nameLang }: { d: Dive | null; nameLang: NameLang }) {
  // "Dive Highlight": the species the diver chose (never inferred). Without one: a dive photo, else a clean page.
  useSpeciesVersion();
  const hl = d ? highlightSighting(d) : null;
  const sp = hl?.species ? mergeSpecies(hl.species) : null;
  useEffect(() => { if (hl?.species && !hl.species.enriched) requestCard(hl.aphiaId, true); }, [hl?.aphiaId]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = d ? photoPlan(d) : null;
  const ownShot = plan?.highlightOwn ?? null;
  const spare = !sp ? plan?.spare ?? null : null;
  const showPrint = !d || !!sp || !!spare;
  const weight = d?.weights != null ? d.weights : null;
  const noteChars = (d?.notes || '').length;
  const noteCap = showPrint ? 150 : 520; // roughly what fits on the ruled lines
  const continued = !!d && d.id > 0 && noteChars > noteCap;
  return (
    <div className="page-inner">
      <Field icon="people" label="Buddy / Partner" value={d?.buddy} />
      <div className="j-air">
        <Ink name="tank" style={{ width: '1.5em', height: '2.9em', gridRow: 'span 2', alignSelf: 'center' }} />
        <span className="jf-label">Start Air</span><span className="jf-line">{d?.startBar ?? ' '}</span><span className="jf-unit">bar</span>
        <span className="jf-label">End Air</span><span className="jf-line">{d?.endBar ?? ' '}</span><span className="jf-unit">bar</span>
      </div>
      <div className="j-weight"><Field icon="bag" label="Weight" value={weight} unit={`kg${d?.suit ? ` (${d.suit})` : ''}`} /></div>
      <Bubbles style={{ right: '5%', top: '3%', width: '6%' }} />
      <Seaweed style={{ right: '2%', top: '10%', width: '13%' }} />

      {showPrint && (
        <>
          <div className="jf jf-head j-sighting-head">
            <Ink name="star" />
            <span className="jf-label">Dive Highlight</span>
          </div>
          {sp && !ownShot
            ? <Print candidates={sp.images?.length ? sp.images : sp.image ? [sp.image] : []} alt={displayName(sp, nameLang)} aspect={1.75} rotate={-1.2} className="j-sighting" />
            : <Print src={ownShot?.url ?? spare?.url ?? null} alt={sp ? displayName(sp, nameLang) : spare ? 'Dive photo' : 'Empty photo'} aspect={1.75} rotate={-1.2} className="j-sighting" />}
          <div className="j-caption" dir="auto">
            {sp ? <>{displayName(sp, nameLang)}{hl?.special && <small> — special encounter</small>}</> : spare?.caption || ' '}
          </div>
        </>
      )}

      <div className={`j-notes-block grow${showPrint ? '' : ' tall'}`}>
        <div className="jf jf-head"><Ink name="doc" /><span className="jf-label">Dive Notes</span></div>
        <div className={`j-ruled ${showPrint ? 'big' : 'huge'}`} dir="auto"><span>{d?.notes || ' '}</span></div>
        {continued && <Link to={`/log/${d!.id}`} className="j-more">continued in entry ›</Link>}
      </div>

      <Seaweed style={{ right: '3%', bottom: '3%', width: '18%' }} flip />
      {d && <span className="j-num">{fmtDate(d.date, { day: 'numeric', month: 'short' })}</span>}
      {!d && <Link to="/log/new" className="btn btn-primary j-cta"><Icon name="plus" size={16} />Log your first dive</Link>}
    </div>
  );
}

/**
 * Which of the diver's own photos goes where on a spread:
 *   left print = 1st photo (else satellite view of the site);
 *   right "Dive Highlight" = the highlighted species' own tagged photo, else (no highlight) the next photo;
 *   polaroid = the next unused photo, if any.
 */
function photoPlan(d: Dive) {
  const own = [...d.photos];
  const highlightOwn = d.highlight != null ? own.find((p) => p.aphiaId === d.highlight) ?? null : null;
  const used = new Set<number>();
  const take = (p: (typeof own)[number] | null | undefined) => { if (p) used.add(p.id); return p ?? null; };
  const main = take(own.find((p) => p !== highlightOwn));
  if (highlightOwn) used.add(highlightOwn.id);
  const spare = d.highlight == null ? take(own.find((p) => !used.has(p.id))) : null;
  const polaroid = take(own.find((p) => !used.has(p.id)));
  return { main, highlightOwn, spare, polaroid };
}

/** Compact, searchable list of every journal page — jump straight to an old dive without flipping. */
function DiveFinder({ open, dives, current, onClose, onPick }: { open: boolean; dives: Dive[]; current: number; onClose: () => void; onPick: (i: number) => void }) {
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  const n = q.trim().toLowerCase();
  const rows = dives.map((d, i) => ({ d, i }))
    .filter(({ d }) => !n || [d.siteName, d.area, d.buddy, d.date, String(d.number)].some((x) => x?.toLowerCase().includes(n)))
    .reverse();
  return (
    <Sheet open={open} onClose={onClose} title="Find a dive">
      <div className="search-box" style={{ marginBottom: 10 }}>
        <Icon name="search" className="lead" size={20} />
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Site, place, buddy, date or #" aria-label="Search dives" autoFocus />
      </div>
      {rows.length === 0 && <p className="muted" style={{ textAlign: 'center' }}>No dives match “{q}”.</p>}
      <div className="finder-list">
        {rows.slice(0, 300).map(({ d, i }) => (
          <button key={d.id} className={`finder-row${i === current ? ' on' : ''}`} onClick={() => onPick(i)}>
            <span className="dive-num small">{d.number}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="finder-site" dir="auto">{d.siteName}</span>
              <span className="muted" style={{ fontSize: 13 }}>{fmtDate(d.date)}{d.area ? ` · ${d.area}` : ''}</span>
            </span>
            {i === current && <span className="caps" style={{ fontSize: 10 }}>Open</span>}
          </button>
        ))}
      </div>
      {rows.length > 300 && <p className="credits" style={{ textAlign: 'center' }}>Showing the 300 most recent matches — refine the search to narrow it down.</p>}
    </Sheet>
  );
}
