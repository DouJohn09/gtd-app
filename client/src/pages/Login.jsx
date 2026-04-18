import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import AuroraBackground from '../components/AuroraBackground';

export default function Login() {
  const { user, login } = useAuth();

  if (user) return <Navigate to="/" replace />;

  return (
    <>
      <AuroraBackground />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {/* Wordmark */}
          <div className="text-center mb-8">
            <div
              className="inline-flex items-baseline gap-1.5 font-display text-[44px] leading-none mb-2"
              style={{
                background: 'linear-gradient(180deg, #fff, rgb(var(--violet-glow)))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              flow
              <span
                className="font-mono text-[14px] tracking-widest"
                style={{ color: 'rgb(var(--violet-glow))', WebkitTextFillColor: 'rgb(var(--violet-glow))' }}
              >
                ::01
              </span>
            </div>
            <div className="mono-label" style={{ color: 'rgb(var(--violet-glow))' }}>gtd_system</div>
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
                Welcome back.
              </h1>
              <p className="font-display italic text-[15px] text-text-2 mb-7">
                Sign in to clear your mind.
              </p>

              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={(credentialResponse) => login(credentialResponse.credential)}
                  onError={() => console.error('Login failed')}
                  theme="filled_black"
                  shape="pill"
                  size="large"
                  text="continue_with"
                />
              </div>

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
        </div>
      </div>
    </>
  );
}
