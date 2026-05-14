import { useState, useRef, useEffect } from 'react';
import { Settings as SettingsIcon, FileJson, FileSpreadsheet, Upload, X, Tag, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import MonoLabel from '../components/ui/MonoLabel';
import ConfirmModal from '../components/ui/ConfirmModal';

export default function Settings() {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const [contexts, setContexts] = useState([]);
  const [newContextName, setNewContextName] = useState('');
  const [addingContext, setAddingContext] = useState(false);
  const [contextToDelete, setContextToDelete] = useState(null);

  useEffect(() => {
    api.contexts.getAll().then(setContexts).catch(err => {
      console.error('Load contexts failed:', err);
    });
  }, []);

  async function addContext(e) {
    e.preventDefault();
    const name = newContextName.trim();
    if (!name) return;
    setAddingContext(true);
    try {
      const created = await api.contexts.create(name);
      setContexts(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewContextName('');
    } catch (err) {
      addToast(err.message || 'Could not add context', 'error');
    } finally {
      setAddingContext(false);
    }
  }

  async function deleteContext() {
    if (!contextToDelete) return;
    try {
      await api.contexts.delete(contextToDelete.id);
      setContexts(prev => prev.filter(c => c.id !== contextToDelete.id));
      addToast(`Deleted ${contextToDelete.name}`, 'success');
    } catch (err) {
      addToast(err.message || 'Could not delete context', 'error');
    } finally {
      setContextToDelete(null);
    }
  }

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
          Cleartable. <span className="text-text-2">CSV</span> exports tasks
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
          Upload a <span className="text-text-2">Cleartable JSON backup</span> or
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
                  {preview.format === 'gtdflow-json' ? ' from Cleartable backup' : ' from CSV'}
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

      <section className="glass rounded-2xl p-6 mt-6">
        <MonoLabel className="mb-2">ai</MonoLabel>
        <h2 className="font-display text-xl mb-1">Contexts</h2>
        <p className="text-text-3 text-sm mb-5 leading-relaxed">
          Tags that group your tasks (e.g. <span className="text-text-2">Personal</span>,{' '}
          <span className="text-text-2">Work</span>, <span className="text-text-2">Errands</span>).
          Smart Capture uses these to classify new tasks — and learns from how you
          actually label things over time. Deleting a context removes it from the
          autocomplete list; tasks already tagged with it keep their tag.
        </p>

        <form onSubmit={addContext} className="flex gap-2 mb-5">
          <input
            type="text"
            value={newContextName}
            onChange={e => setNewContextName(e.target.value)}
            placeholder="New context name…"
            disabled={addingContext}
            className="gtd-input flex-1 disabled:opacity-50"
            maxLength={50}
          />
          <button
            type="submit"
            disabled={addingContext || !newContextName.trim()}
            className="gtd-btn gtd-btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {addingContext ? 'Adding…' : 'Add'}
          </button>
        </form>

        {contexts.length === 0 ? (
          <p className="text-text-3 text-xs italic">No contexts yet. Add one above, or let Smart Capture create them inline from a task.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {contexts.map(c => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-[12px]"
                style={{
                  background: 'rgb(var(--mint) / 0.08)',
                  boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.22)',
                  color: 'rgb(var(--mint-glow))',
                }}
              >
                <Tag className="w-3 h-3 opacity-70" />
                <span>{c.name}</span>
                <button
                  type="button"
                  onClick={() => setContextToDelete(c)}
                  className="grid place-items-center w-5 h-5 rounded-full hover:bg-white/10 transition-colors"
                  title={`Delete ${c.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {contextToDelete && (
        <ConfirmModal
          title={`Delete "${contextToDelete.name}"?`}
          message="The tag stays on tasks that already use it, but Smart Capture won't suggest it anymore. You can re-add it any time."
          confirmLabel="Delete"
          tone="rose"
          onConfirm={deleteContext}
          onCancel={() => setContextToDelete(null)}
        />
      )}
    </div>
  );
}
