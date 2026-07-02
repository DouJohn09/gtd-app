import { useState, useRef, useEffect } from 'react';
import { Settings as SettingsIcon, FileJson, FileSpreadsheet, Upload, X, Tag, Plus, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import MonoLabel from '../components/ui/MonoLabel';
import ConfirmModal from '../components/ui/ConfirmModal';
import BillingSection from '../components/BillingSection';

export default function Settings() {
  const { addToast } = useToast();
  const { logout } = useAuth();
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [busy, setBusy] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const [contexts, setContexts] = useState([]);
  const [newContextName, setNewContextName] = useState('');
  const [addingContext, setAddingContext] = useState(false);
  const [contextToDelete, setContextToDelete] = useState(null);
  const [routing, setRouting] = useState(() => localStorage.getItem('smart_capture_routing') || 'auto_route');

  useEffect(() => {
    api.contexts.getAll().then(setContexts).catch(err => {
      console.error('Load contexts failed:', err);
    });
  }, []);

  function updateRouting(next) {
    setRouting(next);
    localStorage.setItem('smart_capture_routing', next);
    addToast(
      next === 'auto_route'
        ? 'Smart Capture: auto-route confident tasks'
        : 'Smart Capture: every task lands in Inbox',
      'success'
    );
  }

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

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    try {
      await api.account.delete();
      // Clear any per-device app state, then drop the session (redirects to login).
      try { localStorage.clear(); } catch { /* ignore */ }
      logout();
    } catch (err) {
      addToast(err.message || 'Could not delete your account. Please try again.', 'error');
      setDeletingAccount(false);
      setShowDeleteAccount(false);
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

      <BillingSection />

      <section className="glass rounded-2xl p-6 mt-6">
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
        <h2 className="font-display text-xl mb-1 flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: 'rgb(var(--violet-glow))' }} />
          Smart Capture
        </h2>
        <p className="text-text-3 text-sm mb-5 leading-relaxed">
          When you capture a task with Smart Capture on, the AI parses its
          metadata (context, due date, project, energy, recurrence) and decides
          which list it belongs in. Choose how aggressive that routing should be.
          Either way, Smart Capture learns from how you organize tasks — your
          recent classifications and corrections shape every future capture.
        </p>

        <div className="space-y-2">
          <label
            className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all"
            style={
              routing === 'auto_route'
                ? { background: 'rgb(var(--violet) / 0.08)', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.30)' }
                : { boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.06)' }
            }
          >
            <input
              type="radio"
              name="routing"
              value="auto_route"
              checked={routing === 'auto_route'}
              onChange={() => updateRouting('auto_route')}
              className="mt-1 accent-violet-400"
            />
            <div className="flex-1">
              <div className="text-[13px] font-medium text-text-1">
                Auto-route confident tasks <span className="text-text-3 font-normal">(recommended)</span>
              </div>
              <p className="text-[12px] text-text-3 mt-0.5 leading-relaxed">
                Tasks the AI is confident about land directly in their final list
                (Next Actions, Waiting For, etc.). Ambiguous tasks fall back to
                Inbox so you can review them.
              </p>
            </div>
          </label>

          <label
            className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all"
            style={
              routing === 'always_inbox'
                ? { background: 'rgb(var(--violet) / 0.08)', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.30)' }
                : { boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.06)' }
            }
          >
            <input
              type="radio"
              name="routing"
              value="always_inbox"
              checked={routing === 'always_inbox'}
              onChange={() => updateRouting('always_inbox')}
              className="mt-1 accent-violet-400"
            />
            <div className="flex-1">
              <div className="text-[13px] font-medium text-text-1">
                Always send to Inbox
              </div>
              <p className="text-[12px] text-text-3 mt-0.5 leading-relaxed">
                Strict GTD mode: AI fills in metadata but every task lands in
                Inbox first so you can review and triage before it joins your
                active lists.
              </p>
            </div>
          </label>
        </div>
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

      {/* Danger zone — GDPR right-to-erasure */}
      <section
        className="rounded-2xl p-5"
        style={{ background: 'rgb(var(--rose) / 0.05)', boxShadow: 'inset 0 0 0 1px rgb(var(--rose) / 0.20)' }}
      >
        <MonoLabel className="mb-2" style={{ color: 'rgb(var(--rose-glow))' }}>danger zone</MonoLabel>
        <h2 className="font-display text-[18px] leading-tight mb-1">Delete account</h2>
        <p className="text-[13px] text-text-2 leading-relaxed mb-4 max-w-prose">
          Permanently deletes your account and all your data — tasks, projects, habits, lists, contexts and history.
          This cannot be undone. Any active subscription is canceled and your Google Calendar connection is revoked.
          Consider exporting your data first (above).
        </p>
        <button
          type="button"
          onClick={() => setShowDeleteAccount(true)}
          className="py-2.5 px-4 rounded-xl text-[12.5px] font-medium transition-all"
          style={{ background: 'rgb(var(--rose) / 0.14)', color: 'rgb(var(--rose-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--rose) / 0.32)' }}
        >
          Delete my account
        </button>
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

      {showDeleteAccount && (
        <ConfirmModal
          title="Delete your account?"
          message="This permanently erases your account and all your data — tasks, projects, habits, lists and history. Your subscription is canceled and your calendar connection revoked. This cannot be undone."
          confirmLabel={deletingAccount ? 'Deleting…' : 'Delete everything'}
          tone="rose"
          onConfirm={deletingAccount ? () => {} : handleDeleteAccount}
          onCancel={() => { if (!deletingAccount) setShowDeleteAccount(false); }}
        />
      )}
    </div>
  );
}
