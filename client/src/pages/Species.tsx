import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Icon } from '../components/Icon';
import MapView, { type MapPoint } from '../components/MapView';
import { Credit, Img, LocalBadge, Sheet, SpecialMark, useToast } from '../components/ui';
import { isBad, markBad, sourcesFor } from '../img';
import { mergeSpecies, primeCard, requestPhotos, useLocalFrequency, useSpeciesVersion } from '../hooks';
import { useStore } from '../store';
import type { LocalFrequency, Photo, SpeciesImage, SpeciesProfile } from '../types';
import { displayName, fmtDate, fmtSize, resizeImage, todayISO } from '../util';

interface MySightings {
  sightings: { diveId: number; siteName: string; area: string | null; lat: number | null; lon: number | null; date: string; startTime: string | null; maxDepth: number | null; count: number }[];
  photos: Photo[];
  manual: { id: number; date: string; place: string | null; special: boolean }[];
  special: boolean;
}

export default function Species() {
  const { id } = useParams();
  const aphiaId = Number(id);
  const nav = useNavigate();
  const { nameLang, uploadPhoto, refresh } = useStore();
  const [sp, setSp] = useState<SpeciesProfile | null>(null);
  const [base, setBase] = useState<SpeciesProfile | null>(null); // quick card (names + photos) shown while the full profile loads
  const [badSlides, setBadSlides] = useState<Set<string>>(new Set());
  const [loadedSlides, setLoadedSlides] = useState<Set<string>>(new Set());
  useSpeciesVersion();
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MySightings | null>(null);
  const [slide, setSlide] = useState(0);
  const [more, setMore] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [localInfo, setLocalInfo] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    setSp(null); setBase(null); setError(null); setSlide(0);
    // 1) fast: cached card + verified photo list → page renders right away
    api.get<{ cards: SpeciesProfile[] }>(`/api/species/cards?ids=${aphiaId}`).then((r) => { if (live && r.cards[0]) { setBase(r.cards[0]); primeCard(r.cards[0]); } }).catch(() => {});
    requestPhotos(aphiaId, true);
    // 2) full profile (taxonomy, traits, distribution, Wikipedia, more photos) fills in when ready
    api.get<{ species: SpeciesProfile; partial?: boolean }>(`/api/species/${aphiaId}`)
      .then((r) => live && setSp({ ...r.species, partial: r.partial || r.species.partial }))
      .catch((e: ApiError) => live && setError(e.message));
    api.get<MySightings>(`/api/collection/${aphiaId}`).then((r) => live && setMine(r)).catch(() => live && setMine({ sightings: [], photos: [], manual: [], special: false }));
    return () => { live = false; };
  }, [aphiaId]);

  const slides: SpeciesImage[] = useMemo(() => {
    const own: SpeciesImage[] = (mine?.photos || []).map((p) => ({ id: `own-${p.id}`, source: 'You', url: p.url, license: 'own', licenseLabel: 'Your photo' }));
    const quick = base ? mergeSpecies(base) : null;
    const verified = sp?.images?.length ? sp.images : quick?.images?.length ? quick.images : quick?.image ? [quick.image] : [];
    return [...own, ...verified].filter((im) => !badSlides.has(im.url) && (im.license === 'own' || !isBad(im.url)));
  }, [mine, sp, base, badSlides]); // eslint-disable-line react-hooks/exhaustive-deps

  const points: MapPoint[] = useMemo(() => (mine?.sightings || [])
    .filter((s) => s.lat != null && s.lon != null)
    .map((s) => ({ id: `d${s.diveId}`, lat: s.lat!, lon: s.lon!, label: s.siteName, kind: 'sighting' as const })), [mine]);

  const view = sp ?? (base ? mergeSpecies(base) : null);
  if (error && !view) {
    return (
      <main className="page">
        <button className="back-btn" onClick={() => nav(-1)} aria-label="Back"><Icon name="left" /></button>
        <div className="empty glass"><Icon name="offline" size={40} /><h3>Couldn't load this species</h3><p>{error}</p></div>
      </main>
    );
  }
  if (!view) return <main className="page"><div className="hero photo" /><div className="sp-title"><div className="skeleton" style={{ height: 40, width: '60%', borderRadius: 10 }} /></div></main>;

  const name = displayName(view, nameLang);
  const altName = nameLang === 'he' ? view.nameEn : view.nameHe;
  const summary = sp ? (nameLang === 'he' ? sp.summaries?.he || sp.summaries?.en : sp.summaries?.en || sp.summaries?.he) ?? null : null;
  const areas = [...new Set((mine?.sightings || []).map((s) => s.area?.split(',')[0] || s.siteName))];
  const cur = slides[slide];
  const latest = mine?.sightings.find((s) => s.lat != null) ?? null; // newest first
  const seenCount = (mine?.sightings.length ?? 0) + (mine?.manual.length ?? 0);

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

  async function addToCollection(special: boolean) {
    try {
      await api.post('/api/collection/manual', { aphiaId, date: todayISO(), special });
      setMine(await api.get<MySightings>(`/api/collection/${aphiaId}`));
      await refresh();
      setAddOpen(false);
      setToast('Added to your collection');
    } catch (e) { setToast((e as Error).message); }
  }

  return (
    <main className="page">
      {toast}
      <section className="hero" aria-roledescription="carousel" aria-label={`Photos of ${name}`}>
        <div className="hero-track" style={{ transform: `translateX(-${slide * 100}%)` }}>
          {slides.length ? slides.map((im, i) => {
            // only the current photo and its neighbours download; large renditions are fetched only here
            const near = Math.abs(i - slide) <= 1;
            const srcs = im.license === 'own' ? { src: im.url } : sourcesFor(im, 1920);
            // progressive: the small rendition (usually already cached from the collection) shows at once
            const lowRes = im.license === 'own' ? null : sourcesFor(im, 330)?.src;
            const isLoaded = loadedSlides.has(im.url);
            return (
              <div className={`hero-slide photo${isLoaded ? ' is-loaded' : ''}`} key={im.id} style={lowRes && !isLoaded ? { backgroundImage: `url("${lowRes}")`, backgroundSize: 'cover', backgroundPosition: 'center', animation: 'none' } : undefined}>
                {near && srcs && <img src={srcs.src} srcSet={srcs.srcSet} sizes="(max-width: 520px) 100vw, 520px" alt={`${name}${im.title ? ` — ${im.title}` : ''}`}
                  decoding="async" referrerPolicy="no-referrer"
                  onLoad={() => setLoadedSlides((b) => new Set(b).add(im.url))}
                  onError={() => { if (im.license !== 'own') markBad(im.url); setBadSlides((b) => new Set(b).add(im.url)); setSlide((x) => Math.max(0, Math.min(x, slides.length - 2))); }} />}
              </div>
            );
          }) : <div className="hero-slide">{sp ? <Img src={null} alt={name} fallback={<div style={{ textAlign: 'center' }}><Icon name="camera" size={40} /><div style={{ fontSize: 14, marginTop: 6 }}>No public-domain or CC0 photo found</div></div>} /> : <div className="photo" style={{ height: '100%' }} />}</div>}
        </div>
        <button className="hero-back" onClick={() => nav(-1)}><Icon name="left" />Marine Life</button>
        {slides.length > 1 && (
          <>
            <button className="hero-arrow l" aria-label="Previous photo" onClick={() => setSlide((x) => (x - 1 + slides.length) % slides.length)}><Icon name="left" size={24} /></button>
            <button className="hero-arrow r" aria-label="Next photo" onClick={() => setSlide((x) => (x + 1) % slides.length)}><Icon name="right" size={24} /></button>
            <div className="hero-dots">{slides.slice(0, 8).map((_, i) => <i key={i} className={i === Math.min(slide, 7) ? 'on' : ''} />)}</div>
          </>
        )}
        {cur && <div className="hero-credit"><Credit img={cur} /></div>}
      </section>

      <div className="sp-title">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 dir="auto">{name}</h1>
          <div className="sci">{view.scientificName}{view.authority ? <span style={{ fontStyle: 'normal', fontSize: 13 }}> {view.authority}</span> : null}</div>
          {altName && altName !== name && <div className="muted" style={{ fontSize: 15, marginTop: 2 }}><span dir="auto">{altName}</span></div>}
        </div>
        {seenCount > 0 && (
          <div className="score-box" aria-label={`Seen ${seenCount} times`}>
            <span><b>{seenCount}</b><span className="caps">{seenCount === 1 ? 'Sighting' : 'Sightings'}</span></span>
            {mine?.special && <SpecialMark />}
          </div>
        )}
      </div>

      {sp?.partial && <div className="banner warn"><Icon name="offline" size={18} />Some sources didn't respond — showing what we have. It will complete next time you're online.</div>}

      {(sp?.alerts || []).map((a, i) => (
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
          {(mine?.sightings.length ?? 0) > 0 && <button className="link-caps" onClick={() => setShowAll((x) => !x)}>{showAll ? 'Hide' : 'View all sightings'} <Icon name="right" size={14} /></button>}
        </div>
        {mine == null ? <div className="skeleton" style={{ height: 120, borderRadius: 14 }} /> : seenCount === 0 ? (
          <div className="muted" style={{ fontSize: 15 }}>
            Not in your collection yet.
            <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
              <Link className="btn btn-primary" to={`/log/new?species=${aphiaId}`}><Icon name="plus" size={18} />Log a dive with it</Link>
              <button className="btn" onClick={() => setAddOpen(true)}>Add without a dive</button>
            </div>
          </div>
        ) : (
          <>
            {points.length > 0 && <div className="mini-map"><MapView points={points} labels={false} areaLabel={points.length ? { lat: points[0].lat, lon: points[0].lon, text: areas[0] || '' } : null} /></div>}
            {showAll && (
              <div style={{ marginTop: 10 }}>
                {mine.sightings.map((x) => (
                  <Link key={`${x.diveId}`} to={`/log/${x.diveId}`} className="dive-row" style={{ padding: '8px 4px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{x.siteName}</div>
                      <div className="muted" style={{ fontSize: 13 }}>{fmtDate(x.date)}{x.maxDepth != null ? ` · ${x.maxDepth} m` : ''}{x.count > 1 ? ` · ${x.count} individuals` : ''}</div>
                    </div>
                    <Icon name="right" size={18} />
                  </Link>
                ))}
                {mine.manual.map((x) => (
                  <div key={`m${x.id}`} className="dive-row" style={{ padding: '8px 4px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>Added without a dive</div>
                      <div className="muted" style={{ fontSize: 13 }}>{fmtDate(x.date)}{x.special ? ' · special' : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {latest && <LocalFrequencySection aphiaId={aphiaId} lat={latest.lat!} lon={latest.lon!} place={latest.area?.split(',')[0] || latest.siteName} onInfo={() => setLocalInfo(true)} />}

      <section className="glass section">
        <div className="section-head">
          <span className="ico"><Icon name="note" size={20} /></span>
          <span className="caps">About this species</span>
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          {sp ? (
            <p className="about-text" dir="auto" style={{ flex: 1, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {summary?.extract || `${sp.rank || 'Taxon'} in the family ${sp.family || '—'}${sp.groupLabel ? ` (${sp.groupLabel.toLowerCase()})` : ''}.`}
            </p>
          ) : <div style={{ flex: 1 }}><div className="skeleton" style={{ height: 14, borderRadius: 6, marginBottom: 8 }} /><div className="skeleton" style={{ height: 14, width: '70%', borderRadius: 6 }} /></div>}
          <button className="btn btn-primary" onClick={() => setMore(true)} disabled={!sp}>More <Icon name="right" size={16} /></button>
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

      {seenCount > 0 && <button className="btn btn-ghost" style={{ width: '100%', marginBottom: 8 }} onClick={() => setAddOpen(true)}><Icon name="plus" size={18} />Add another sighting without a dive</button>}

      <p className="credits">
        Taxonomy: <a href={view.wormsUrl} target="_blank" rel="noreferrer">WoRMS</a>
        {' · '}Records: <a href={`https://www.gbif.org/species/search?q=${encodeURIComponent(view.scientificName)}`} target="_blank" rel="noreferrer">GBIF</a>
        {sp?.wikidata ? <> · <a href={`https://www.wikidata.org/wiki/${sp.wikidata}`} target="_blank" rel="noreferrer">Wikidata</a></> : null}
        . Photos are shown only when their individual license is Public Domain or CC0.
      </p>

      <Sheet open={more && !!sp} onClose={() => setMore(false)} title={name}>
        {sp && <SpeciesDetails sp={sp} />}
      </Sheet>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add to your collection">
        <p className="about-text" style={{ fontSize: 15 }}>Adds <b dir="auto">{name}</b> to your collection for today, without creating a dive. Use this for animals seen while snorkelling, from a boat, or on a dive you didn't log.</p>
        <div className="stack" style={{ marginTop: 14 }}>
          <button className="btn btn-primary btn-big" onClick={() => addToCollection(false)}><Icon name="plus" />Add to collection</button>
          <button className="btn btn-big" onClick={() => addToCollection(true)}><Icon name="star" />Add as a special encounter</button>
        </div>
      </Sheet>

      <Sheet open={localInfo} onClose={() => setLocalInfo(false)} title="Local frequency">
        <p className="about-text" style={{ fontSize: 15 }}>
          This is not a rarity score. DiveDex looks at GBIF occurrence records within 100 km of where you saw this animal, and ranks it
          among the other species of its group recorded there: <b>frequently recorded</b> (most-recorded quarter), <b>occasionally recorded</b>
          (middle half), <b>rarely recorded</b> (least-recorded quarter), or <b>no nearby records</b>.
        </p>
        <p className="credits" style={{ marginTop: 10 }}>
          Records show where people look and report, not true abundance — popular, photogenic or easy-to-identify animals are recorded more.
          When an area has fewer than 300 records or 8 species of the group, it is shown as <b>Not rated</b>.
          "Special encounter" is separate: it's simply the encounters you starred yourself.
        </p>
      </Sheet>
    </main>
  );
}

function LocalFrequencySection({ aphiaId, lat, lon, place, onInfo }: { aphiaId: number; lat: number; lon: number; place: string; onInfo: () => void }) {
  const lf: LocalFrequency | null | undefined = useLocalFrequency(aphiaId, lat, lon, true);
  const band = lf?.band ?? (lf === null ? 'unrated' : undefined);
  return (
    <section className="glass section">
      <div className="section-head">
        <Icon name="layers" size={20} style={{ color: 'var(--accent)' }} />
        <span className="caps" style={{ flex: 1 }}>Near {place}</span>
        <button className="link-caps" onClick={onInfo}>How it works <Icon name="info" size={14} /></button>
      </div>
      {band === undefined ? <div className="skeleton" style={{ height: 18, width: '60%', borderRadius: 6 }} /> : (
        <>
          <div className="row" style={{ gap: 10 }}>
            {band === 'unrated' ? <span className="muted" style={{ fontWeight: 600 }}>Not rated</span> : <LocalBadge band={band} className="pill-dot big" long />}
          </div>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
            {band === 'unrated'
              ? 'Too few GBIF records of its group within 100 km to judge.'
              : band === 'none'
                ? `No GBIF records of this species within 100 km, among ${lf!.groupRecords?.toLocaleString()} records of ${lf!.groupName}.`
                : `${lf!.records?.toLocaleString()} GBIF records within ${lf!.radiusKm} km — #${lf!.rank} of ${lf!.peers} ${lf!.groupName} species recorded there.`}
          </p>
        </>
      )}
    </section>
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
