import { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, Star, ExternalLink, Trash2, ListTodo, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './Toast';
import { useAiMode } from '../hooks/useAiMode';
import ConfirmModal from './ui/ConfirmModal';

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do', tone: 'text-3' },
  { value: 'in_progress', label: 'In Progress', tone: 'amber' },
  { value: 'done', label: 'Done', tone: 'mint' },
];

export default function ListItemModal({ item, listId, listColor = 'violet', onClose, onSave }) {
  const { addToast } = useToast();
  const { aiOff } = useAiMode();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('todo');
  const [rating, setRating] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const extractRef = useRef(null);

  const isEdit = !!item?.id;

  useEffect(() => {
    if (item) {
      setTitle(item.title || '');
      setNotes(item.notes || '');
      setUrl(item.url || '');
      setStatus(item.status || 'todo');
      setRating(item.rating || null);
    }
  }, [item]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleUrlChange = (newUrl) => {
    setUrl(newUrl);
    if (extractRef.current) clearTimeout(extractRef.current);
    if (aiOff) return;
    try { new URL(newUrl); } catch { return; }
    if (!newUrl.startsWith('http')) return;
    extractRef.current = setTimeout(async () => {
      setExtracting(true);
      try {
        const result = await api.customLists.extractUrl(newUrl);
        if (result?.title && !title.trim()) setTitle(result.title);
        if (result?.notes && !notes.trim()) setNotes(result.notes);
      } catch { /* silent */ }
      finally { setExtracting(false); }
    }, 500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = { title: title.trim(), notes: notes.trim() || null, url: url.trim() || null, status, rating };
      if (isEdit) {
        await api.customLists.updateItem(listId, item.id, data);
        addToast('Item updated', 'success');
      } else {
        await api.customLists.createItem(listId, data);
        addToast('Item added', 'success');
      }
      onSave?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    try {
      await api.customLists.deleteItem(listId, item.id);
      addToast('Item deleted', 'success');
      onSave?.();
      onClose();
    } catch (err) { setError(err.message); }
  };

  const handlePromote = async () => {
    try {
      await api.customLists.promoteItem(listId, item.id);
      addToast('Promoted to task', 'success');
      onSave?.();
      onClose();
    } catch (err) {
      if (err.message.includes('already linked')) {
        addToast('Already linked to a task', 'info');
      } else {
        addToast(err.message, 'error');
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      style={{ background: 'rgba(8,8,14,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md my-6 rounded-2xl glass"
        onClick={e => e.stopPropagation()}
        style={{ boxShadow: `0 24px 64px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(var(--${listColor}) / 0.16)` }}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/[0.05]">
          <div>
            <div className="mono-label" style={{ color: `rgb(var(--${listColor}-glow))` }}>
              {isEdit ? 'edit_item' : 'add_item'}
            </div>
            <h2 className="font-display text-[24px] leading-tight mt-0.5">
              {isEdit ? 'Edit Item' : 'Add Item'}
            </h2>
          </div>
          <button onClick={onClose} className="grid place-items-center w-8 h-8 rounded-lg text-text-3 hover:text-text-1 hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error && (
            <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: 'rgb(var(--rose) / 0.08)', boxShadow: 'inset 0 0 0 1px rgb(var(--rose) / 0.25)' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'rgb(var(--rose-glow))' }} />
              <p className="text-[12.5px] text-text-1">{error}</p>
            </div>
          )}

          <div>
            <label className="gtd-label">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="gtd-input"
              required
              autoFocus
              placeholder="e.g. Dune by Frank Herbert"
            />
          </div>

          <div>
            <label className="gtd-label">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="gtd-input min-h-[72px] resize-y"
              placeholder="Optional notes…"
              rows={3}
            />
          </div>

          <div>
            <label className="gtd-label flex items-center gap-2">
              URL
              {extracting && <Loader2 className="w-3 h-3 animate-spin" style={{ color: `rgb(var(--${listColor}-glow))` }} />}
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              className="gtd-input"
              placeholder="Paste a link to auto-fill title…"
            />
          </div>

          <div>
            <label className="gtd-label">Status</label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map(opt => {
                const active = status === opt.value;
                const isColor = opt.tone !== 'text-3';
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className="flex-1 py-2 rounded-xl text-[12px] font-mono uppercase tracking-wider transition-all"
                    style={active
                      ? {
                          background: isColor ? `rgb(var(--${opt.tone}) / 0.16)` : 'rgba(255,255,255,0.08)',
                          color: isColor ? `rgb(var(--${opt.tone}-glow))` : 'rgb(var(--text-1))',
                          boxShadow: isColor
                            ? `inset 0 0 0 1px rgb(var(--${opt.tone}) / 0.32)`
                            : 'inset 0 0 0 1px rgba(255,255,255,0.15)',
                        }
                      : { color: 'rgb(var(--text-3))', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {status === 'done' && (
            <div>
              <label className="gtd-label">Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(rating === n ? null : n)}
                    className="p-1.5 rounded-lg transition-all hover:scale-110"
                  >
                    <Star
                      className="w-5 h-5 transition-colors"
                      style={{
                        color: n <= (rating || 0) ? `rgb(var(--amber-glow))` : 'rgb(var(--text-3))',
                        fill: n <= (rating || 0) ? `rgb(var(--amber-glow))` : 'transparent',
                      }}
                    />
                  </button>
                ))}
                {rating && (
                  <span className="ml-2 self-center font-mono text-[11px] text-text-3">{rating}/5</span>
                )}
              </div>
            </div>
          )}

          {isEdit && !item.linked_task_id && (
            <button
              type="button"
              onClick={handlePromote}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-mono uppercase tracking-wider transition-all"
              style={{ background: 'rgb(var(--mint) / 0.08)', color: 'rgb(var(--mint-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.25)' }}
            >
              <ListTodo className="w-3.5 h-3.5" /> Make it a task
            </button>
          )}

          {isEdit && item.linked_task_id && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-mono text-text-3"
              style={{ background: 'rgba(255,255,255,0.03)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}
            >
              <ListTodo className="w-3.5 h-3.5" style={{ color: 'rgb(var(--mint-glow))' }} />
              <span>Linked to task</span>
            </div>
          )}

          <div className="flex gap-2 pt-3 border-t border-white/[0.05]">
            {isEdit && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="grid place-items-center w-10 h-10 rounded-xl text-text-3 hover:text-rose-glow hover:bg-rose/5 transition-colors"
                title="Delete item"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button type="button" onClick={onClose} className="gtd-btn gtd-btn-secondary flex-1 text-[12.5px]">Cancel</button>
            <button type="submit" disabled={loading || !title.trim()} className="gtd-btn gtd-btn-primary flex-1 text-[12.5px] disabled:opacity-50">
              {loading ? 'Saving…' : isEdit ? 'Save' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete item?"
          message={`"${title.length > 60 ? title.slice(0, 60) + '…' : title}" will be permanently removed.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
