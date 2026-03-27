import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api/client';

const CRON_LABELS = {
  '35 9 1,15 * *': 'Every month on the 1st and 15th at 9:35 AM',
  '35 9 * * 1':    'Every Monday at 9:35 AM',
  '0 10 * * 1-5':  'Every weekday at 10:00 AM',
  '0 9 1 * *':     'Every month on the 1st at 9:00 AM',
  '35 9 15 * *':   'Every month on the 15th at 9:35 AM',
};

function cronLabel(v) {
  if (CRON_LABELS[v]) return { ok: true, text: CRON_LABELS[v] };
  if (v.trim().split(/\s+/).length === 5) return { ok: true, text: `Custom schedule (${v})` };
  return { ok: false, text: 'Invalid — must be 5 space-separated fields' };
}

function Toast({ msg, error }) {
  if (!msg) return null;
  const bg = error ? '#FEE2E2' : '#DCFCE7';
  const border = error ? '#F09595' : '#97C459';
  const color = error ? '#991B1B' : '#166534';
  return (
    <div style={{ background: bg, border: `0.5px solid ${border}`, borderRadius: 8, padding: '8px 12px', fontSize: 11, color, marginTop: 10 }}>
      {msg}
    </div>
  );
}

const s = {
  section: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, padding: '18px 20px', marginBottom: 14 },
  title: { fontSize: 14, fontWeight: 500, color: '#111827', marginBottom: 4 },
  desc: { fontSize: 12, color: '#6B7280', marginBottom: 16, lineHeight: 1.5 },
  row: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  label: { fontSize: 12, color: '#4B5563', width: 130, flexShrink: 0 },
  input: { flex: 1, padding: '7px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, fontSize: 12, background: '#fff', color: '#111827', fontFamily: 'inherit' },
  btnPrimary: { padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  btnSecondary: { padding: '7px 12px', border: '0.5px solid rgba(0,0,0,0.2)', background: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#4B5563', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  btnDanger: { padding: '7px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  infoRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  infoLabel: { fontSize: 12, color: '#6B7280', width: 130, flexShrink: 0 },
  infoVal: { fontSize: 12, color: '#111827' },
};

export default function Settings() {
  const navigate = useNavigate();

  const [ntfyTopic, setNtfyTopic] = useState('');
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [profile, setProfile] = useState(null);
  const [accountCount, setAccountCount] = useState(null);
  const [loading, setLoading] = useState(true);

  const [ntfyMsg, setNtfyMsg] = useState(null);
  const [schwabMsg, setSchwabMsg] = useState(null);
  const [pwMsg, setPwMsg] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/auth/me').then((r) => {
        setNtfyTopic(r.data.ntfy_topic || '');
        setProfile(r.data);
      }),
      api.get('/accounts').then((r) => setAccountCount(r.data.length)),
    ]).finally(() => setLoading(false));
  }, []);

  const toast = (set, msg, error = false) => {
    set({ msg, error });
    setTimeout(() => set(null), 3000);
  };

  const saveNtfy = async (e) => {
    e.preventDefault();
    try {
      await api.put('/auth/me', { ntfy_topic: ntfyTopic });
      toast(setNtfyMsg, 'ntfy topic saved.');
    } catch (err) {
      toast(setNtfyMsg, err.response?.data?.detail || 'Failed to save.', true);
    }
  };

  const sendNtfyTest = async () => {
    try {
      await api.post('/auth/ntfy-test');
      toast(setNtfyMsg, 'Test notification sent to your phone!');
    } catch (err) {
      toast(setNtfyMsg, err.response?.data?.detail || 'Failed to send test.', true);
    }
  };

  const connectSchwab = async () => {
    const payload = {};
    if (appKey) payload.app_key = appKey;
    if (appSecret) payload.app_secret = appSecret;
    const tab = window.open('', '_blank');
    try {
      if (payload.app_key || payload.app_secret) {
        await api.put('/auth/me', payload);
        setAppKey('');
        setAppSecret('');
        setProfile((p) => ({ ...p, has_schwab_credentials: true }));
      }
      const res = await api.get('/schwab/auth-url');
      tab.location.href = res.data.auth_url;
      setSchwabMsg({ msg: 'Schwab authorization opened in a new tab.', error: false });
    } catch (err) {
      tab.close();
      toast(setSchwabMsg, err.response?.data?.detail || 'Failed.', true);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/change-password', { current_password: currentPw, new_password: newPw });
      setCurrentPw('');
      setNewPw('');
      toast(setPwMsg, 'Password updated successfully.');
    } catch (err) {
      toast(setPwMsg, err.response?.data?.detail || 'Failed to update password.', true);
    }
  };

  const deleteAccount = async () => {
    const entered = prompt('Type your username to confirm account deletion:');
    if (entered === null) return;
    if (entered !== profile?.username) {
      alert('Username did not match. Account not deleted.');
      return;
    }
    try {
      await api.delete('/auth/me');
      localStorage.removeItem('token');
      navigate('/login');
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete account.');
    }
  };

  if (loading) return <Layout><p style={{ padding: 20, fontSize: 13, color: '#6B7280' }}>Loading…</p></Layout>;

  return (
    <Layout>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ fontSize: 18, fontWeight: 500, color: '#111827', marginBottom: 20 }}>Settings</div>

        {/* Push Notifications */}
        <div style={s.section}>
          <div style={s.title}>Push notifications</div>
          <div style={s.desc}>Install the ntfy app on your phone and subscribe to your topic to receive invest run alerts, token expiry warnings, and missed run notifications.</div>
          <div style={s.row}>
            <div style={s.label}>ntfy.sh topic</div>
            <input style={s.input} value={ntfyTopic} onChange={(e) => setNtfyTopic(e.target.value)} placeholder="my-hyeyield-topic" />
            <button type="button" onClick={sendNtfyTest} style={s.btnSecondary}>Send test</button>
            <button type="button" onClick={saveNtfy} style={s.btnPrimary}>Save</button>
          </div>
          <Toast {...(ntfyMsg || {})} />
        </div>

        {/* Schwab Configuration */}
        <div style={s.section}>
          <div style={s.title}>Schwab configuration</div>
          <div style={s.desc}>
            Enter your Schwab developer App Key and Secret, then connect to authorize. Leave fields blank to keep existing credentials.
            {profile?.has_schwab_connected && <span style={{ color: '#166534' }}> ✓ Connected</span>}
          </div>
          <div style={s.row}>
            <div style={s.label}>App Key</div>
            <input type="password" style={s.input} value={appKey} onChange={(e) => setAppKey(e.target.value)} placeholder={profile?.has_schwab_credentials ? '••••••••••••••••' : 'Enter App Key'} />
          </div>
          <div style={{ ...s.row, marginBottom: 14 }}>
            <div style={s.label}>App Secret</div>
            <input type="password" style={s.input} value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder={profile?.has_schwab_credentials ? '••••••••••••••••' : 'Enter App Secret'} />
          </div>
          <button type="button" onClick={connectSchwab} style={s.btnPrimary}>
            {profile?.has_schwab_connected ? 'Re-connect Schwab' : 'Connect Schwab'}
          </button>
          <Toast {...(schwabMsg || {})} />
        </div>

        {/* Change Password */}
        <div style={s.section}>
          <div style={s.title}>Change password</div>
          <div style={s.desc}>Choose a strong password of 8 or more characters.</div>
          <form onSubmit={changePassword}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Current password</div>
                <input type="password" style={{ ...s.input, flex: 'unset', width: '100%' }} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="••••••••" required />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>New password (8+ characters)</div>
                <input type="password" style={{ ...s.input, flex: 'unset', width: '100%' }} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="••••••••" required minLength={8} />
              </div>
            </div>
            <button type="submit" style={s.btnPrimary}>Update password</button>
          </form>
          <Toast {...(pwMsg || {})} />
        </div>

        {/* Account Info */}
        <div style={s.section}>
          <div style={s.title}>Account info</div>
          <div style={s.desc}>Your profile details. Contact support to change your username or email.</div>
          <div style={s.infoRow}><div style={s.infoLabel}>Username</div><div style={s.infoVal}>{profile?.username}</div></div>
          <div style={s.infoRow}><div style={s.infoLabel}>Email</div><div style={s.infoVal}>{profile?.email}</div></div>
          <div style={s.infoRow}>
            <div style={s.infoLabel}>Member since</div>
            <div style={{ ...s.infoVal, color: '#6B7280' }}>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</div>
          </div>
          <div style={s.infoRow}>
            <div style={s.infoLabel}>Schwab accounts</div>
            <div style={s.infoVal}>{accountCount !== null ? `${accountCount} linked` : '—'}</div>
          </div>
        </div>

        {/* Danger Zone */}
        <div style={{ background: '#fff', border: '0.5px solid #F09595', borderRadius: 12, padding: '18px 20px', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#A32D2D', marginBottom: 4 }}>Danger zone</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 14, lineHeight: 1.5 }}>
            Permanently deletes your account, all connected Schwab accounts, all ETF allocations, and all trade history. This action cannot be undone.
          </div>
          <button type="button" onClick={deleteAccount} style={s.btnDanger}>Delete my account</button>
        </div>
      </div>
    </Layout>
  );
}
