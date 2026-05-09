import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Verify authentication on mount using httpOnly cookie
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        const res = await api.get('/auth/me');
        setUser(res.data);
      } catch {
        // Not authenticated, token cookie is invalid/expired
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    verifyAuth();
  }, []);

  const login = async (username, password) => {
    // Token is returned as httpOnly cookie, not in JSON
    await api.post('/auth/login', { username, password });
    // Fetch user info to verify login worked
    const res = await api.get('/auth/me');
    setUser(res.data);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Logout may fail, but we still clear local state
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
