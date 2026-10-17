import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import type { Rarity, SpeciesImage } from '../types';
import { RARITY_META } from '../util';

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

export function RarityBadge({ rarity, className = 'rarity-badge' }: { rarity?: Rarity | null; className?: string }) {
  if (!rarity) return null;
  const m = RARITY_META[rarity];
  return <span className={className}><i style={{ background: m.color, boxShadow: `0 0 6px ${m.color}` }} />{m.label}</span>;
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
