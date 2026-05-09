import axios from 'axios';
import { getCSRFToken } from '../utils/csrf';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true, // Send httpOnly cookies with every request
});

// Request interceptor: add CSRF token to mutation requests
api.interceptors.request.use((config) => {
  // Add CSRF token for POST, PUT, DELETE, PATCH requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method?.toUpperCase())) {
    const csrfToken = getCSRFToken();
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

let isRefreshing = false;
let refreshSubscribers = [];

// Subscribe to token refresh completion
const subscribeTokenRefresh = (cb) => {
  refreshSubscribers.push(cb);
};

// Notify all subscribers when token is refreshed
const onRefreshed = () => {
  refreshSubscribers.forEach((cb) => cb());
  refreshSubscribers = [];
};

// Response interceptor: auto-refresh token on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config;

    // If 401 and we haven't already tried to refresh
    if (err.response?.status === 401 && !originalRequest._retry) {
      if (!isRefreshing) {
        isRefreshing = true;
        originalRequest._retry = true;

        try {
          // Try to refresh the token
          await api.post('/auth/refresh');
          onRefreshed();
          // Retry the original request
          return api(originalRequest);
        } catch (refreshErr) {
          // Refresh failed, redirect to login
          isRefreshing = false;
          window.location.href = '/login';
          return Promise.reject(refreshErr);
        }
      } else {
        // Another request is already refreshing, wait and retry
        return new Promise((resolve) => {
          subscribeTokenRefresh(() => {
            resolve(api(originalRequest));
          });
        });
      }
    }

    return Promise.reject(err);
  }
);

export default api;
