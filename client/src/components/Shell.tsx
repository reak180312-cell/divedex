import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Icon, Logo } from './Icon';
import { Sheet } from './ui';
import { useStore } from '../store';
import { displayName, fmtDate } from '../util';

export default function Shell() {
  const { user, online, collection, nameLang, loadError } = useStore();
  const [activity, setActivity] = useState(false);
  const initials = (user?.name || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  const recent = [...collection].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen)).slice(0, 5);
  const badge = online ? 0 : 1;

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="DiveDex home">
          <Logo size={36} />
          <span className="brand-name">DiveDex</span>
        </Link>
        <div className="topbar-actions">
          <button className="icon-btn" aria-label="Activity" onClick={() => setActivity(true)}>
            <Icon name="bell" size={26} />
            {badge > 0 && <span className="dot-badge">{badge}</span>}
          </button>
          <Link to="/profile" className="avatar" aria-label="Your profile">{initials}</Link>
        </div>
      </header>

      {!online && (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="banner warn"><Icon name="offline" size={18} />You're offline — your logbook works as usual; new species details load when you reconnect.</div>
        </div>
      )}
      {online && loadError && (
        <div className="page" style={{ paddingBottom: 0 }}><div className="banner warn"><Icon name="info" size={18} />{loadError}</div></div>
      )}

      <Outlet />

      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}><Icon name="home" size={27} />Home</NavLink>
        <NavLink to="/collection" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}><Icon name="fish" size={27} />Collection</NavLink>
        <NavLink to="/log" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}><Icon name="log" size={27} />Dive Log</NavLink>
        <NavLink to="/sites" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}><Icon name="sites" size={27} />Dive Sites</NavLink>
      </nav>

      <Sheet open={activity} onClose={() => setActivity(false)} title="Activity">
        <div className="stack">
          <div className="glass section row">
            <Icon name={online ? 'check' : 'offline'} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{online ? 'Online' : 'Offline'}</div>
              <div className="muted" style={{ fontSize: 14 }}>Your logbook is stored on this device. Export a backup from your profile now and then.</div>
            </div>
          </div>
          <div className="caps" style={{ marginTop: 18 }}>Latest discoveries</div>
          {recent.length === 0 && <p className="muted">Species you log will appear here.</p>}
          {recent.map((s) => (
            <Link key={s.aphiaId} to={`/species/${s.aphiaId}`} className="sp-row glass" onClick={() => setActivity(false)}>
              <div style={{ flex: 1 }}>
                <div className="t1">{displayName(s, nameLang)}</div>
                <div className="t3">First seen {fmtDate(s.firstSeen)}</div>
              </div>
              <Icon name="right" />
            </Link>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
