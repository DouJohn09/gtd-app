import { useState, useEffect } from 'react';
import { X, AlertCircle, List, BookOpen, Tv, UtensilsCrossed, Music, Film, MapPin, Heart, Star, Bookmark, ShoppingBag, Lightbulb } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './Toast';

const ICONS = [
  { value: 'list', Icon: List },
  { value: 'book', Icon: BookOpen },
  { value: 'tv', Icon: Tv },
  { value: 'food', Icon: UtensilsCrossed },
  { value: 'music', Icon: Music },
  { value: 'film', Icon: Film },
  { value: 'place', Icon: MapPin },
  { value: 'heart', Icon: Heart },
  { value: 'star', Icon: Star },
  { value: 'bookmark', Icon: Bookmark },
  { value: 'shopping', Icon: ShoppingBag },
  { value: 'idea', Icon: Lightbulb },
];

const COLORS = ['violet', 'mint', 'amber', 'rose'];

export const ICON_MAP = Object.fromEntries(ICONS.map(i => [i.value, i.Icon]));

export default function NewListModal({ list, onClose, onSave }) {
  const { addToast } = useToast();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('list');
  const [color, setColor] = useState('violet');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (list) {
      setName(list.name || '');
      setIcon(list.icon || 'list');
      setColor(list.color || 'violet');
    }
  }, [list]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (list?.id) {
        await api.customLists.update(list.id, { name: name.trim(), icon, color });
        addToast('List updated', 'success');
      } else {
        await api.customLists.create({ name: name.trim(), icon, color });
        addToast('List created', 'success');
      }
      onSave?.();
      onClose();
    } catch (err) {
      // The global upgrade modal handles limit_reached; just close out of the way.
      if (err.code === 'limit_reached') onClose();
      else setError(err.message);
    } finally { setLoading(false); }
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
        style={{ boxShadow: '0 24px 64px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(var(--violet) / 0.16)' }}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/[0.05]">
          <div>
            <div className="mono-label" style={{ color: 'rgb(var(--violet-glow))' }}>
              {list?.id ? 'edit_list' : 'new_list'}
            </div>
            <h2 className="font-display text-[24px] leading-tight mt-0.5">
              {list?.id ? 'Edit List' : 'New List'}
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
            <label className="gtd-label">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="gtd-input"
              required
              autoFocus
              placeholder="Books to Read"
            />
          </div>

          <div>
            <label className="gtd-label">Icon</label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map(({ value, Icon }) => {
                const active = icon === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setIcon(value)}
                    className="w-10 h-10 rounded-xl grid place-items-center transition-all"
                    style={active
                      ? { background: `rgb(var(--${color}) / 0.16)`, color: `rgb(var(--${color}-glow))`, boxShadow: `inset 0 0 0 1px rgb(var(--${color}) / 0.32)` }
                      : { color: 'rgb(var(--text-3))', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }
                    }
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="gtd-label">Color</label>
            <div className="flex gap-2">
              {COLORS.map(c => {
                const active = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="w-10 h-10 rounded-xl grid place-items-center transition-all"
                    style={active
                      ? { background: `rgb(var(--${c}) / 0.25)`, boxShadow: `inset 0 0 0 2px rgb(var(--${c}) / 0.6)` }
                      : { background: `rgb(var(--${c}) / 0.10)`, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }
                    }
                  >
                    <div className="w-4 h-4 rounded-full" style={{ background: `rgb(var(--${c}))` }} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-3 border-t border-white/[0.05]">
            <button type="button" onClick={onClose} className="gtd-btn gtd-btn-secondary flex-1 text-[12.5px]">Cancel</button>
            <button type="submit" disabled={loading || !name.trim()} className="gtd-btn gtd-btn-primary flex-1 text-[12.5px] disabled:opacity-50">
              {loading ? 'Saving…' : list?.id ? 'Save' : 'Create List'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
