import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';
import { identifyUser, resetAnalytics } from '../lib/analytics';

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
        .then(data => {
          // /me returns a fresh token once the current one is a day old (sliding session).
          if (data.token) localStorage.setItem('token', data.token);
          setUser(data.user);
          identifyUser(data.user);
        })
        .catch(() => {
          localStorage.removeItem('token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Both sign-in routes take the same extras (timezone, where the visitor came
  // from) and answer with the same { token, user }.
  const signIn = async (path, body) => {
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* ignore */ }

    let referrer = '';
    try {
      referrer = sessionStorage.getItem('_ct_ref') || document.referrer || '';
      if (referrer.includes('accounts.google.com')) referrer = sessionStorage.getItem('_ct_ref') || '';
    } catch { /* ignore */ }
    const utm = {};
    try {
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref']) {
        const v = sessionStorage.getItem('_ct_' + key) || new URLSearchParams(window.location.search).get(key);
        if (v) utm[key] = v;
      }
    } catch { /* ignore */ }

    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(tz ? { 'X-Client-Timezone': tz } : {}),
      },
      body: JSON.stringify({
        ...body,
        ...(referrer ? { referrer } : {}),
        ...(Object.keys(utm).length ? { utm } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    // The email routes explain themselves ("That code isn't right…"); pass that on.
    if (!res.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem('token', data.token);
    setUser(data.user);
    identifyUser(data.user);
  };

  const login = (googleCredential) => signIn('/api/auth/google', { credential: googleCredential });
  // { email, code } or { token } from the emailed link.
  const loginWithEmail = (payload) => signIn('/api/auth/email/verify', payload);

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    resetAnalytics();
  };

  // Re-fetch the current user (e.g. after a checkout flips the plan to Pro).
  const refreshUser = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        if (data.token) localStorage.setItem('token', data.token);
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
    <AuthContext.Provider value={{ user, loading, login, loginWithEmail, logout, refreshUser, patchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
