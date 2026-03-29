import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DashboardProvider } from './context/DashboardContext';
import { ThemeProvider } from './context/ThemeContext';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import History from './pages/History';
import Settings from './pages/Settings';
import SchwabRedirect from './pages/SchwabRedirect';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <DashboardProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><AuthPage initialTab="login" /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><AuthPage initialTab="register" /></PublicRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/accounts" element={<ProtectedRoute><Accounts /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/redirect" element={<ProtectedRoute><SchwabRedirect /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      </DashboardProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}
