import { useState, useEffect, useRef, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import MonoLabel from '../components/ui/MonoLabel';
import { renderPulse } from './pulse/renderPulse';
import './pulse/pulse.css';

const RELOAD_MS = 60_000;

// Founder-only monitoring page: live numbers from /api/admin/pulse, reloaded
// every minute. The server answers 404 to everyone else; the sidebar link and
// this route only show for users flagged is_admin.
export default function Pulse() {
  const { user } = useAuth();
  const root = useRef(null);
  const [state, setState] = useState({ data: null, error: null, fetchedAt: null });

  const load = useCallback(async () => {
    try {
      const data = await api.admin.pulse();
      setState({ data, error: null, fetchedAt: new Date().toISOString() });
    } catch (err) {
      setState(prev => ({ ...prev, error: err.message || 'request failed' }));
    }
  }, []);

  useEffect(() => {
    if (!user?.is_admin) return undefined;
    load();
    const t = setInterval(load, RELOAD_MS);
    return () => clearInterval(t);
  }, [user?.is_admin, load]);

  useEffect(() => { renderPulse(root.current, state); }, [state]);

  // The refresh button lives inside the rendered markup.
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const onClick = (e) => { if (e.target.closest('[data-pulse-refresh]')) load(); };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [load]);

  if (user && !user.is_admin) return <Navigate to="/" replace />;

  return (
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-[1500px]">
      <MonoLabel className="mb-3">monitoring</MonoLabel>
      <h1 className="font-display text-[52px] md:text-[60px] leading-[1] tracking-tight mb-8">Pulse</h1>
      <div className="pulse" ref={root} />
    </div>
  );
}
