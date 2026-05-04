import { useState, useEffect, useCallback } from 'react';
import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import { Plus, GripVertical, Star, ExternalLink, Pencil, Trash2, ListTodo, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { ICON_MAP } from '../components/NewListModal';
import ListItemModal from '../components/ListItemModal';
import NewListModal from '../components/NewListModal';
import MonoLabel from '../components/ui/MonoLabel';
import ConfirmModal from '../components/ui/ConfirmModal';

const STATUS_DOT = {
  todo: { bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.15)' },
  in_progress: { bg: 'rgb(var(--amber) / 0.16)', border: 'rgb(var(--amber) / 0.32)' },
  done: { bg: 'rgb(var(--mint) / 0.16)', border: 'rgb(var(--mint) / 0.32)' },
};

export default function CustomList() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const outletCtx = useOutletContext() || {};
  const refreshCustomLists = outletCtx.refreshCustomLists;

  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingList, setEditingList] = useState(false);
  const [confirmDeleteList, setConfirmDeleteList] = useState(false);
  const [filter, setFilter] = useState('all');

  const fetchData = useCallback(async () => {
    try {
      const [listData, itemsData] = await Promise.all([
        api.customLists.getById(listId),
        api.customLists.getItems(listId),
      ]);
      setList(listData);
      setItems(itemsData);
    } catch (err) {
      if (err.message.includes('404') || err.message.includes('not found')) {
        navigate('/', { replace: true });
      }
    } finally { setLoading(false); }
  }, [listId, navigate]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  const isUrl = (str) => {
    try { const u = new URL(str.trim()); return u.protocol === 'http:' || u.protocol === 'https:'; }
    catch { return false; }
  };

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    const value = newTitle.trim();
    if (!value) return;
    setAdding(true);
    try {
      if (isUrl(value)) {
        let itemData = { title: value, url: value };
        try {
          const result = await api.customLists.extractUrl(value);
          if (result?.title) itemData.title = result.title;
          if (result?.notes) itemData.notes = result.notes;
        } catch { /* use URL as title fallback */ }
        await api.customLists.createItem(listId, itemData);
      } else {
        await api.customLists.createItem(listId, { title: value });
      }
      setNewTitle('');
      fetchData();
    } catch (err) { addToast(err.message, 'error'); }
    finally { setAdding(false); }
  };

  const handleStatusCycle = async (item) => {
    const next = item.status === 'todo' ? 'in_progress' : item.status === 'in_progress' ? 'done' : 'todo';
    try {
      await api.customLists.updateItem(listId, item.id, { status: next });
      fetchData();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleReorder = async (index, direction) => {
    const newItems = [...items];
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= newItems.length) return;
    [newItems[index], newItems[swapIdx]] = [newItems[swapIdx], newItems[index]];
    setItems(newItems);
    try {
      await api.customLists.reorderItems(listId, newItems.map(i => i.id));
    } catch (err) { addToast(err.message, 'error'); fetchData(); }
  };

  const handleDeleteList = async () => {
    try {
      await api.customLists.delete(listId);
      addToast('List deleted', 'success');
      refreshCustomLists?.();
      navigate('/', { replace: true });
    } catch (err) { addToast(err.message, 'error'); }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-violet/30 border-t-violet animate-spin" />
      </div>
    );
  }

  if (!list) return null;

  const color = list.color || 'violet';
  const Icon = ICON_MAP[list.icon] || ICON_MAP.list;

  const filteredItems = filter === 'all' ? items : items.filter(i => i.status === filter);
  const doneCount = items.filter(i => i.status === 'done').length;

  return (
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-end justify-between gap-4 mb-2">
          <div>
            <MonoLabel tone={color} className="mb-3">{list.icon}</MonoLabel>
            <h1 className="font-display text-[46px] md:text-[56px] leading-[1] tracking-tight">
              {list.name}
              <span className="font-mono text-[14px] tracking-wider text-text-3 ml-3 align-middle">
                {items.length.toString().padStart(2, '0')}
              </span>
            </h1>
            {items.length > 0 && (
              <p className="font-display italic text-[18px] text-text-2 mt-2">
                {doneCount} of {items.length} done
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setEditingList(true)}
              className="grid place-items-center w-9 h-9 rounded-xl text-text-3 hover:text-text-1 hover:bg-white/5 transition-colors"
              title="Edit list"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setConfirmDeleteList(true)}
              className="grid place-items-center w-9 h-9 rounded-xl text-text-3 hover:text-rose-glow hover:bg-rose/5 transition-colors"
              title="Delete list"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {['all', 'todo', 'in_progress', 'done'].map(f => {
            const active = filter === f;
            const label = f === 'all' ? 'All' : f === 'todo' ? 'To Do' : f === 'in_progress' ? 'In Progress' : 'Done';
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="inline-flex items-center px-3 py-1.5 rounded-xl text-[11px] font-mono uppercase tracking-wider transition-all"
                style={active
                  ? { background: `rgb(var(--${color}) / 0.14)`, color: `rgb(var(--${color}-glow))`, boxShadow: `inset 0 0 0 1px rgb(var(--${color}) / 0.28)` }
                  : { background: 'rgba(255,255,255,0.04)', color: 'rgb(var(--text-3))', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick add */}
      <form onSubmit={handleQuickAdd} className="mb-6 flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="gtd-input flex-1"
          placeholder="Add an item or paste a link…"
        />
        <button
          type="submit"
          disabled={adding || !newTitle.trim()}
          className="gtd-btn gtd-btn-primary inline-flex items-center gap-1.5 text-[12.5px] disabled:opacity-50"
        >
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          {adding && isUrl(newTitle.trim()) ? 'Extracting…' : 'Add'}
        </button>
      </form>

      {/* Items */}
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl glass p-10 text-center relative overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(circle at 50% 30%, rgb(var(--${color}) / 0.10), transparent 60%)` }}
          />
          <div className="relative">
            <div
              className="inline-grid place-items-center w-14 h-14 rounded-2xl mb-4"
              style={{ background: `rgb(var(--${color}) / 0.10)`, boxShadow: `inset 0 0 0 1px rgb(var(--${color}) / 0.25)` }}
            >
              <Icon className="w-6 h-6" style={{ color: `rgb(var(--${color}-glow))` }} />
            </div>
            <div className="mono-label mb-2" style={{ color: `rgb(var(--${color}-glow))` }}>
              {filter !== 'all' ? 'no_matches' : 'empty_list'}
            </div>
            <div className="font-display italic text-[28px] mb-1">
              {filter !== 'all' ? 'Nothing here yet.' : 'Start adding items.'}
            </div>
            <p className="text-[13px] text-text-2">
              {filter !== 'all' ? 'Try a different filter.' : 'Use the input above to add your first item.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item, idx) => {
            const dotStyle = STATUS_DOT[item.status] || STATUS_DOT.todo;
            return (
              <div
                key={item.id}
                className="group glass rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors cursor-pointer"
                onClick={() => { setEditItem(item); setShowItemModal(true); }}
              >
                {/* Status dot — click cycles status */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleStatusCycle(item); }}
                  className="w-5 h-5 rounded-full grid place-items-center flex-shrink-0 transition-all hover:scale-110"
                  style={{ background: dotStyle.bg, boxShadow: `inset 0 0 0 1.5px ${dotStyle.border}` }}
                  title={`Status: ${item.status}`}
                >
                  {item.status === 'done' && (
                    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 4" stroke={`rgb(var(--mint-glow))`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className={`text-[13.5px] font-medium truncate ${item.status === 'done' ? 'line-through text-text-3' : ''}`}>
                    {item.title}
                  </div>
                  {item.notes && (
                    <div className="text-[11.5px] text-text-3 truncate mt-0.5">{item.notes}</div>
                  )}
                </div>

                {/* Badges */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-text-3 hover:text-text-1 transition-colors"
                      title="Open link"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {item.linked_task_id && (
                    <ListTodo className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgb(var(--mint-glow))' }} title="Linked to task" />
                  )}
                  {item.rating && (
                    <div className="flex items-center gap-0.5">
                      <Star className="w-3 h-3" style={{ color: 'rgb(var(--amber-glow))', fill: 'rgb(var(--amber-glow))' }} />
                      <span className="font-mono text-[10px] text-text-3">{item.rating}</span>
                    </div>
                  )}

                  {/* Reorder */}
                  <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReorder(idx, -1); }}
                      className="text-text-3 hover:text-text-1 p-0.5"
                      disabled={idx === 0}
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReorder(idx, 1); }}
                      className="text-text-3 hover:text-text-1 p-0.5"
                      disabled={idx === filteredItems.length - 1}
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Item modal */}
      {showItemModal && (
        <ListItemModal
          item={editItem}
          listId={parseInt(listId)}
          listColor={color}
          onClose={() => { setShowItemModal(false); setEditItem(null); }}
          onSave={() => { fetchData(); refreshCustomLists?.(); }}
        />
      )}

      {/* Edit list modal */}
      {editingList && (
        <NewListModal
          list={list}
          onClose={() => setEditingList(false)}
          onSave={() => { fetchData(); refreshCustomLists?.(); }}
        />
      )}

      {/* Delete list confirm */}
      {confirmDeleteList && (
        <ConfirmModal
          title="Delete list?"
          message={`"${list.name}" and all its items will be permanently removed.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteList}
          onCancel={() => setConfirmDeleteList(false)}
        />
      )}
    </div>
  );
}
