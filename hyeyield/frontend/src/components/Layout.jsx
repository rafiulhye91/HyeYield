import { useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../context/DashboardContext';
import { useInactivityLogout } from '../hooks/useInactivityLogout';
import { useTheme } from '../context/ThemeContext';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/history', label: 'History' },
  { to: '/settings', label: 'Settings' },
];

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

export default function Layout({ children }) {
  const { logout, user } = useAuth();
  const { reset } = useDashboard();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t, isDark, toggle } = useTheme();

  const handleLogout = useCallback(() => {
    logout();
    reset();
    navigate('/login');
  }, [logout, reset, navigate]);

  useInactivityLogout({ enabled: !!user, onLogout: handleLogout });

  return (
    <div style={{ minHeight: '100vh', background: t.pageBg }}>
      <nav style={{
        background: t.navBg, color: '#fff', padding: '0 20px',
        height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100, borderBottom: t.navBorder,
      }}>
        <span style={{ color: '#7eb8f7', fontWeight: 500, fontSize: '15px' }}>HyeYield</span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {NAV_LINKS.map(({ to, label }) => {
            const active = pathname === to;
            return (
              <Link key={to} to={to} style={{
                color: active ? '#fff' : '#94b8d4',
                fontSize: '12px', padding: '4px 10px',
                borderRadius: 'var(--border-radius-md)',
                background: active ? 'rgba(255,255,255,0.1)' : 'none',
                textDecoration: 'none',
              }}>{label}</Link>
            );
          })}
          <button onClick={toggle} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} style={{
            background: 'rgba(255,255,255,0.08)', border: 'none', color: '#94b8d4',
            fontSize: '12px', padding: '4px 8px', borderRadius: 'var(--border-radius-md)',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
          }}>
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button onClick={handleLogout} style={{
            background: 'none', border: 'none', color: '#f87171',
            fontSize: '12px', padding: '4px 10px',
            borderRadius: 'var(--border-radius-md)', cursor: 'pointer',
          }}>Sign out</button>
        </div>
      </nav>
      <main style={{ padding: '20px' }}>{children}</main>
    </div>
  );
}
