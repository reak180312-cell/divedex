import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { CollectionEntry, Dive, DiveFields, Photo, Sighting, User } from './types';
import type { NameLang } from './util';

export interface NewPhoto { key: string; blob: Blob; width: number; height: number; aphiaId: number | null; caption?: string | null; preview: string }

interface Store {
  user: User | null;
  booting: boolean;
  setUser: (u: User | null) => void;
  dives: Dive[];
  collection: CollectionEntry[];
  loaded: boolean;
  loadError: string | null;
  online: boolean;
  refresh: () => Promise<void>;
  saveDive: (input: { id?: number; fields: DiveFields; sightings: Sighting[]; newPhotos: NewPhoto[] }) => Promise<{ dive: Dive }>;
  deleteDive: (id: number) => Promise<void>;
  deletePhoto: (id: number) => Promise<void>;
  uploadPhoto: (p: { blob: Blob; width: number; height: number; diveId?: number | null; aphiaId?: number | null; caption?: string | null }) => Promise<Photo>;
  nameLang: NameLang;
  setNameLang: (l: NameLang) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [dives, setDives] = useState<Dive[]>([]);
  const [collection, setCollection] = useState<CollectionEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    api.get<{ user: User | null }>('/api/auth/me').then((r) => setUser(r.user)).catch(() => {}).finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([api.get<{ dives: Dive[] }>('/api/dives'), api.get<{ species: CollectionEntry[] }>('/api/collection')]);
      setDives(d.dives);
      setCollection(c.species);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  // Species details load in the background after a dive is saved; pick them up a little later.
  const refreshSoon = useCallback(() => { setTimeout(refresh, 4000); setTimeout(refresh, 12000); }, [refresh]);

  const uploadPhoto: Store['uploadPhoto'] = useCallback(async ({ blob, width, height, diveId, aphiaId, caption }) => {
    const fd = new FormData();
    fd.append('file', blob, 'photo.jpg');
    if (diveId) fd.append('diveId', String(diveId));
    if (aphiaId) fd.append('aphiaId', String(aphiaId));
    if (width) fd.append('width', String(width));
    if (height) fd.append('height', String(height));
    if (caption) fd.append('caption', caption);
    return (await api.post<{ photo: Photo }>('/api/photos', fd)).photo;
  }, []);

  const saveDive: Store['saveDive'] = useCallback(async ({ id, fields, sightings, newPhotos }) => {
    const body = { ...fields, sightings: sightings.map((s) => ({ aphiaId: s.aphiaId, count: s.count })) };
    const { dive } = id ? await api.put<{ dive: Dive }>(`/api/dives/${id}`, body) : await api.post<{ dive: Dive }>('/api/dives', body);
    for (const p of newPhotos) await uploadPhoto({ ...p, diveId: dive.id });
    await refresh();
    refreshSoon();
    return { dive };
  }, [uploadPhoto, refresh, refreshSoon]);

  const deleteDive = useCallback(async (id: number) => { await api.del(`/api/dives/${id}`); await refresh(); }, [refresh]);
  const deletePhoto = useCallback(async (id: number) => { await api.del(`/api/photos/${id}`); await refresh(); }, [refresh]);

  const nameLang: NameLang = user?.prefs?.nameLang === 'he' ? 'he' : 'en';
  const setNameLang = useCallback((l: NameLang) => {
    setUser((u) => (u ? { ...u, prefs: { ...u.prefs, nameLang: l } } : u));
    api.patch('/api/auth/me', { prefs: { nameLang: l } }).catch(() => {});
  }, []);

  const value: Store = useMemo(() => ({
    user, booting, setUser, dives, collection, loaded, loadError, online,
    refresh, saveDive, deleteDive, deletePhoto, uploadPhoto, nameLang, setNameLang,
  }), [user, booting, dives, collection, loaded, loadError, online, refresh, saveDive, deleteDive, deletePhoto, uploadPhoto, nameLang, setNameLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
