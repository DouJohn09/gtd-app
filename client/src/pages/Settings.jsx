import { useState } from 'react';
import { Settings as SettingsIcon, FileJson, FileSpreadsheet } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import MonoLabel from '../components/ui/MonoLabel';

export default function Settings() {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(null);

  async function download(format) {
    setBusy(format);
    try {
      await api.export[format]();
      addToast(`Downloaded ${format.toUpperCase()} export`, 'success');
    } catch (err) {
      addToast(err.message || 'Export failed', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <SettingsIcon className="w-5 h-5 text-text-2" />
          <h1 className="font-display text-3xl">Settings</h1>
        </div>
        <p className="text-text-3 text-sm">Account, data, and preferences.</p>
      </header>

      <section className="glass rounded-2xl p-6">
        <MonoLabel className="mb-2">data</MonoLabel>
        <h2 className="font-display text-xl mb-1">Export your data</h2>
        <p className="text-text-3 text-sm mb-5 leading-relaxed">
          <span className="text-text-2">JSON</span> is a complete backup —
          tasks, projects, contexts, and habits — and is re-importable into
          GTD Flow. <span className="text-text-2">CSV</span> exports tasks
          only, using Todoist-compatible columns so you can open it in a
          spreadsheet or migrate to another GTD app.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => download('json')}
            disabled={busy !== null}
            className="gtd-btn gtd-btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            <FileJson className="w-4 h-4" />
            {busy === 'json' ? 'Preparing…' : 'Download JSON'}
          </button>
          <button
            onClick={() => download('csv')}
            disabled={busy !== null}
            className="gtd-btn inline-flex items-center gap-2 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {busy === 'csv' ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>
      </section>
    </div>
  );
}
