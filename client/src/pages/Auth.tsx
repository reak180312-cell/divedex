import { useRef, useState } from 'react';
import { api } from '../api';
import { Icon, Logo } from '../components/Icon';
import { useStore } from '../store';
import { importBackup } from '../core/local.js';
import type { User } from '../types';

/** First run: everything is stored on this device, so "signing up" is just choosing the name for your journal. */
export default function Auth() {
  const { setUser } = useStore();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ user: User }>('/api/auth/register', { name });
      setUser(r.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setError(null);
    try {
      await importBackup(f);
      const r = await api.get<{ user: User | null }>('/api/auth/me');
      if (r.user) setUser(r.user);
      else setError('Backup imported — now enter your name to continue.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="row" style={{ gap: 10 }}><Logo size={44} /><span className="brand-name" style={{ fontSize: 34 }}>DiveDex</span></div>
      <h1>Start your logbook</h1>
      <p className="muted" style={{ marginTop: 0 }}>Log every dive in a journal you'll love flipping through, and collect the marine life you meet. Your logbook is saved privately on this device.</p>
      <form onSubmit={submit} noValidate>
        <div><label className="caps label" htmlFor="name">Your name</label><input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" dir="auto" required /></div>
        {error && <div className="banner error"><Icon name="alert" size={18} />{error}</div>}
        <button className="btn btn-primary btn-big" disabled={busy || !name.trim()}>{busy ? <span className="spinner" /> : 'Open my logbook'}</button>
      </form>
      <div className="switch">
        Have a backup? <button onClick={() => fileRef.current?.click()} disabled={busy}>Import it</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => restore(e.target.files?.[0])} />
      </div>
    </main>
  );
}
