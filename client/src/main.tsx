import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/hebrew-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/hebrew-500.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/hebrew-600.css';
import '@fontsource/rubik/latin-700.css';
import '@fontsource/rubik/hebrew-700.css';
import '@fontsource/kalam/latin-400.css';
import '@fontsource/kalam/latin-700.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { StoreProvider, useStore } from './store';
import Shell from './components/Shell';
import Home from './pages/Home';
import Collection from './pages/Collection';
import Species from './pages/Species';
import LogDive from './pages/LogDive';
import DiveLog from './pages/DiveLog';
import DiveView from './pages/DiveView';
import Sites from './pages/Sites';
import Discover from './pages/Discover';
import Profile from './pages/Profile';
import Auth from './pages/Auth';
import { Spinner } from './components/ui';

function App() {
  const { user, booting } = useStore();
  if (booting) return <div style={{ paddingTop: '40vh' }}><Spinner /></div>;
  if (!user) return <Auth />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="collection" element={<Collection />} />
        <Route path="discover" element={<Discover />} />
        <Route path="species/:id" element={<Species />} />
        <Route path="log" element={<DiveLog />} />
        <Route path="log/new" element={<LogDive />} />
        <Route path="log/:id" element={<DiveView />} />
        <Route path="log/:id/edit" element={<LogDive />} />
        <Route path="sites" element={<Sites />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

// Keep installed copies (home-screen app) up to date: check for a new version on open, whenever the app
// comes back to the foreground, and every 30 minutes. With autoUpdate the new version activates and the page
// reloads by itself; the dive form autosaves, so nothing being typed is lost.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    setInterval(check, 30 * 60e3);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="ocean" aria-hidden="true" />
    <HashRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </HashRouter>
  </StrictMode>,
);
