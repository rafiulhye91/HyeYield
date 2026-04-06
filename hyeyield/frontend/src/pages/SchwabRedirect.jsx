import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function SchwabRedirect() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('Connecting to Schwab…');

  useEffect(() => {
    const fullUrl = window.location.href;
    api.post('/schwab/connect', { redirect_url: fullUrl })
      .then(() => {
        setStatus('Connected! Redirecting…');
        setTimeout(() => navigate('/dashboard'), 1500);
      })
      .catch((err) => {
        setStatus(err.response?.data?.detail || 'Connection failed. Please try again.');
      });
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem', fontFamily: 'sans-serif' }}>
      <p style={{ fontSize: '1.1rem', color: '#1a1a2e' }}>{status}</p>
    </div>
  );
}
