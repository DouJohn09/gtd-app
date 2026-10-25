import { useState, useEffect, useRef } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import AuroraBackground from '../components/AuroraBackground';
import { trackEvent } from '../lib/analytics';

export default function Login() {
  const { user, login, loginWithEmail } = useAuth();
  const [error, setError] = useState(null);
  const [signingIn, setSigningIn] = useState(false);
  // Email sign-in: 'email' = asking for the address, 'code' = code was sent.
  const [emailStep, setEmailStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const linkTried = useRef(false);
  // Where to go once signed in (?next=/connect?request=…). Read once, before
  // the emailed-link handler clears the query; same-origin paths only.
  const [next] = useState(() => {
    const n = new URLSearchParams(window.location.search).get('next');
    return n && n.startsWith('/') && !n.startsWith('//') ? n : '/';
  });

  // The emailed link lands here as /login?token=…; sign in with it once and
  // drop it from the address bar.
  useEffect(() => {
    if (linkTried.current) return;
    linkTried.current = true;
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return;
    window.history.replaceState(null, '', window.location.pathname);
    setSigningIn(true);
    loginWithEmail({ token })
      .catch((err) => {
        trackEvent('email_code_failed', { via: 'link' });
        setError(err.message);
      })
      .finally(() => setSigningIn(false));
  }, [loginWithEmail]);

  if (user) return <Navigate to={next} replace />;

  const sendCode = async (e) => {
    e?.preventDefault();
    setError(null);
    setSending(true);
    try {
      const res = await fetch('/api/auth/email/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "We couldn't send the email. Please try again.");
      trackEvent('email_code_requested');
      setCode('');
      setEmailStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setError(null);
    setSigningIn(true);
    try {
      await loginWithEmail({ email, code });
    } catch (err) {
      trackEvent('email_code_failed', { via: 'code' });
      setError(err.message);
    } finally {
      setSigningIn(false);
    }
  };

  const handleSuccess = async (credentialResponse) => {
    setError(null);
    setSigningIn(true);
    try {
      await login(credentialResponse.credential);
    } catch {
      trackEvent('signin_failed', { stage: 'server' });
      setError("We couldn't sign you in. Please try again — if it keeps happening, email support@cleartable.app and we'll sort it out.");
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <>
      <AuroraBackground />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {/* Wordmark */}
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
            <div className="mono-label" style={{ color: 'rgb(var(--violet-glow))' }}>clear_table_clear_mind</div>
          </div>

          {/* Card */}
          <div
            className="rounded-2xl glass p-8 text-center relative overflow-hidden"
            style={{ boxShadow: '0 24px 64px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(var(--violet) / 0.18)' }}
          >
            <div
              className="absolute -top-16 -right-16 w-56 h-56 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgb(var(--violet) / 0.20), transparent 70%)' }}
            />
            <div
              className="absolute -bottom-20 -left-16 w-56 h-56 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgb(var(--mint) / 0.14), transparent 70%)' }}
            />

            <div className="relative">
              <h1 className="font-display text-[34px] leading-tight mb-2">
                Clear your mind.
              </h1>
              <p className="font-display italic text-[15px] text-text-2 mb-7">
                New here? Signing in creates your free account.
              </p>

              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={handleSuccess}
                  onError={() => {
                    trackEvent('signin_failed', { stage: 'google' });
                    setError("Google sign-in didn't complete. Please try again.");
                  }}
                  click_listener={() => trackEvent('signin_clicked')}
                  theme="filled_black"
                  shape="pill"
                  size="large"
                  text="continue_with"
                />
              </div>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="font-mono text-[10px] text-text-3 uppercase tracking-widest">or with email</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              {emailStep === 'email' ? (
                <form onSubmit={sendCode} className="flex flex-col gap-2.5 text-left">
                  <label htmlFor="login-email" className="sr-only">Email address</label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="gtd-input"
                  />
                  <button type="submit" disabled={sending || !email.trim()} className="gtd-btn gtd-btn-secondary text-[13px] disabled:opacity-50">
                    {sending ? 'Sending…' : 'Email me a sign-in code'}
                  </button>
                </form>
              ) : (
                <form onSubmit={verifyCode} className="flex flex-col gap-2.5 text-left">
                  <p className="text-[13px] text-text-2 leading-relaxed">
                    We sent a 6-digit code to <span className="text-text-1">{email}</span>. It expires in 15 minutes.
                  </p>
                  <label htmlFor="login-code" className="sr-only">Sign-in code</label>
                  <input
                    id="login-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={7}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
                    className="gtd-input text-center font-mono text-[20px] tracking-[0.4em]"
                  />
                  <button type="submit" disabled={signingIn || code.replace(/\D/g, '').length !== 6} className="gtd-btn gtd-btn-primary text-[13px] disabled:opacity-50">
                    Sign in
                  </button>
                  <div className="flex justify-between text-[12px] text-text-3">
                    <button type="button" className="underline hover:text-text-2" onClick={() => { setEmailStep('email'); setError(null); }}>
                      Use a different email
                    </button>
                    <button type="button" className="underline hover:text-text-2 disabled:opacity-50" disabled={sending} onClick={sendCode}>
                      {sending ? 'Sending…' : 'Send a new code'}
                    </button>
                  </div>
                </form>
              )}

              {signingIn && (
                <p className="mt-4 font-mono text-[11px] text-text-3 uppercase tracking-widest">signing in…</p>
              )}

              {error && (
                <div
                  role="alert"
                  className="mt-5 rounded-xl px-4 py-3 text-[13px] leading-relaxed text-left"
                  style={{ background: 'rgb(var(--rose) / 0.10)', border: '1px solid rgb(var(--rose) / 0.28)', color: 'rgb(var(--rose))' }}
                >
                  {error}
                </div>
              )}

              <div className="mt-7 flex items-center justify-center gap-2">
                <div className="h-px w-10 bg-white/10" />
                <span className="font-mono text-[10px] text-text-3 uppercase tracking-widest">private · encrypted</span>
                <div className="h-px w-10 bg-white/10" />
              </div>
            </div>
          </div>

          {/* Quote */}
          <p className="text-center font-display italic text-[14px] text-text-3 mt-6 max-w-xs mx-auto leading-relaxed">
            Your mind is for having ideas, not holding them.
          </p>

          {/* Signing in creates an account, so the terms that govern it have to be
              reachable from here — not only from the landing footer. Root-relative:
              the landing pages are served at the domain root, the app under /app/. */}
          <p className="text-center font-mono text-[10px] text-text-3 mt-6 leading-relaxed">
            By signing in you agree to our{' '}
            <a href="/terms.html" target="_blank" rel="noopener" className="underline hover:text-text-2">Terms</a>
            {' · '}
            <a href="/privacy.html" target="_blank" rel="noopener" className="underline hover:text-text-2">Privacy</a>
          </p>
        </div>
      </div>
    </>
  );
}
