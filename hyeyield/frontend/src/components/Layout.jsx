import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../context/DashboardContext';
import { useInactivityLogout } from '../hooks/useInactivityLogout';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/history', label: 'History' },
  { to: '/settings', label: 'Settings' },
];

const WARNING_SECS = 60;

function InactivityWarning({ secondsLeft, onStay }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{
        background: '#1e293b', borderRadius: 12, padding: '32px 28px',
        width: 340, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏱</div>
        <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 17, marginBottom: 8 }}>
          Still there?
        </div>
        <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
          You'll be logged out in{' '}
          <span style={{ color: '#f87171', fontWeight: 700 }}>{secondsLeft}s</span>
          {' '}due to inactivity.
        </div>
        <button onClick={onStay} style={{
          width: '100%', padding: '10px 0', borderRadius: 8,
          background: '#2563eb', color: '#fff', border: 'none',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          Stay logged in
        </button>
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const { logout, user } = useAuth();
  const { reset } = useDashboard();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_SECS);

  const handleLogout = useCallback(() => {
    setShowWarning(false);
    logout();
    reset();
    navigate('/login');
  }, [logout, reset, navigate]);

  const handleWarn = useCallback(() => {
    setSecondsLeft(WARNING_SECS);
    setShowWarning(true);
  }, []);

  const { reset: resetTimer } = useInactivityLogout({
    enabled: !!user,
    onWarn: handleWarn,
    onLogout: handleLogout,
  });

  // Countdown tick while warning is visible
  useEffect(() => {
    if (!showWarning) return;
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [showWarning, secondsLeft]);

  const handleStay = () => {
    setShowWarning(false);
    resetTimer();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)' }}>
      <nav style={{
        background: '#1e3a5f', color: '#fff', padding: '0 20px',
        height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
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
          <button onClick={handleLogout} style={{
            background: 'none', border: 'none', color: '#f87171',
            fontSize: '12px', padding: '4px 10px',
            borderRadius: 'var(--border-radius-md)', cursor: 'pointer',
          }}>Sign out</button>
        </div>
      </nav>
      <main style={{ padding: '20px' }}>{children}</main>
      {showWarning && (
        <InactivityWarning secondsLeft={secondsLeft} onStay={handleStay} />
      )}
    </div>
  );
}
