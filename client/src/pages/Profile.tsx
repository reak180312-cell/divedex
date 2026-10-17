import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { useToast } from '../components/ui';
import { useStore } from '../store';
import type { User } from '../types';
import { fmtDate } from '../util';
import { exportBackup, importBackup, wipeAll } from '../core/local.js';

export default function Profile() {
  const { user, setUser, dives, collection, nameLang, setNameLang, refresh } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [toast, setToast] = useToast();

  const saveName = async () => {
    try {
      const r = await api.patch<{ user: User }>('/api/auth/me', { name });
      setUser(r.user);
      setToast('Saved');
    } catch (e) { setToast((e as Error).message); }
  };

  const exportData = async () => {
    setBusy(true);
    try {
      const blob = await exportBackup();
      const file = new File([blob], `divedex-backup-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
      // On phones, offer the share sheet (save to Files / Drive / send to yourself); else download.
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'DiveDex backup' }).catch(() => {});
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    } catch (e) { setToast((e as Error).message); } finally { setBusy(false); }
  };

  const importData = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const r = await importBackup(f);
      await refresh();
      setToast(`Imported ${r.added} dive${r.added === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} already here)` : ''}`);
    } catch (e) { setToast((e as Error).message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const wipe = async () => {
    if (!confirm('Delete ALL dives, photos and your profile from this device? Export a backup first if you want to keep them.')) return;
    await wipeAll();
    location.reload();
  };

  return (
    <main className="page">
      {toast}
      <div className="page-head">
        <button className="back-btn" onClick={() => nav(-1)} aria-label="Back"><Icon name="left" size={28} /></button>
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-sub">Diving with DiveDex since {user ? fmtDate(user.createdAt.slice(0, 10), { month: 'long', year: 'numeric' }) : ''}</p>
        </div>
      </div>

      <div className="stack">
        <section className="glass section">
          <label className="caps label" htmlFor="pname">Name in your journal</label>
          <div className="row">
            <input id="pname" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} dir="auto" />
            <button className="btn" onClick={saveName} disabled={!name.trim() || name === user?.name}>Save</button>
          </div>
        </section>

        <section className="glass section">
          <div className="caps" style={{ marginBottom: 10 }}>Species names</div>
          <div className="seg" role="radiogroup" aria-label="Species name language">
            <button className={nameLang === 'en' ? 'on' : ''} onClick={() => setNameLang('en')} role="radio" aria-checked={nameLang === 'en'} style={{ padding: '0 18px' }}>English</button>
            <button className={nameLang === 'he' ? 'on' : ''} onClick={() => setNameLang('he')} role="radio" aria-checked={nameLang === 'he'} style={{ padding: '0 18px' }}>עברית</button>
          </div>
          <p className="credits" style={{ margin: '8px 0 0' }}>Where a name in the chosen language isn't recorded, the other language or the scientific name is shown. Search always accepts both.</p>
        </section>

        <section className="glass section">
          <div className="caps" style={{ marginBottom: 8 }}>Your data</div>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 14.5 }}>{dives.length} dives · {collection.length} species — stored only on this device.</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button className="btn" onClick={exportData} disabled={busy}><Icon name="external" size={18} />Export backup</button>
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}><Icon name="plus" size={18} />Import backup</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => importData(e.target.files?.[0])} />
          </div>
          <p className="credits" style={{ margin: '8px 0 0' }}>Export regularly: clearing this browser's data would erase your logbook. A backup includes your photos and can be imported on another phone or computer.</p>
        </section>

        <section className="glass section">
          <div className="caps" style={{ marginBottom: 8 }}>Data sources</div>
          <ul className="credits" style={{ margin: 0, paddingLeft: 18 }}>
            <li><a href="https://www.marinespecies.org" target="_blank" rel="noreferrer">WoRMS</a> — species names, taxonomy, synonyms, traits & distribution (CC BY 4.0)</li>
            <li><a href="https://www.gbif.org" target="_blank" rel="noreferrer">GBIF</a> — occurrence counts (rarity) and CC0 photographs</li>
            <li><a href="https://commons.wikimedia.org" target="_blank" rel="noreferrer">Wikimedia Commons</a> — Public Domain / CC0 photographs only, verified per file</li>
            <li><a href="https://www.wikidata.org" target="_blank" rel="noreferrer">Wikidata</a> & Wikipedia — Hebrew/English names and summaries (CC BY-SA)</li>
            <li><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> — dive sites and place names (ODbL)</li>
            <li>Esri World Imagery — satellite basemap</li>
          </ul>
          <p className="credits" style={{ marginTop: 8 }}>DiveDex uses no AI or image recognition — you identify species yourself.</p>
        </section>

        <button className="btn btn-danger btn-big" onClick={wipe}><Icon name="trash" />Delete all data on this device</button>
      </div>
    </main>
  );
}
