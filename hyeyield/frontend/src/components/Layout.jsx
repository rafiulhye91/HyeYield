import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../context/DashboardContext';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/history', label: 'History' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout({ children }) {
  const { logout } = useAuth();
  const { reset } = useDashboard();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = () => { logout(); reset(); navigate('/login'); };

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
    </div>
  );
}
