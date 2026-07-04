import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // One-time migration: the old per-device Smart Capture routing preference
  // becomes the server-side ai_mode ('always_inbox' → assisted, 'auto_route'
  // → auto). The key is removed only on success, so a failed request retries
  // on the next load.
  useEffect(() => {
    if (!user?.id) return;
    const legacy = localStorage.getItem('smart_capture_routing');
    if (!legacy) return;
    const mode = legacy === 'always_inbox' ? 'assisted' : 'auto';
    api.preferences.setAiMode(mode)
      .then(() => {
        localStorage.removeItem('smart_capture_routing');
        setUser(prev => (prev ? { ...prev, ai_mode: mode } : prev));
      })
      .catch(() => { /* retry next load */ });
  }, [user?.id]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => setUser(data.user))
        .catch(() => {
          localStorage.removeItem('token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (googleCredential) => {
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* ignore */ }
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(tz ? { 'X-Client-Timezone': tz } : {}),
      },
      body: JSON.stringify({ credential: googleCredential }),
    });
    if (!res.ok) throw new Error('Login failed');
    const data = await res.json();
    localStorage.setItem('token', data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  // Re-fetch the current user (e.g. after a checkout flips the plan to Pro).
  const refreshUser = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch {
      // keep the current user on a transient failure
    }
  };

  // Merge a partial update into the cached user (e.g. after changing ai_mode
  // or receiving a fresh accept-streak) without a /me round-trip.
  const patchUser = (patch) => setUser(prev => (prev ? { ...prev, ...patch } : prev));

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, patchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
