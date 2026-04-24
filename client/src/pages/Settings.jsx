import { useState, useRef } from 'react';
import { Settings as SettingsIcon, FileJson, FileSpreadsheet, Upload, X } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import MonoLabel from '../components/ui/MonoLabel';

export default function Settings() {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  async function downloadExport(format) {
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

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setBusy('preview');
    try {
      const content = await file.text();
      const result = await api.import.preview(file.name, content);
      setPreview(result);
    } catch (err) {
      addToast(err.message || 'Could not read file', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setImporting(true);
    try {
      const { counts } = await api.import.commit(preview.format, preview.payload);
      const summary = [
        counts.tasks && `${counts.tasks} tasks`,
        counts.projects_new && `${counts.projects_new} new projects`,
        counts.projects_merged && `${counts.projects_merged} projects merged`,
        counts.contexts && `${counts.contexts} contexts`,
        counts.habits && `${counts.habits} habits`,
      ].filter(Boolean).join(' · ');
      addToast(`Imported: ${summary || 'nothing new'}`, 'success');
      setPreview(null);
    } catch (err) {
      addToast(err.message || 'Import failed', 'error');
    } finally {
      setImporting(false);
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
            onClick={() => downloadExport('json')}
            disabled={busy !== null}
            className="gtd-btn gtd-btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            <FileJson className="w-4 h-4" />
            {busy === 'json' ? 'Preparing…' : 'Download JSON'}
          </button>
          <button
            onClick={() => downloadExport('csv')}
            disabled={busy !== null}
            className="gtd-btn inline-flex items-center gap-2 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {busy === 'csv' ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>
      </section>

      <section className="glass rounded-2xl p-6 mt-6">
        <MonoLabel className="mb-2">data</MonoLabel>
        <h2 className="font-display text-xl mb-1">Import data</h2>
        <p className="text-text-3 text-sm mb-5 leading-relaxed">
          Upload a <span className="text-text-2">GTD Flow JSON backup</span> or
          a <span className="text-text-2">Todoist-compatible CSV</span>. Tasks
          go to their original list (or Inbox if missing). Projects with the
          same name merge into existing ones. Duplicates aren't filtered — use
          AI duplicate detection afterward to clean up.
        </p>
        <p className="text-text-3 text-xs mb-5">
          For Notion, Things, or other formats: paste them into the AI text
          importer in the Inbox.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          onChange={handleFile}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy !== null || importing}
          className="gtd-btn inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          {busy === 'preview' ? 'Reading…' : 'Choose file'}
        </button>

        {preview && (
          <div
            className="mt-5 rounded-xl p-4 border"
            style={{ borderColor: 'rgb(var(--violet) / 0.30)', background: 'rgb(var(--violet) / 0.05)' }}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <MonoLabel tone="violet" className="mb-1">preview</MonoLabel>
                <div className="text-text-1 font-medium">
                  Ready to import {preview.summary.tasks} task{preview.summary.tasks === 1 ? '' : 's'}
                  {preview.format === 'gtdflow-json' ? ' from GTD Flow backup' : ' from CSV'}
                </div>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="grid place-items-center w-7 h-7 rounded-lg text-text-3 hover:text-text-1 hover:bg-white/5"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <ul className="text-xs text-text-2 space-y-1 mb-4">
              {preview.summary.projects > 0 && (
                <li>
                  {preview.summary.projects} project{preview.summary.projects === 1 ? '' : 's'}
                  {preview.summary.projects_new > 0 && <> · {preview.summary.projects_new} new</>}
                  {preview.summary.projects_merge > 0 && <> · {preview.summary.projects_merge} merged into existing</>}
                </li>
              )}
              {preview.summary.contexts > 0 && <li>{preview.summary.contexts} contexts</li>}
              {preview.summary.habits > 0 && (
                <li>
                  {preview.summary.habits} habits
                  {preview.summary.habit_logs > 0 && <> · {preview.summary.habit_logs} log entries</>}
                </li>
              )}
            </ul>

            {preview.sample?.length > 0 && (
              <div className="font-mono text-[11px] text-text-3 mb-4">
                sample: {preview.sample.map(s => `"${s}"`).join(', ')}
                {preview.summary.tasks > preview.sample.length && '…'}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={confirmImport}
                disabled={importing}
                className="gtd-btn gtd-btn-primary disabled:opacity-50"
              >
                {importing ? 'Importing…' : 'Import'}
              </button>
              <button
                onClick={() => setPreview(null)}
                disabled={importing}
                className="gtd-btn disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
