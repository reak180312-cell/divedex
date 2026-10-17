import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Icon } from '../components/Icon';
import MapView, { type MapPoint } from '../components/MapView';
import { Credit, Img, Sheet, Spinner, useToast } from '../components/ui';
import { srcSetFor } from '../img';
import { useStore } from '../store';
import type { Photo, SpeciesImage, SpeciesProfile } from '../types';
import { displayName, fmtDate, fmtSize, RARITY_META, rarityScore, resizeImage } from '../util';

interface MySightings {
  sightings: { diveId: number; siteName: string; area: string | null; lat: number | null; lon: number | null; date: string; startTime: string | null; maxDepth: number | null; count: number }[];
  photos: Photo[];
}

export default function Species() {
  const { id } = useParams();
  const aphiaId = Number(id);
  const nav = useNavigate();
  const { nameLang, uploadPhoto } = useStore();
  const [sp, setSp] = useState<SpeciesProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MySightings | null>(null);
  const [slide, setSlide] = useState(0);
  const [more, setMore] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [scoreInfo, setScoreInfo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    setSp(null); setError(null); setSlide(0);
    api.get<{ species: SpeciesProfile; partial?: boolean }>(`/api/species/${aphiaId}`)
      .then((r) => live && setSp({ ...r.species, partial: r.partial || r.species.partial }))
      .catch((e: ApiError) => live && setError(e.message));
    api.get<MySightings>(`/api/collection/${aphiaId}`).then((r) => live && setMine(r)).catch(() => live && setMine({ sightings: [], photos: [] }));
    return () => { live = false; };
  }, [aphiaId]);

  const slides: SpeciesImage[] = useMemo(() => {
    const own: SpeciesImage[] = (mine?.photos || []).map((p) => ({ id: `own-${p.id}`, source: 'You', url: p.url, license: 'own', licenseLabel: 'Your photo' }));
    const verified = sp?.images?.length ? sp.images : sp?.image ? [sp.image] : [];
    return [...own, ...verified];
  }, [mine, sp]);

  const points: MapPoint[] = useMemo(() => (mine?.sightings || [])
    .filter((s) => s.lat != null && s.lon != null)
    .map((s) => ({ id: `d${s.diveId}`, lat: s.lat!, lon: s.lon!, label: s.siteName, kind: 'sighting' as const })), [mine]);

  if (error && !sp) {
    return (
      <main className="page">
        <button className="back-btn" onClick={() => nav(-1)} aria-label="Back"><Icon name="left" /></button>
        <div className="empty glass"><Icon name="offline" size={40} /><h3>Couldn't load this species</h3><p>{error}</p></div>
      </main>
    );
  }
  if (!sp) return <main className="page"><div className="hero skeleton" /><Spinner label="Fetching from WoRMS, GBIF & Wikimedia…" /></main>;

  const name = displayName(sp, nameLang);
  const altName = nameLang === 'he' ? sp.nameEn : sp.nameHe;
  const score = rarityScore(sp.gbifCount);
  const summary = (nameLang === 'he' ? sp.summaries?.he || sp.summaries?.en : sp.summaries?.en || sp.summaries?.he) ?? null;
  const areas = [...new Set((mine?.sightings || []).map((s) => s.area?.split(',')[0] || s.siteName))];
  const cur = slides[slide];

  async function addPhoto(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const r = await resizeImage(f);
        await uploadPhoto({ ...r, aphiaId });
      }
      const r = await api.get<MySightings>(`/api/collection/${aphiaId}`);
      setMine(r); setSlide(0);
      setToast('Photo added');
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <main className="page">
      {toast}
      <section className="hero" aria-roledescription="carousel" aria-label={`Photos of ${name}`}>
        <div className="hero-track" style={{ transform: `translateX(-${slide * 100}%)` }}>
          {slides.length ? slides.map((im, i) => (
            <div className="hero-slide" key={im.id}><Img src={im.url} srcSet={srcSetFor(im)} sizes="(max-width: 520px) 100vw, 520px" alt={`${name}${im.title ? ` — ${im.title}` : ''}`} eager={i === 0} /></div>
          )) : <div className="hero-slide"><Img src={null} alt={name} fallback={<div style={{ textAlign: 'center' }}><Icon name="camera" size={40} /><div style={{ fontSize: 14, marginTop: 6 }}>No public-domain or CC0 photo found</div></div>} /></div>}
        </div>
        <button className="hero-back" onClick={() => nav(-1)}><Icon name="left" />Marine Life</button>
        {slides.length > 1 && (
          <>
            <button className="hero-arrow l" aria-label="Previous photo" onClick={() => setSlide((s) => (s - 1 + slides.length) % slides.length)}><Icon name="left" size={24} /></button>
            <button className="hero-arrow r" aria-label="Next photo" onClick={() => setSlide((s) => (s + 1) % slides.length)}><Icon name="right" size={24} /></button>
            <div className="hero-dots">{slides.slice(0, 8).map((_, i) => <i key={i} className={i === Math.min(slide, 7) ? 'on' : ''} />)}</div>
          </>
        )}
        {cur && <div className="hero-credit"><Credit img={cur} /></div>}
      </section>

      <div className="sp-title">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 dir="auto">{name}</h1>
          <div className="sci">{sp.scientificName}{sp.authority ? <span style={{ fontStyle: 'normal', fontSize: 13 }}> {sp.authority}</span> : null}</div>
          {altName && altName !== name && <div className="muted" style={{ fontSize: 15, marginTop: 2 }}><span dir="auto">{altName}</span></div>}
        </div>
        <button className="score-box" onClick={() => setScoreInfo(true)} aria-label="About the rarity score">
          <Icon name="star" size={26} style={{ color: sp.rarity ? RARITY_META[sp.rarity].color : 'var(--accent)', fill: sp.rarity ? RARITY_META[sp.rarity].color : 'var(--accent)' }} />
          <span><b>{score ?? '–'}</b> <small>/ 10</small><span className="caps">Rarity score</span></span>
        </button>
      </div>

      {sp.partial && <div className="banner warn"><Icon name="offline" size={18} />Some sources didn't respond — showing what we have. Pull again later for the full profile.</div>}

      {(sp.alerts || []).map((a, i) => (
        <div key={i} className={`alert-card ${a.kind === 'introduced' ? 'red' : a.kind === 'iucn' ? 'amber' : 'blue'}`}>
          <Icon name="alert" size={34} />
          <div style={{ flex: 1 }}>
            <div className="t">{a.title}</div>
            <p>{a.text}</p>
            {a.source && <p style={{ fontSize: 11.5, opacity: .7 }}>Source: {a.source}</p>}
          </div>
        </div>
      ))}

      <section className="glass section">
        <div className="section-head">
          <Icon name="pin" size={22} style={{ color: 'var(--accent)' }} />
          <span className="caps" style={{ flex: 1 }}>{areas.length ? `Seen in ${areas.slice(0, 2).join(' & ')}${areas.length > 2 ? ' +' : ''}` : 'Your sightings'}</span>
          {(mine?.sightings.length ?? 0) > 0 && <button className="link-caps" onClick={() => setShowAll((s) => !s)}>{showAll ? 'Hide' : 'View all sightings'} <Icon name="right" size={14} /></button>}
        </div>
        {mine == null ? <Spinner /> : mine.sightings.length === 0 ? (
          <div className="muted" style={{ fontSize: 15 }}>
            You haven't logged this species yet.
            <div style={{ marginTop: 10 }}><Link className="btn btn-primary" to={`/log/new?species=${sp.aphiaId}`}><Icon name="plus" size={18} />Log a dive with it</Link></div>
          </div>
        ) : (
          <>
            {points.length > 0 && <div className="mini-map"><MapView points={points} labels={false} areaLabel={points.length ? { lat: points[0].lat, lon: points[0].lon, text: areas[0] || '' } : null} /></div>}
            {showAll && (
              <div style={{ marginTop: 10 }}>
                {mine.sightings.map((s) => (
                  <Link key={`${s.diveId}`} to={`/log/${s.diveId}`} className="dive-row" style={{ padding: '8px 4px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{s.siteName}</div>
                      <div className="muted" style={{ fontSize: 13 }}>{fmtDate(s.date)}{s.maxDepth != null ? ` · ${s.maxDepth} m` : ''}{s.count > 1 ? ` · ${s.count} individuals` : ''}</div>
                    </div>
                    <Icon name="right" size={18} />
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="glass section">
        <div className="section-head">
          <span className="ico"><Icon name="note" size={20} /></span>
          <span className="caps">About this species</span>
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <p className="about-text" dir="auto" style={{ flex: 1, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {summary?.extract || `${sp.rank || 'Taxon'} in the family ${sp.family || '—'}${sp.groupLabel ? ` (${sp.groupLabel.toLowerCase()})` : ''}.`}
          </p>
          <button className="btn btn-primary" onClick={() => setMore(true)}>More <Icon name="right" size={16} /></button>
        </div>
        {summary && <p className="credits" style={{ margin: '8px 0 0' }}>From <a href={summary.url} target="_blank" rel="noreferrer">Wikipedia</a> · <a href={summary.licenseUrl} target="_blank" rel="noreferrer">{summary.license}</a></p>}
      </section>

      <section className="glass section">
        <div className="section-head">
          <span className="ico"><Icon name="camera" size={20} /></span>
          <span className="caps" style={{ flex: 1 }}>Your photos</span>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <span className="spinner" /> : <Icon name="plus" size={18} />}Add</button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => addPhoto(e.target.files)} />
        </div>
        {(mine?.photos.length ?? 0) === 0 ? <p className="muted" style={{ margin: 0, fontSize: 14.5 }}>Add your own shots of this species.</p> : (
          <div className="photo-strip">{mine!.photos.map((p) => <div key={p.id} className="ph"><img src={p.url} alt={`Your photo of ${name}`} loading="lazy" /></div>)}</div>
        )}
      </section>

      <p className="credits">
        Taxonomy: <a href={sp.wormsUrl} target="_blank" rel="noreferrer">WoRMS</a>
        {sp.gbifKey ? <> · Records: <a href={`https://www.gbif.org/species/${sp.gbifKey}`} target="_blank" rel="noreferrer">GBIF</a></> : null}
        {sp.wikidata ? <> · <a href={`https://www.wikidata.org/wiki/${sp.wikidata}`} target="_blank" rel="noreferrer">Wikidata</a></> : null}
        . Photos are shown only when their individual license is Public Domain or CC0.
      </p>

      <Sheet open={more} onClose={() => setMore(false)} title={name}>
        <SpeciesDetails sp={sp} />
      </Sheet>

      <Sheet open={scoreInfo} onClose={() => setScoreInfo(false)} title="Rarity score">
        <p className="about-text">
          {sp.gbifCount != null
            ? <>GBIF holds <b>{sp.gbifCount.toLocaleString()}</b> occurrence records of <i>{sp.scientificName}</i> worldwide, which puts it in the <b>{sp.rarity ? RARITY_META[sp.rarity].label : '—'}</b> tier and gives a score of <b>{score}/10</b>.</>
            : <>GBIF has no matching occurrence records for this taxon, so no score can be computed.</>}
        </p>
        <p className="credits" style={{ marginTop: 12 }}>
          The score is 10 − 1.6 × log₁₀(records + 1), clamped to 1–10. It measures how often a species is recorded, not its
          conservation status: shy, deep or hard-to-identify animals score as rarer than they may really be.
        </p>
      </Sheet>
    </main>
  );
}

function SpeciesDetails({ sp }: { sp: SpeciesProfile }) {
  const en = sp.vernaculars?.filter((v) => v.code === 'eng').map((v) => v.name) || [];
  const others = sp.vernaculars?.filter((v) => v.code !== 'eng') || [];
  const env = sp.environment ? Object.entries(sp.environment).filter(([, v]) => v).map(([k]) => k) : [];
  const native = sp.distribution?.filter((d) => !/alien|introduced/i.test(d.establishment || '')) || [];
  const introduced = sp.distribution?.filter((d) => /alien|introduced/i.test(d.establishment || '')) || [];
  return (
    <div className="stack" style={{ paddingBottom: 10 }}>
      {sp.summaries?.en && <Summary s={sp.summaries.en} />}
      {sp.summaries?.he && <Summary s={sp.summaries.he} />}
      <div>
        <div className="caps" style={{ marginBottom: 8 }}>Identification</div>
        <dl className="kv">
          <dt>Scientific name</dt><dd><i>{sp.scientificName}</i> {sp.authority}</dd>
          <dt>Rank</dt><dd>{sp.rank}</dd>
          {sp.groupLabel && <><dt>Group</dt><dd>{sp.groupLabel}</dd></>}
          {sp.nameEn && <><dt>English</dt><dd>{sp.nameEn}{en.length > 1 ? `, ${en.filter((n) => n.toLowerCase() !== sp.nameEn!.toLowerCase()).slice(0, 5).join(', ')}` : ''}</dd></>}
          {sp.nameHe && <><dt>Hebrew</dt><dd dir="rtl" style={{ textAlign: 'left' }}>{sp.nameHe}</dd></>}
          {sp.sizeCm != null && <><dt>Max length</dt><dd>{fmtSize(sp.sizeCm)}{sp.sizeRef ? <span className="dim" style={{ fontSize: 12 }}> — {sp.sizeRef.slice(0, 90)}</span> : null}</dd></>}
          {env.length > 0 && <><dt>Habitat</dt><dd style={{ textTransform: 'capitalize' }}>{env.join(', ')}</dd></>}
          {sp.extinct && <><dt>Status</dt><dd>Extinct</dd></>}
        </dl>
      </div>
      {sp.classification && sp.classification.length > 0 && (
        <div>
          <div className="caps" style={{ marginBottom: 8 }}>Classification</div>
          <div className="taxo">
            {sp.classification.filter((c) => !['Biota', 'Superdomain'].includes(c.name)).map((c, i, a) => (
              <span key={c.aphiaId}><span className="dim">{c.rank}</span> <b>{c.name}</b>{i < a.length - 1 ? ' ›' : ''}</span>
            ))}
          </div>
        </div>
      )}
      {sp.traits && sp.traits.length > 0 && (
        <div>
          <div className="caps" style={{ marginBottom: 8 }}>Traits (WoRMS)</div>
          <dl className="kv">{sp.traits.slice(0, 12).map((t, i) => <Fragment key={i}><dt>{t.type}</dt><dd>{t.value}{t.detail ? <span className="dim"> · {t.detail}</span> : null}</dd></Fragment>)}</dl>
        </div>
      )}
      {native.length > 0 && (
        <div>
          <div className="caps" style={{ marginBottom: 8 }}>Distribution ({native.length} WoRMS records)</div>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{native.slice(0, 30).map((d) => d.locality).join(' · ')}{native.length > 30 ? ' …' : ''}</p>
        </div>
      )}
      {introduced.length > 0 && (
        <div>
          <div className="caps" style={{ marginBottom: 8 }}>Introduced range</div>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{introduced.slice(0, 30).map((d) => d.locality).join(' · ')}</p>
        </div>
      )}
      {sp.synonyms && sp.synonyms.length > 0 && (
        <div>
          <div className="caps" style={{ marginBottom: 8 }}>Synonyms</div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>{sp.synonyms.slice(0, 15).map((s) => s.name).join(' · ')}</p>
        </div>
      )}
      {others.length > 0 && (
        <div>
          <div className="caps" style={{ marginBottom: 8 }}>Names in other languages</div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>{others.slice(0, 20).map((v) => `${v.name} (${v.lang})`).join(' · ')}</p>
        </div>
      )}
      {sp.images && sp.images.length > 0 && (
        <div>
          <div className="caps" style={{ marginBottom: 8 }}>Image credits</div>
          <ul className="credits" style={{ margin: 0, paddingLeft: 18 }}>
            {sp.images.map((im) => <li key={im.id}><Credit img={im} short /></li>)}
          </ul>
        </div>
      )}
      {sp.citation && <p className="credits">Cite WoRMS as: {sp.citation}</p>}
    </div>
  );
}

function Summary({ s }: { s: NonNullable<NonNullable<SpeciesProfile['summaries']>['en']> }) {
  return (
    <div dir={s.lang === 'he' ? 'rtl' : 'ltr'}>
      <p className="about-text">{s.extract}</p>
      <p className="credits" style={{ margin: '6px 0 0' }} dir="ltr">
        <a href={s.url} target="_blank" rel="noreferrer">{s.lang === 'he' ? 'Hebrew' : 'English'} Wikipedia: {s.title}</a> · <a href={s.licenseUrl} target="_blank" rel="noreferrer">{s.license}</a>
      </p>
    </div>
  );
}
