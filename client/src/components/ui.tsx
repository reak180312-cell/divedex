import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import type { LocalBand, SpeciesCard, SpeciesImage } from '../types';
import { acquireImageSlot, requestPhotos, useNearViewport } from '../hooks';
import { isBad, markBad, sourcesFor } from '../img';
import { LOCAL_META } from '../util';

export function Sheet({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          {actions}
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>,
    document.body,
  );
}

/** Image that degrades to a quiet placeholder when missing or failing to load (e.g. offline). */
export function Img({ src, srcSet, sizes, alt, className, fallback, eager }: { src?: string | null; srcSet?: string; sizes?: string; alt: string; className?: string; fallback?: ReactNode; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return <div className={`sp-noimg ${className || ''}`} role="img" aria-label={alt}>{fallback ?? <Icon name="fish" size={34} />}</div>;
  }
  return <img src={src} srcSet={srcSet} sizes={srcSet ? sizes : undefined} alt={alt} className={className} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} referrerPolicy="no-referrer" />;
}

/**
 * A species photo that
 *  - starts downloading only when near the viewport, and only when one of the global image slots is free;
 *  - asks for the species' verified photo list if it isn't known yet (fast path, separate from names);
 *  - on error moves on to the next verified photo *of the same species*, remembering broken URLs;
 *  - keeps its box size fixed (no layout shift) and fades in once decoded.
 */
export function SpeciesPhoto({ species, alt, sizes, maxWidth = 500, className, eager, fallback }: {
  species: Pick<SpeciesCard, 'aphiaId' | 'image' | 'images' | 'photosFresh'>; alt: string; sizes: string; maxWidth?: number;
  className?: string; eager?: boolean; fallback?: ReactNode;
}) {
  const [ref, near] = useNearViewport<HTMLDivElement>(eager ? 2000 : 400);
  const candidates = (species.images?.length ? species.images : species.image ? [species.image] : []).filter((i) => !isBad(i.url));
  const [idx, setIdx] = useState(0);
  const [slot, setSlot] = useState<null | (() => void)>(null);
  const [loaded, setLoaded] = useState(false);
  const cand = candidates[Math.min(idx, candidates.length)] as SpeciesImage | undefined;
  const src = cand ? sourcesFor(cand, maxWidth) : null;

  // Need the photo list? (unknown yet, or stale) — the scheduler dedupes and prioritises visible items.
  useEffect(() => { if (near && !species.photosFresh) requestPhotos(species.aphiaId, true); }, [near, species.photosFresh, species.aphiaId]);
  // Wait for a download slot before setting src; release it when the image settles.
  useEffect(() => {
    if (!near || !src || slot || loaded) return;
    let live = true, release: (() => void) | null = null;
    acquireImageSlot().then((r) => { if (live) { release = r; setSlot(() => r); } else r(); });
    return () => { live = false; release?.(); };
  }, [near, src?.src]); // eslint-disable-line react-hooks/exhaustive-deps
  const settle = () => { slot?.(); setSlot(null); };

  return (
    <div ref={ref} className={`photo ${loaded ? 'is-loaded' : ''} ${className || ''}`} role={src ? undefined : 'img'} aria-label={src ? undefined : alt}>
      {src && (slot || loaded) && (
        <img
          key={src.src} src={src.src} srcSet={src.srcSet} sizes={src.srcSet ? sizes : undefined} alt={alt}
          decoding="async" referrerPolicy="no-referrer" draggable={false}
          onLoad={() => { setLoaded(true); settle(); }}
          onError={() => { markBad(cand!.url); setLoaded(false); settle(); setIdx((i) => i + 1); }}
        />
      )}
      {!src && (species.photosFresh || candidates.length === 0 && idx > 0) && <div className="photo-none">{fallback ?? <Icon name="fish" size={30} />}</div>}
    </div>
  );
}

/** Local record frequency band. Renders nothing while loading or when the area can't be rated. */
export function LocalBadge({ band, className = 'rarity-badge', long }: { band?: LocalBand | null; className?: string; long?: boolean }) {
  if (!band || band === 'unrated') return null;
  const m = LOCAL_META[band];
  return <span className={className} title={m.label}><i style={{ background: m.color ?? undefined }} />{long ? m.label : m.short}</span>;
}

/** The diver's own "special encounter" mark. */
export function SpecialMark({ className = 'special-mark', label = true }: { className?: string; label?: boolean }) {
  return <span className={className} title="You marked this as a special encounter"><Icon name="star" size={13} strokeWidth={2.2} />{label && 'Special'}</span>;
}

export function Credit({ img, short }: { img: SpeciesImage; short?: boolean }) {
  if (img.license === 'own') return <>Your photo</>;
  const who = img.author ? img.author.slice(0, 60) : 'Unknown author';
  return (
    <>
      {short ? '' : 'Photo: '}{who} · {img.licenseLabel} ·{' '}
      {img.sourceUrl ? <a href={img.sourceUrl} target="_blank" rel="noreferrer">{img.source}</a> : img.source}
    </>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3600);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? createPortal(<div className="toast" role="status">{msg}</div>, document.body) : null;
  return [node, setMsg] as const;
}

export function Spinner({ label }: { label?: string }) {
  return <div className="row" style={{ justifyContent: 'center', padding: 24, color: 'var(--muted)' }}><div className="spinner" />{label && <span>{label}</span>}</div>;
}
