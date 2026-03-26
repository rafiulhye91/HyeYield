import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/client';

const FIELDS = [
  { name: 'username', label: 'Username', type: 'text' },
  { name: 'email', label: 'Email', type: 'text' },
  { name: 'password', label: 'Password', type: 'password' },
  { name: 'app_key', label: 'Schwab App Key', type: 'text' },
  { name: 'app_secret', label: 'Schwab App Secret', type: 'password' },
];

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', app_key: '', app_secret: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/register', form);
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '4rem auto', padding: '2rem', border: '1px solid #ddd', borderRadius: '8px' }}>
      <h2>Create Account</h2>
      <form onSubmit={handleSubmit}>
        {FIELDS.map(({ name, label, type }) => (
          <div key={name} style={{ marginBottom: '1rem' }}>
            <label>{label}</label><br />
            <input
              name={name}
              type={type}
              value={form[name]}
              onChange={handleChange}
              required
              style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem', boxSizing: 'border-box' }}
            />
          </div>
        ))}
        <small style={{ color: '#888', display: 'block', marginBottom: '1rem' }}>
          Find your App Key and App Secret in the <a href="https://developer.schwab.com" target="_blank" rel="noreferrer">Schwab Developer Portal</a>.
        </small>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.6rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          {loading ? 'Creating…' : 'Create Account'}
        </button>
      </form>
      <p style={{ textAlign: 'center', marginTop: '1rem' }}>
        Have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
