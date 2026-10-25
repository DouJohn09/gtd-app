import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import AuroraBackground from '../components/AuroraBackground';
import { trackEvent } from '../lib/analytics';

// Consent screen for an AI app (Claude, ChatGPT, Grok) connecting over MCP.
// The server's /authorize sends the browser here with ?request=…; Allow
// returns it to the app with a one-time code, Cancel with access_denied.
export default function Connect() {
  const { user } = useAuth();
  const [requestId] = useState(() => new URLSearchParams(window.location.search).get('request'));
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(requestId ? null : 'This link is missing its connection request. Start again from the AI app.');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!requestId) return;
    api.oauth.request(requestId).then(setInfo).catch(err => setError(err.message));
  }, [requestId]);

  const decide = async (allow) => {
    setBusy(allow ? 'allow' : 'deny');
    try {
      const { redirect } = allow ? await api.oauth.approve(requestId) : await api.oauth.deny(requestId);
      if (allow) trackEvent('ai_app_connected', { app: info?.clientName });
      if (redirect) window.location.href = redirect;
      else setError('This connection request has expired. Start again from the AI app.');
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  };

  const name = info?.clientName || 'This app';

  return (
    <>
      <AuroraBackground />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div
              className="font-display text-[44px] leading-none mb-2"
              style={{
                background: 'linear-gradient(180deg, #fff, rgb(var(--violet-glow)))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Cleartable
            </div>
          </div>

          <div
            className="rounded-2xl glass p-8 relative overflow-hidden"
            style={{ boxShadow: '0 24px 64px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(var(--violet) / 0.18)' }}
          >
            {error ? (
              <>
                <h1 className="font-display text-[26px] leading-tight mb-3">Couldn't connect</h1>
                <p className="text-[14px] text-text-2 leading-relaxed">{error}</p>
              </>
            ) : !info ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 rounded-full border-2 border-violet/30 border-t-violet animate-spin" />
              </div>
            ) : (
              <>
                <h1 className="font-display text-[26px] leading-tight mb-2">
                  Connect {name} to Cleartable?
                </h1>
                <p className="text-[13px] text-text-3 mb-6">
                  Signed in as <span className="text-text-2">{user?.email}</span>
                </p>
                <p className="text-[13px] text-text-2 mb-3">{name} will be able to:</p>
                <ul className="space-y-2 mb-6 text-[14px] text-text-1">
                  {['Add tasks, sorted by Cleartable\'s AI', 'See your tasks, projects and today\'s plan', 'Update and complete tasks'].map(t => (
                    <li key={t} className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'rgb(var(--mint))' }} />
                      {t}
                    </li>
                  ))}
                  <li className="flex items-start gap-2 text-text-3">
                    <X className="w-4 h-4 mt-0.5 shrink-0" />
                    It can't delete tasks or change your account
                  </li>
                </ul>
                {info.redirectHost && (
                  <p className="text-[12px] text-text-3 mb-6">
                    You'll be sent back to <span className="text-text-2 font-mono">{info.redirectHost}</span>.
                    Disconnect any time in Settings.
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => decide(false)}
                    disabled={!!busy}
                    className="flex-1 py-2.5 rounded-xl text-[14px] text-text-2 transition-colors hover:text-text-1"
                    style={{ boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.12)' }}
                  >
                    {busy === 'deny' ? 'Cancelling…' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(true)}
                    disabled={!!busy}
                    className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-white bg-violet hover:brightness-110 transition"
                  >
                    {busy === 'allow' ? 'Connecting…' : 'Allow'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
