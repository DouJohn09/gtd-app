import { useEffect, useState } from 'react';
import { Plug, Copy, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './Toast';
import MonoLabel from './ui/MonoLabel';

const HOW_TO = [
  { app: 'Claude', steps: 'Customize → Connectors → + Add → Add custom connector, paste the address.' },
  { app: 'ChatGPT', steps: 'Settings → Apps → Advanced settings → turn on Developer mode (Plus or higher), then Create app with the address.' },
  { app: 'Grok', steps: 'grok.com/connectors → New connector → Custom, paste the address.' },
];

const when = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'never';

// Settings → AI apps: the MCP address to paste into Claude / ChatGPT / Grok,
// and the apps already connected, each with Disconnect.
export default function ConnectedApps() {
  const { addToast } = useToast();
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = () => api.oauth.connections().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.mcpUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      addToast('Copy failed — select the address and copy it', 'error');
    }
  };

  const remove = async (c) => {
    try {
      await api.oauth.disconnect(c.clientId);
      addToast(`${c.name} disconnected`, 'success');
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <section className="glass rounded-2xl p-6 mt-6">
      <MonoLabel className="mb-2">ai apps</MonoLabel>
      <h2 className="font-display text-xl mb-1 flex items-center gap-2">
        <Plug className="w-4 h-4" style={{ color: 'rgb(var(--violet-glow))' }} />
        Claude, ChatGPT &amp; Grok
      </h2>
      <p className="text-text-3 text-sm mb-4 leading-relaxed">
        Connect your AI assistant and say "add this to Cleartable". Tasks land
        here, sorted. It can read and update your tasks, never delete them.
      </p>

      {data && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <code className="flex-1 min-w-0 truncate text-[13px] px-3 py-2 rounded-lg bg-black/30 text-text-1 font-mono select-all">
              {data.mcpUrl}
            </code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 p-2 rounded-lg text-text-2 hover:text-text-1 transition-colors"
              style={{ boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.10)' }}
              title="Copy address"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <ul className="space-y-1.5 mb-5">
            {HOW_TO.map(h => (
              <li key={h.app} className="text-[12px] text-text-3 leading-relaxed">
                <span className="text-text-2 font-medium">{h.app}:</span> {h.steps}
              </li>
            ))}
          </ul>

          {data.connections.length > 0 && (
            <div className="space-y-2">
              {data.connections.map(c => (
                <div
                  key={c.clientId}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.06)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-text-1 truncate">{c.name}</div>
                    <div className="text-[12px] text-text-3">Connected {when(c.connectedAt)} · last used {when(c.lastUsedAt)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    className="shrink-0 text-[12px] px-3 py-1.5 rounded-lg text-text-2 hover:text-text-1 transition-colors"
                    style={{ boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.10)' }}
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
