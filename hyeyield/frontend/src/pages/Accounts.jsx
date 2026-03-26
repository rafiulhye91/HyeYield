import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const EMPTY_FORM = { account_number: '', account_name: '', account_type: 'individual', app_key: '', app_secret: '', min_order_value: 1.0, remainder_symbol: 'SNSXX' };

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [connectAccountId, setConnectAccountId] = useState(null);
  const [authUrl, setAuthUrl] = useState('');

  const load = () => api.get('/accounts').then((r) => setAccounts(r.data));
  useEffect(() => { load(); }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/accounts', { ...form, min_order_value: parseFloat(form.min_order_value) });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create account');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this account?')) return;
    await api.delete(`/accounts/${id}`);
    load();
  };

  const handleToggle = async (account) => {
    await api.put(`/accounts/${account.id}`, { enabled: !account.enabled });
    load();
  };

  const startConnect = async (id) => {
    const res = await api.get(`/schwab/auth-url?account_id=${id}`);
    setAuthUrl(res.data.auth_url);
    setConnectAccountId(id);
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    try {
      await api.post('/schwab/connect', { account_id: connectAccountId, redirect_url: redirectUrl });
      setConnectAccountId(null);
      setRedirectUrl('');
      setAuthUrl('');
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Connect failed');
    }
  };

  return (
    <Layout>
      <h2>Accounts</h2>
      <button onClick={() => setShowForm(!showForm)} style={{ marginBottom: '1rem', padding: '0.5rem 1rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
        {showForm ? 'Cancel' : '+ Add Account'}
      </button>

      {showForm && (
        <form onSubmit={handleCreate} style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '1rem', marginBottom: '1.5rem' }}>
          <h3 style={{ marginTop: 0 }}>New Account</h3>
          {[['account_number', 'Account Number'], ['account_name', 'Account Name'], ['app_key', 'App Key'], ['app_secret', 'App Secret'], ['remainder_symbol', 'Remainder Symbol']].map(([name, label]) => (
            <div key={name} style={{ marginBottom: '0.75rem' }}>
              <label>{label}</label><br />
              <input name={name} value={form[name]} onChange={handleChange} required style={{ width: '100%', padding: '0.4rem', marginTop: '0.2rem' }} />
            </div>
          ))}
          <div style={{ marginBottom: '0.75rem' }}>
            <label>Min Order Value ($)</label><br />
            <input name="min_order_value" type="number" step="0.01" value={form.min_order_value} onChange={handleChange} style={{ width: '100%', padding: '0.4rem', marginTop: '0.2rem' }} />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>Account Type</label><br />
            <select name="account_type" value={form.account_type} onChange={handleChange} style={{ padding: '0.4rem', marginTop: '0.2rem' }}>
              <option value="individual">Individual</option>
              <option value="roth_ira">Roth IRA</option>
              <option value="traditional_ira">Traditional IRA</option>
            </select>
          </div>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button type="submit" style={{ padding: '0.5rem 1rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
        </form>
      )}

      {accounts.map((a) => (
        <div key={a.id} style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '1rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <strong>{a.account_name}</strong>
            <span style={{ fontSize: '0.8rem', color: '#888' }}>{a.account_number} · {a.account_type}</span>
            <span style={{ fontSize: '0.8rem', color: a.connected ? 'green' : '#888' }}>{a.connected ? 'Connected' : 'Not connected'}</span>
            <span style={{ fontSize: '0.8rem', color: a.enabled ? 'green' : '#888' }}>{a.enabled ? 'Enabled' : 'Disabled'}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => handleToggle(a)} style={{ padding: '0.3rem 0.7rem', cursor: 'pointer' }}>{a.enabled ? 'Disable' : 'Enable'}</button>
              <button onClick={() => startConnect(a.id)} style={{ padding: '0.3rem 0.7rem', cursor: 'pointer' }}>Connect</button>
              <button onClick={() => handleDelete(a.id)} style={{ padding: '0.3rem 0.7rem', color: 'red', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      ))}

      {connectAccountId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: '2rem', borderRadius: '8px', maxWidth: '500px', width: '90%' }}>
            <h3>Connect to Schwab</h3>
            <p>1. <a href={authUrl} target="_blank" rel="noreferrer">Open Schwab authorization page</a></p>
            <p>2. After authorizing, paste the redirect URL below:</p>
            <form onSubmit={handleConnect}>
              <input value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} required placeholder="https://hyeyield.duckdns.org/redirect?code=..." style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem' }} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Connect</button>
                <button type="button" onClick={() => { setConnectAccountId(null); setAuthUrl(''); }} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
