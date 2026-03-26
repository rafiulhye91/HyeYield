import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ fontFamily: 'sans-serif', minHeight: '100vh' }}>
      <nav style={{ background: '#1a1a2e', color: '#fff', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <strong style={{ marginRight: 'auto' }}>Hye-Yield</strong>
        <Link to="/dashboard" style={{ color: '#ccc', textDecoration: 'none' }}>Dashboard</Link>
        <Link to="/accounts" style={{ color: '#ccc', textDecoration: 'none' }}>Accounts</Link>
        <Link to="/history" style={{ color: '#ccc', textDecoration: 'none' }}>History</Link>
        <Link to="/settings" style={{ color: '#ccc', textDecoration: 'none' }}>Settings</Link>
        <span style={{ color: '#aaa', fontSize: '0.85rem' }}>{user?.username}</span>
        <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #555', color: '#ccc', cursor: 'pointer', padding: '0.25rem 0.75rem', borderRadius: '4px' }}>
          Logout
        </button>
      </nav>
      <main style={{ padding: '1.5rem' }}>
        {children}
      </main>
    </div>
  );
}
