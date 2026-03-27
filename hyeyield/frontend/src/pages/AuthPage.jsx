import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

const fadeIn = `
  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

const FEATURES = [
  'Automated investing across your Schwab accounts.',
  'Rotation priority ensures all ETFs bought regularly',
  'Schwab API keys encrypted at rest with AES-256',
  'Push notifications after every invest run',
  'Scheduler survives server restarts automatically',
  'Dry-run mode to preview orders before placing',
];

const css = {
  body: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    background: '#F9FAFB',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    color: '#111827',
  },
  container: {
    display: 'flex',
    width: '100%',
    maxWidth: 640,
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
    transition: 'height 0.3s ease',
  },
  left: {
    width: 240,
    flexShrink: 0,
    background: '#1e3a5f',
    padding: '32px 24px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 580,
  },
  right: {
    flex: 1,
    background: '#fff',
    border: '0.5px solid rgba(0,0,0,0.1)',
    borderLeft: 'none',
    padding: '32px 28px',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    transition: 'all 0.3s ease',
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    border: '0.5px solid rgba(0,0,0,0.2)',
    borderRadius: 8,
    fontSize: 13,
    background: '#fff',
    color: '#111827',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  btnPrimary: {
    width: '100%',
    padding: 9,
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    marginTop: 4,
    fontFamily: 'inherit',
  },
};

export default function AuthPage({ initialTab = 'login' }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState(initialTab);

  // Login state
  const [lUsername, setLUsername] = useState('');
  const [lPassword, setLPassword] = useState('');
  const [lError, setLError] = useState('');
  const [lLoading, setLLoading] = useState(false);

  // Register state
  const [rUsername, setRUsername] = useState('');
  const [rEmail, setREmail] = useState('');
  const [rPassword, setRPassword] = useState('');
  const [rAppKey, setRAppKey] = useState('');
  const [rAppSecret, setRAppSecret] = useState('');
  const [rErrors, setRErrors] = useState({});
  const [rError, setRError] = useState('');
  const [rLoading, setRLoading] = useState(false);

  const switchTab = (t) => {
    setTab(t);
    setLError('');
    setRError('');
    setRErrors({});
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLError('');
    setLLoading(true);
    try {
      await login(lUsername, lPassword);
      navigate('/dashboard');
    } catch (err) {
      setLError(err.response?.data?.detail || 'Incorrect username or password.');
    } finally {
      setLLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setRError('');
    const errs = {};
    if (!rUsername || rUsername.length < 3) errs.username = 'Username must be at least 3 characters.';
    else if (!/^[a-zA-Z0-9_]+$/.test(rUsername)) errs.username = 'Letters, numbers, and underscores only.';
    if (!rEmail || !rEmail.includes('@')) errs.email = 'Please enter a valid email address.';
    if (!rPassword || rPassword.length < 8) errs.password = 'Password must be at least 8 characters.';
    if (!rAppKey) errs.app_key = 'App Key is required.';
    if (!rAppSecret) errs.app_secret = 'App Secret is required.';
    if (Object.keys(errs).length) { setRErrors(errs); return; }
    setRErrors({});

    // Open blank tab immediately (before async calls) to avoid popup blocking
    const tab = window.open('', '_blank');
    setRLoading(true);
    try {
      const res = await api.post('/auth/register', { username: rUsername, email: rEmail, password: rPassword, app_key: rAppKey, app_secret: rAppSecret });
      localStorage.setItem('token', res.data.access_token);
      const authRes = await api.get('/schwab/auth-url');
      tab.location.href = authRes.data.auth_url;
      navigate('/accounts');
    } catch (err) {
      tab.close();
      setRError(err.response?.data?.detail || 'Registration failed.');
    } finally {
      setRLoading(false);
    }
  };

  const tabStyle = (t) => ({
    padding: '8px 16px',
    fontSize: 13,
    cursor: 'pointer',
    color: tab === t ? '#185FA5' : '#6B7280',
    borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
    fontWeight: tab === t ? 500 : 400,
    marginBottom: -0.5,
    userSelect: 'none',
    background: 'none',
    border: 'none',
    borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
    fontFamily: 'inherit',
  });

  return (
    <div style={css.body}>
      <style>{fadeIn}</style>
      <div style={css.container}>

        {/* Left branding panel */}
        <div style={css.left}>
          <div style={{ color: '#7eb8f7', fontSize: 20, fontWeight: 500, marginBottom: 8 }}>HyeYield</div>
          <div style={{ color: '#94b8d4', fontSize: 11, marginBottom: 24, lineHeight: 1.5 }}>
            Automated investing across your Schwab accounts.
          </div>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: '#94b8d4', fontSize: 11, padding: '7px 0', borderBottom: i < FEATURES.length - 1 ? '0.5px solid rgba(255,255,255,0.07)' : 'none', lineHeight: 1.5 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#378ADD', marginTop: 4, flexShrink: 0 }} />
              <span>{f}</span>
            </div>
          ))}
        </div>

        {/* Right auth panel */}
        <div style={css.right}>
          <div style={{ display: 'flex', marginBottom: 24, borderBottom: '0.5px solid rgba(0,0,0,0.1)' }}>
            <button style={tabStyle('login')} onClick={() => switchTab('login')}>Sign in</button>
            <button style={tabStyle('register')} onClick={() => switchTab('register')}>Create account</button>
          </div>

          {/* Login panel */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} style={{ animation: 'fadeSlideIn 0.25s ease' }}>
              {lError && (
                <div style={{ fontSize: 12, color: '#991B1B', background: '#FEE2E2', border: '0.5px solid #F09595', padding: '8px 10px', borderRadius: 8, marginBottom: 14 }}>
                  {lError}
                </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: '#4B5563', marginBottom: 4, display: 'block' }}>Username</label>
                <input style={css.input} value={lUsername} onChange={(e) => setLUsername(e.target.value)} placeholder="your username" autoComplete="username" required />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: '#4B5563', marginBottom: 4, display: 'block' }}>Password</label>
                <input type="password" style={css.input} value={lPassword} onChange={(e) => setLPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
              </div>
              <button type="submit" style={css.btnPrimary} disabled={lLoading}>
                {lLoading ? 'Signing in…' : 'Sign in'}
              </button>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 14, textAlign: 'center', lineHeight: 1.5 }}>
                No account?{' '}
                <span style={{ color: '#2563eb', cursor: 'pointer' }} onClick={() => switchTab('register')}>Create one →</span>
              </div>
            </form>
          )}

          {/* Register panel */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} style={{ animation: 'fadeSlideIn 0.25s ease' }}>
              {rError && (
                <div style={{ fontSize: 12, color: '#991B1B', background: '#FEE2E2', border: '0.5px solid #F09595', padding: '8px 10px', borderRadius: 8, marginBottom: 14 }}>
                  {rError}
                </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: '#4B5563', marginBottom: 4, display: 'block' }}>
                  Username <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(3–30 characters, letters and numbers only)</span>
                </label>
                <input style={css.input} value={rUsername} onChange={(e) => { setRUsername(e.target.value); setRErrors((p) => ({ ...p, username: '' })); }} placeholder="choose a username" autoComplete="username" />
                {rErrors.username && <div style={{ fontSize: 11, color: '#991B1B', marginTop: 3 }}>{rErrors.username}</div>}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: '#4B5563', marginBottom: 4, display: 'block' }}>Email</label>
                <input type="email" style={css.input} value={rEmail} onChange={(e) => { setREmail(e.target.value); setRErrors((p) => ({ ...p, email: '' })); }} placeholder="you@example.com" autoComplete="email" />
                {rErrors.email && <div style={{ fontSize: 11, color: '#991B1B', marginTop: 3 }}>{rErrors.email}</div>}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: '#4B5563', marginBottom: 4, display: 'block' }}>
                  Password <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(8+ characters)</span>
                </label>
                <input type="password" style={css.input} value={rPassword} onChange={(e) => { setRPassword(e.target.value); setRErrors((p) => ({ ...p, password: '' })); }} placeholder="••••••••" autoComplete="new-password" />
                {rErrors.password && <div style={{ fontSize: 11, color: '#991B1B', marginTop: 3 }}>{rErrors.password}</div>}
              </div>
              <div style={{ background: '#F0F6FF', border: '0.5px solid #BFDBFE', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 11, color: '#1e3a5f', lineHeight: 1.6 }}>
                <strong>Before you continue:</strong>
                <ol style={{ paddingLeft: 16, marginTop: 4 }}>
                  <li>Request an App Key and Secret from the <a href="https://developer.schwab.com" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Schwab Developer Portal</a>.</li>
                  <li>Log in to your <a href="https://www.schwab.com" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Schwab account</a> and enable <strong>third-party investment access</strong> under account settings.</li>
                </ol>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: '#4B5563', marginBottom: 4, display: 'block' }}>Schwab App Key</label>
                <input style={css.input} value={rAppKey} onChange={(e) => { setRAppKey(e.target.value); setRErrors((p) => ({ ...p, app_key: '' })); }} placeholder="Your Schwab App Key" />
                {rErrors.app_key && <div style={{ fontSize: 11, color: '#991B1B', marginTop: 3 }}>{rErrors.app_key}</div>}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: '#4B5563', marginBottom: 4, display: 'block' }}>Schwab App Secret</label>
                <input type="password" style={css.input} value={rAppSecret} onChange={(e) => { setRAppSecret(e.target.value); setRErrors((p) => ({ ...p, app_secret: '' })); }} placeholder="Your Schwab App Secret" />
                {rErrors.app_secret && <div style={{ fontSize: 11, color: '#991B1B', marginTop: 3 }}>{rErrors.app_secret}</div>}
              </div>
              <button type="submit" style={css.btnPrimary} disabled={rLoading}>
                {rLoading ? 'Creating account…' : 'Create account → connect Schwab'}
              </button>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 14, textAlign: 'center', lineHeight: 1.5 }}>
                After creating your account, Schwab authorization will open automatically.<br />
                Already have an account?{' '}
                <span style={{ color: '#2563eb', cursor: 'pointer' }} onClick={() => switchTab('login')}>Sign in →</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
