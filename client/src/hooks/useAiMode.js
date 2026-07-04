import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

/**
 * The one dial for how much the app acts without asking:
 *   'off'      — fully manual, no AI anywhere (surfaces hide themselves)
 *   'assisted' — AI suggests, everything waits in the Inbox for confirmation
 *   'auto'     — confidence-gated auto-routing (Autopilot)
 * Server-side on the user row, so it follows the account across devices.
 */
export function useAiMode() {
  const { user, patchUser } = useAuth();
  const mode = user?.ai_mode || 'assisted';

  const setMode = async (next) => {
    await api.preferences.setAiMode(next);
    patchUser({ ai_mode: next });
  };

  return { mode, aiOff: mode === 'off', setMode };
}
