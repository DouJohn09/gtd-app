import { useState, useEffect } from 'react';
import { Sparkles, Inbox, Target, CheckCircle2, ArrowRight, FileText, Upload, Copy, Trash2, Check, Pencil, X } from 'lucide-react';
import { api } from '../lib/api';
import MonoLabel from '../components/ui/MonoLabel';

const LIST_OPTIONS = [
  { value: 'inbox', label: 'inbox' },
  { value: 'next_actions', label: 'next actions' },
  { value: 'waiting_for', label: 'waiting for' },
  { value: 'someday_maybe', label: 'someday/maybe' },
];
const ENERGY_OPTIONS = [
  { value: '', label: '—' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
];

const CONF_RANK = { high: 3, medium: 2, low: 1 };
const showField = (item, field, min = 'medium') => {
  const c = item?.confidence?.[field];
  if (!c) return true;
  return CONF_RANK[c] >= CONF_RANK[min];
};
const fadeIfMedium = (item, field) => {
  const c = item?.confidence?.[field];
  return c === 'medium' ? 'opacity-60' : '';
};

export default function AIAssistant() {
  const [inboxResult, setInboxResult] = useState(null);
  const [prioritiesResult, setPrioritiesResult] = useState(null);
  const [loading, setLoading] = useState({ inbox: false, priorities: false, import: false, duplicates: false });
  const [applying, setApplying] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [importSelected, setImportSelected] = useState(new Set());
  const [importDone, setImportDone] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingInboxIndex, setEditingInboxIndex] = useState(null);
  const [prioritiesKept, setPrioritiesKept] = useState(new Set());
  const [contexts, setContexts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [dupResult, setDupResult] = useState(null);
  const [dupSelected, setDupSelected] = useState(new Set());
  const [dupDone, setDupDone] = useState(null);

  useEffect(() => {
    api.contexts.getAll().then(setContexts).catch(console.error);
    api.projects.getAll().then(setProjects).catch(console.error);
  }, []);

  const processInbox = async () => {
    setLoading(l => ({ ...l, inbox: true }));
    try { setInboxResult(await api.ai.processInbox()); }
    catch (error) { console.error('Failed to process inbox:', error); }
    finally { setLoading(l => ({ ...l, inbox: false })); }
  };

  const getDailyPriorities = async () => {
    setLoading(l => ({ ...l, priorities: true }));
    try {
      const result = await api.ai.getDailyPriorities();
      setPrioritiesResult(result);
      if (result?.suggested_focus) {
        setPrioritiesKept(new Set(result.suggested_focus.map(f => f.task_index)));
      }
    }
    catch (error) { console.error('Failed to get priorities:', error); }
    finally { setLoading(l => ({ ...l, priorities: false })); }
  };

  const togglePriorityKept = (taskIndex) => {
    setPrioritiesKept(prev => {
      const next = new Set(prev);
      next.has(taskIndex) ? next.delete(taskIndex) : next.add(taskIndex);
      return next;
    });
  };

  const applyInboxProcessing = async () => {
    if (!inboxResult?.processed_items) return;
    setApplying(true);
    try {
      const items = inboxResult.processed_items.map((item) => ({
        task_id: inboxResult.tasks[item.original_index - 1]?.id,
        ...item,
      })).filter(item => item.task_id);
      await api.ai.applyInboxProcessing(items);
      setInboxResult(null);
      setEditingInboxIndex(null);
    } finally { setApplying(false); }
  };

  const updateInboxItem = (index, patch) => {
    setInboxResult(prev => {
      if (!prev) return prev;
      const processed_items = prev.processed_items.map((it, i) => (i === index ? { ...it, ...patch } : it));
      return { ...prev, processed_items };
    });
  };

  const applyDailyFocus = async () => {
    if (!prioritiesResult?.suggested_focus) return;
    setApplying(true);
    try {
      const taskIds = prioritiesResult.suggested_focus
        .filter(f => prioritiesKept.has(f.task_index))
        .map(f => prioritiesResult.tasks[f.task_index - 1]?.id)
        .filter(Boolean);
      await api.ai.applyDailyFocus(taskIds);
      setPrioritiesResult(null);
      setPrioritiesKept(new Set());
    } finally { setApplying(false); }
  };

  const analyzeImport = async () => {
    if (!importText.trim()) return;
    setLoading(l => ({ ...l, import: true }));
    setImportDone(null);
    setEditingIndex(null);
    try {
      const result = await api.ai.importNotes(importText);
      setImportResult({ ...result, mode: 'ai' });
      if (result?.items) setImportSelected(new Set(result.items.map((_, i) => i)));
    } catch (error) { console.error('Failed to analyze notes:', error); }
    finally { setLoading(l => ({ ...l, import: false })); }
  };

  const splitImport = () => {
    if (!importText.trim()) return;
    setImportDone(null);
    setEditingIndex(null);
    const items = importText
      .split('\n')
      .map(l => l.replace(/^\s*[-*•]\s+/, '').trim())
      .filter(Boolean)
      .map(title => ({
        title,
        notes: null,
        recommended_list: 'inbox',
        context: null,
        project_id: null,
        due_date: null,
        waiting_for_person: null,
        is_daily_focus: false,
        priority: null,
        energy_level: null,
        time_estimate: null,
        reasoning: null,
      }));
    if (items.length === 0) return;
    setImportResult({ items, mode: 'raw' });
    setImportSelected(new Set(items.map((_, i) => i)));
  };

  const toggleImportItem = (index) => {
    setImportSelected(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const updateImportItem = (index, patch) => {
    setImportResult(prev => {
      if (!prev) return prev;
      const items = prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
      return { ...prev, items };
    });
  };

  const applyImport = async () => {
    if (!importResult?.items) return;
    setApplying(true);
    try {
      const items = importResult.items.filter((_, i) => importSelected.has(i));
      const result = await api.ai.applyImport(items);
      setImportDone(result.count);
      setImportResult(null); setImportText(''); setImportSelected(new Set()); setEditingIndex(null);
    } finally { setApplying(false); }
  };

  const scanDuplicates = async () => {
    setLoading(l => ({ ...l, duplicates: true }));
    setDupDone(null);
    try {
      const result = await api.ai.findDuplicates();
      setDupResult(result);
      if (result?.duplicate_groups) {
        const toRemove = new Set();
        result.duplicate_groups.forEach(group => {
          group.tasks.forEach(t => { if (!t.keep) toRemove.add(t.id); });
        });
        setDupSelected(toRemove);
      }
    } catch (error) { console.error('Failed to scan duplicates:', error); }
    finally { setLoading(l => ({ ...l, duplicates: false })); }
  };

  const toggleDupItem = (id) => {
    setDupSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const applyDuplicates = async () => {
    if (dupSelected.size === 0) return;
    setApplying(true);
    try {
      const result = await api.ai.applyDuplicates([...dupSelected]);
      setDupDone(result.count);
      setDupResult(null); setDupSelected(new Set());
    } finally { setApplying(false); }
  };

  return (
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <MonoLabel tone="violet" className="mb-3">intelligence</MonoLabel>
        <h1 className="font-display text-[52px] md:text-[60px] leading-[1] tracking-tight flex items-baseline gap-3">
          AI Assistant
          <Sparkles className="w-6 h-6 self-center" style={{ color: 'rgb(var(--violet-glow))' }} />
        </h1>
        <p className="font-display italic text-[18px] text-text-2 mt-2">
          Process, prioritize, dedupe — at the speed of thought.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Process Inbox */}
        <ToolCard
          tone="amber"
          eyebrow="process"
          title="Process Inbox"
          subtitle="Sort & categorize captured items."
          icon={Inbox}
        >
          <PrimaryAction
            tone="amber"
            loading={loading.inbox}
            onClick={processInbox}
            label="Analyze Inbox"
            loadingLabel="Processing…"
          />

          {inboxResult?.processed_items && (
            <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-2">
              {inboxResult.processed_items.map((item, i) => {
                const editing = editingInboxIndex === i;
                const originalTitle = inboxResult.tasks[item.original_index - 1]?.title;
                return (
                  <div
                    key={i}
                    className="rounded-xl p-3"
                    style={{ background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}
                  >
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'rgb(var(--mint-glow))' }} />
                      <div className="flex-1 min-w-0">
                        {editing ? (
                          <input
                            type="text"
                            value={item.suggested_title || originalTitle || ''}
                            onChange={(e) => updateInboxItem(i, { suggested_title: e.target.value })}
                            className="gtd-input text-[13px] font-medium py-1.5"
                          />
                        ) : (
                          <span className="text-[13px] font-medium text-text-1">
                            {item.suggested_title || originalTitle}
                          </span>
                        )}
                        {!editing && (
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <ArrowRight className="w-3 h-3 text-text-3" />
                            <span className={`gtd-badge list-${item.recommended_list} ${fadeIfMedium(item, 'list')}`}>
                              {item.recommended_list.replace('_', ' ')}
                            </span>
                            {item.context && showField(item, 'context') && (
                              <span className={`context-badge ${fadeIfMedium(item, 'context')}`}>{item.context}</span>
                            )}
                            {item.priority != null && showField(item, 'priority') && (
                              <span className={`font-mono text-[10.5px] text-text-3 ${fadeIfMedium(item, 'priority')}`}>p{item.priority}</span>
                            )}
                          </div>
                        )}
                        {!editing && item.reasoning && (
                          <p className="text-[11.5px] text-text-3 mt-1.5 leading-relaxed">{item.reasoning}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingInboxIndex(editing ? null : i)}
                        aria-label={editing ? 'Close edit' : 'Edit suggestion'}
                        className="flex-shrink-0 w-7 h-7 rounded-lg grid place-items-center text-text-3 hover:text-text-1 transition-colors"
                        style={{ background: 'rgba(255,255,255,0.03)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}
                      >
                        {editing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {editing && (
                      <div className="mt-3 pl-6 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="gtd-label">List</label>
                            <select
                              value={item.recommended_list}
                              onChange={(e) => updateInboxItem(i, { recommended_list: e.target.value })}
                              className="gtd-input text-[12.5px] py-2"
                            >
                              {LIST_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="gtd-label">Context</label>
                            <select
                              value={item.context || ''}
                              onChange={(e) => updateInboxItem(i, { context: e.target.value || null })}
                              className="gtd-input text-[12.5px] py-2"
                            >
                              <option value="">No context</option>
                              {contexts.map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="gtd-label">Project</label>
                            <select
                              value={item.project_id ?? ''}
                              onChange={(e) => updateInboxItem(i, { project_id: e.target.value ? Number(e.target.value) : null })}
                              className="gtd-input text-[12.5px] py-2"
                            >
                              <option value="">No project</option>
                              {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="gtd-label">Due Date</label>
                            <input
                              type="date"
                              value={item.due_date || ''}
                              onChange={(e) => updateInboxItem(i, { due_date: e.target.value || null })}
                              className="gtd-input text-[12.5px] py-2"
                            />
                          </div>
                          <div>
                            <label className="gtd-label">Energy</label>
                            <select
                              value={item.energy_level || ''}
                              onChange={(e) => updateInboxItem(i, { energy_level: e.target.value || null })}
                              className="gtd-input text-[12.5px] py-2"
                            >
                              {ENERGY_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="gtd-label">Time (min)</label>
                            <input
                              type="number"
                              min="0"
                              value={item.time_estimate ?? ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                updateInboxItem(i, { time_estimate: v === '' ? null : Number(v) });
                              }}
                              className="gtd-input text-[12.5px] py-2"
                              placeholder="—"
                            />
                          </div>
                        </div>
                        {item.recommended_list === 'waiting_for' && (
                          <div>
                            <label className="gtd-label">Waiting on</label>
                            <input
                              type="text"
                              value={item.waiting_for_person || ''}
                              onChange={(e) => updateInboxItem(i, { waiting_for_person: e.target.value || null })}
                              className="gtd-input text-[12.5px] py-2"
                              placeholder="Who?"
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingInboxIndex(null)}
                          className="gtd-btn gtd-btn-secondary w-full text-[12px]"
                        >
                          Done
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                onClick={applyInboxProcessing}
                disabled={applying}
                className="gtd-btn gtd-btn-primary w-full mt-3 text-[12.5px] disabled:opacity-60"
              >
                {applying ? 'Applying…' : 'Apply All Suggestions'}
              </button>
            </div>
          )}
        </ToolCard>

        {/* Daily Focus */}
        <ToolCard
          tone="mint"
          eyebrow="focus"
          title="Daily Focus"
          subtitle="AI suggests today's priorities."
          icon={Target}
        >
          <PrimaryAction
            tone="mint"
            loading={loading.priorities}
            onClick={getDailyPriorities}
            label="Get Suggestions"
            loadingLabel="Analyzing…"
          />

          {prioritiesResult?.suggested_focus && (
            <div className="mt-4 pt-4 border-t border-white/[0.05]">
              {prioritiesResult.productivity_tip && (
                <div
                  className="rounded-xl p-3 mb-3"
                  style={{ background: 'rgb(var(--violet) / 0.06)', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.20)' }}
                >
                  <div className="mono-label mb-1" style={{ color: 'rgb(var(--violet-glow))' }}>tip</div>
                  <p className="text-[12.5px] text-text-1 leading-relaxed">{prioritiesResult.productivity_tip}</p>
                </div>
              )}
              <div className="space-y-2">
                {prioritiesResult.suggested_focus.map((item, i) => {
                  const kept = prioritiesKept.has(item.task_index);
                  const conf = item.confidence;
                  return (
                    <div
                      key={i}
                      className="rounded-xl p-3 flex items-start gap-3 transition-all"
                      style={
                        kept
                          ? { background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }
                          : { background: 'rgba(255,255,255,0.01)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)', opacity: 0.45 }
                      }
                    >
                      <span className="font-mono text-[11px] text-mint-glow mt-0.5 flex-shrink-0">
                        {(i + 1).toString().padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={`text-[13px] font-medium text-text-1 ${kept ? '' : 'line-through'}`}>
                          {prioritiesResult.tasks[item.task_index - 1]?.title}
                        </div>
                        {kept && conf && (
                          <span
                            className="inline-block font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded mt-1"
                            style={
                              conf === 'high'
                                ? { background: 'rgb(var(--mint) / 0.12)', color: 'rgb(var(--mint-glow))' }
                                : conf === 'medium'
                                ? { background: 'rgba(255,255,255,0.04)', color: 'rgb(var(--text-3))' }
                                : { background: 'rgb(var(--amber) / 0.10)', color: 'rgb(var(--amber-glow))' }
                            }
                          >
                            {conf}
                          </span>
                        )}
                        {kept && (
                          <p className="text-[11.5px] text-text-3 mt-1 leading-relaxed">{item.reason}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => togglePriorityKept(item.task_index)}
                        aria-label={kept ? 'Remove from focus' : 'Restore to focus'}
                        className="flex-shrink-0 w-7 h-7 rounded-lg grid place-items-center text-text-3 hover:text-text-1 transition-colors"
                        style={{ background: 'rgba(255,255,255,0.03)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}
                      >
                        {kept ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={applyDailyFocus}
                disabled={applying || prioritiesKept.size === 0}
                className="gtd-btn gtd-btn-primary w-full mt-3 text-[12.5px] disabled:opacity-60"
              >
                {applying ? 'Applying…' : `Set ${prioritiesKept.size} as Today's Focus`}
              </button>
            </div>
          )}
        </ToolCard>
      </div>

      {/* Find Duplicates */}
      <ToolCard
        tone="rose"
        eyebrow="cleanup"
        title="Find Duplicates"
        subtitle="Scan for similar or repeated tasks."
        icon={Copy}
        className="mt-5"
      >
        {dupDone !== null && !dupResult && (
          <SuccessCallout>
            Removed {dupDone} duplicate {dupDone === 1 ? 'task' : 'tasks'}.
          </SuccessCallout>
        )}

        {!dupResult && (
          <PrimaryAction
            tone="rose"
            loading={loading.duplicates}
            onClick={scanDuplicates}
            label="Scan for Duplicates"
            loadingLabel="Scanning…"
          />
        )}

        {dupResult?.duplicate_groups && (
          <div className="space-y-4">
            <p className="text-[12.5px] text-text-2 mt-2">{dupResult.summary}</p>

            {dupResult.duplicate_groups.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-40" style={{ color: 'rgb(var(--mint-glow))' }} />
                <div className="font-display italic text-[20px] mb-1">All clean.</div>
                <p className="text-[12px] text-text-2">No duplicates found.</p>
              </div>
            ) : (
              <>
                {dupResult.duplicate_groups.map((group, gi) => (
                  <div
                    key={gi}
                    className="rounded-xl p-3"
                    style={{ background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}
                  >
                    <p className="font-mono text-[10.5px] text-text-3 uppercase tracking-wider mb-2">{group.reason}</p>
                    <div className="space-y-1.5">
                      {group.tasks.map(task => (
                        <button
                          key={task.id}
                          onClick={() => toggleDupItem(task.id)}
                          className="w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left"
                          style={
                            dupSelected.has(task.id)
                              ? { background: 'rgb(var(--rose) / 0.10)', boxShadow: 'inset 0 0 0 1px rgb(var(--rose) / 0.25)' }
                              : { background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }
                          }
                        >
                          <div
                            className="w-4 h-4 rounded grid place-items-center flex-shrink-0 transition-all"
                            style={
                              dupSelected.has(task.id)
                                ? { background: 'rgb(var(--rose))', boxShadow: '0 0 12px rgb(var(--rose) / 0.5)' }
                                : { boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.18)' }
                            }
                          >
                            {dupSelected.has(task.id) && <Trash2 className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span
                            className={`text-[13px] flex-1 min-w-0 truncate ${
                              dupSelected.has(task.id) ? 'line-through text-text-3' : 'text-text-1'
                            }`}
                          >
                            {task.title}
                          </span>
                          {!dupSelected.has(task.id) && (
                            <span
                              className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
                              style={{ background: 'rgb(var(--mint) / 0.10)', color: 'rgb(var(--mint-glow))' }}
                            >
                              keep
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setDupResult(null)}
                    className="gtd-btn gtd-btn-secondary flex-1 text-[12.5px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={applyDuplicates}
                    disabled={applying || dupSelected.size === 0}
                    className="gtd-btn flex-1 inline-flex items-center justify-center gap-2 text-[12.5px] disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(180deg, rgb(var(--rose) / 0.85), rgb(var(--rose) / 0.7))',
                      color: '#fff',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 16px rgb(var(--rose) / 0.30)',
                    }}
                  >
                    {applying ? 'Removing…' : (
                      <><Trash2 className="w-3.5 h-3.5" /> Remove {dupSelected.size}</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </ToolCard>

      {/* Import Notes */}
      <ToolCard
        tone="violet"
        eyebrow="import"
        title="Import Notes"
        subtitle="Paste raw text — AI structures it for you."
        icon={FileText}
        className="mt-5"
      >
        {importDone !== null && !importResult && (
          <SuccessCallout>
            Imported {importDone} {importDone === 1 ? 'task' : 'tasks'}. Check your lists.
          </SuccessCallout>
        )}

        {!importResult && (
          <>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="gtd-input min-h-[160px] mb-3 font-mono text-[12.5px]"
              placeholder={"Paste your notes here...\n\nExample:\n- Buy groceries for the week\n- Call dentist to schedule appointment\n- Waiting for Bob to send the report\n- Learn Spanish someday"}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <PrimaryAction
                tone="violet"
                loading={loading.import}
                onClick={analyzeImport}
                disabled={!importText.trim()}
                label="Analyze with AI"
                loadingLabel="Analyzing…"
              />
              <button
                type="button"
                onClick={splitImport}
                disabled={!importText.trim() || loading.import}
                className="gtd-btn gtd-btn-secondary inline-flex items-center justify-center gap-2 text-[13px] disabled:opacity-50"
              >
                <Inbox className="w-3.5 h-3.5" />
                Import as-is to inbox
              </button>
            </div>
            <p className="text-[11.5px] text-text-3 mt-2 leading-relaxed">
              <span className="text-text-2">AI</span> categorizes, tags, and estimates each item.
              <span className="text-text-2"> As-is</span> drops every line into your inbox unchanged.
            </p>
          </>
        )}

        {importResult?.items && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-text-3 uppercase tracking-wider">
                {importResult.items.length} {importResult.items.length === 1 ? 'item' : 'items'} found
                {importResult.mode === 'raw' && <span className="ml-2 text-text-2">· raw</span>}
              </span>
              <button
                onClick={() => {
                  if (importSelected.size === importResult.items.length) setImportSelected(new Set());
                  else setImportSelected(new Set(importResult.items.map((_, i) => i)));
                }}
                className="font-mono text-[11px] text-violet-glow hover:text-violet uppercase tracking-wider"
              >
                {importSelected.size === importResult.items.length ? 'deselect_all' : 'select_all'}
              </button>
            </div>

            {importResult.items.map((item, i) => {
              const sel = importSelected.has(i);
              const editing = editingIndex === i;
              return (
                <div
                  key={i}
                  className="rounded-xl p-3 transition-all"
                  style={
                    sel
                      ? { background: 'rgb(var(--violet) / 0.06)', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.25)' }
                      : { background: 'rgba(255,255,255,0.015)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)', opacity: 0.6 }
                  }
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleImportItem(i)}
                      aria-label={sel ? 'Deselect item' : 'Select item'}
                      className="mt-0.5 w-4 h-4 rounded grid place-items-center flex-shrink-0 transition-all"
                      style={
                        sel
                          ? { background: 'rgb(var(--violet))', boxShadow: '0 0 12px rgb(var(--violet) / 0.5)' }
                          : { boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.18)' }
                      }
                    >
                      {sel && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      {editing ? (
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => updateImportItem(i, { title: e.target.value })}
                          className="gtd-input text-[13.5px] font-medium py-1.5"
                          placeholder="Title"
                        />
                      ) : (
                        <span className="text-[13.5px] font-medium text-text-1">{item.title}</span>
                      )}
                      {!editing && item.notes && (
                        <p className="text-[11.5px] text-text-3 mt-0.5">{item.notes}</p>
                      )}
                      {!editing && (
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <ArrowRight className="w-3 h-3 text-text-3" />
                          <span className={`gtd-badge list-${item.recommended_list} ${fadeIfMedium(item, 'list')}`}>
                            {item.recommended_list.replace('_', ' ')}
                          </span>
                          {item.context && showField(item, 'context') && (
                            <span className={`context-badge ${fadeIfMedium(item, 'context')}`}>{item.context}</span>
                          )}
                          {item.project_id && showField(item, 'project') && (
                            <span className={`font-mono text-[10.5px] text-text-3 ${fadeIfMedium(item, 'project')}`}>
                              proj:{projects.find(p => p.id === Number(item.project_id))?.name || '?'}
                            </span>
                          )}
                          {item.due_date && showField(item, 'due_date') && (
                            <span className={`font-mono text-[10.5px] text-text-3 ${fadeIfMedium(item, 'due_date')}`}>due:{item.due_date}</span>
                          )}
                          {item.waiting_for_person && showField(item, 'waiting_for') && (
                            <span className={`font-mono text-[10.5px] text-text-3 ${fadeIfMedium(item, 'waiting_for')}`}>@{item.waiting_for_person}</span>
                          )}
                          {item.energy_level && showField(item, 'energy') && (
                            <span className={`font-mono text-[10.5px] text-text-3 ${fadeIfMedium(item, 'energy')}`}>energy:{item.energy_level}</span>
                          )}
                          {item.time_estimate && showField(item, 'time') && (
                            <span className={`font-mono text-[10.5px] text-text-3 ${fadeIfMedium(item, 'time')}`}>{item.time_estimate}m</span>
                          )}
                          {item.is_daily_focus && showField(item, 'daily_focus') && (
                            <span className={`font-mono text-[10.5px] ${fadeIfMedium(item, 'daily_focus')}`} style={{ color: 'rgb(var(--amber-glow))' }}>★ today</span>
                          )}
                        </div>
                      )}
                      {!editing && item.reasoning && (
                        <p className="text-[11.5px] text-text-3 mt-1.5 leading-relaxed">{item.reasoning}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingIndex(editing ? null : i)}
                      aria-label={editing ? 'Close edit' : 'Edit item'}
                      className="flex-shrink-0 w-7 h-7 rounded-lg grid place-items-center text-text-3 hover:text-text-1 transition-colors"
                      style={{ background: 'rgba(255,255,255,0.03)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}
                    >
                      {editing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {editing && (
                    <div className="mt-3 pl-7 space-y-3">
                      <div>
                        <label className="gtd-label">Notes</label>
                        <textarea
                          value={item.notes || ''}
                          onChange={(e) => updateImportItem(i, { notes: e.target.value || null })}
                          className="gtd-input text-[12.5px] min-h-[60px]"
                          placeholder="Optional details"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="gtd-label">List</label>
                          <select
                            value={item.recommended_list}
                            onChange={(e) => updateImportItem(i, { recommended_list: e.target.value })}
                            className="gtd-input text-[12.5px] py-2"
                          >
                            {LIST_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="gtd-label">Context</label>
                          <select
                            value={item.context || ''}
                            onChange={(e) => updateImportItem(i, { context: e.target.value || null })}
                            className="gtd-input text-[12.5px] py-2"
                          >
                            <option value="">No context</option>
                            {contexts.map(c => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="gtd-label">Project</label>
                          <select
                            value={item.project_id ?? ''}
                            onChange={(e) => updateImportItem(i, { project_id: e.target.value ? Number(e.target.value) : null })}
                            className="gtd-input text-[12.5px] py-2"
                          >
                            <option value="">No project</option>
                            {projects.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="gtd-label">Due Date</label>
                          <input
                            type="date"
                            value={item.due_date || ''}
                            onChange={(e) => updateImportItem(i, { due_date: e.target.value || null })}
                            className="gtd-input text-[12.5px] py-2"
                          />
                        </div>
                        <div>
                          <label className="gtd-label">Energy</label>
                          <select
                            value={item.energy_level || ''}
                            onChange={(e) => updateImportItem(i, { energy_level: e.target.value || null })}
                            className="gtd-input text-[12.5px] py-2"
                          >
                            {ENERGY_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="gtd-label">Time (min)</label>
                          <input
                            type="number"
                            min="0"
                            value={item.time_estimate ?? ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              updateImportItem(i, { time_estimate: v === '' ? null : Number(v) });
                            }}
                            className="gtd-input text-[12.5px] py-2"
                            placeholder="—"
                          />
                        </div>
                      </div>

                      {item.recommended_list === 'waiting_for' && (
                        <div>
                          <label className="gtd-label">Waiting on</label>
                          <input
                            type="text"
                            value={item.waiting_for_person || ''}
                            onChange={(e) => updateImportItem(i, { waiting_for_person: e.target.value || null })}
                            className="gtd-input text-[12.5px] py-2"
                            placeholder="Who?"
                          />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => updateImportItem(i, { is_daily_focus: !item.is_daily_focus })}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left"
                        style={
                          item.is_daily_focus
                            ? { background: 'rgb(var(--amber) / 0.08)', boxShadow: 'inset 0 0 0 1px rgb(var(--amber) / 0.28)' }
                            : { background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }
                        }
                      >
                        <div
                          className="w-9 h-5 rounded-full relative transition-all flex-shrink-0"
                          style={
                            item.is_daily_focus
                              ? { background: 'rgb(var(--amber) / 0.6)', boxShadow: 'inset 0 0 0 1px rgb(var(--amber) / 0.5)' }
                              : { background: 'rgba(255,255,255,0.05)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)' }
                          }
                        >
                          <div
                            className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                            style={{
                              left: item.is_daily_focus ? '18px' : '2px',
                              background: item.is_daily_focus ? 'rgb(var(--amber-glow))' : 'rgba(255,255,255,0.65)',
                              boxShadow: item.is_daily_focus ? '0 0 8px rgb(var(--amber) / 0.55)' : 'none',
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-medium text-text-1 inline-flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3" style={{ color: item.is_daily_focus ? 'rgb(var(--amber-glow))' : 'rgb(var(--text-3))' }} />
                            Add to today's focus
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingIndex(null)}
                        className="gtd-btn gtd-btn-secondary w-full text-[12px]"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setImportResult(null); setEditingIndex(null); }}
                className="gtd-btn gtd-btn-secondary flex-1 text-[12.5px]"
              >
                Back
              </button>
              <button
                onClick={applyImport}
                disabled={applying || importSelected.size === 0}
                className="gtd-btn gtd-btn-primary flex-1 inline-flex items-center justify-center gap-2 text-[12.5px] disabled:opacity-50"
              >
                {applying ? 'Importing…' : (
                  <><Upload className="w-3.5 h-3.5" /> Import {importSelected.size}</>
                )}
              </button>
            </div>
          </div>
        )}
      </ToolCard>
    </div>
  );
}

function ToolCard({ tone = 'violet', eyebrow, title, subtitle, icon: Icon, children, className = '' }) {
  return (
    <div
      className={`relative rounded-2xl glass p-5 overflow-hidden ${className}`}
    >
      <div
        className="absolute -top-12 -right-12 w-44 h-44 rounded-full pointer-events-none opacity-70"
        style={{ background: `radial-gradient(circle, rgb(var(--${tone}) / 0.12), transparent 70%)` }}
      />
      <div className="relative">
        <div className="flex items-start gap-3 mb-4">
          <div
            className="grid place-items-center w-10 h-10 rounded-xl flex-shrink-0"
            style={{ background: `rgb(var(--${tone}) / 0.12)`, boxShadow: `inset 0 0 0 1px rgb(var(--${tone}) / 0.22)` }}
          >
            <Icon className="w-4 h-4" style={{ color: `rgb(var(--${tone}-glow))` }} />
          </div>
          <div className="min-w-0">
            <div className="mono-label" style={{ color: `rgb(var(--${tone}-glow))` }}>{eyebrow}</div>
            <h2 className="font-display text-[22px] leading-tight mt-0.5">{title}</h2>
            <p className="text-[12.5px] text-text-2 mt-0.5">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function PrimaryAction({ tone, loading, onClick, disabled, label, loadingLabel }) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-[13px] transition-all disabled:opacity-50"
      style={{
        background: `linear-gradient(180deg, rgb(var(--${tone}) / 0.18), rgb(var(--${tone}) / 0.10))`,
        color: `rgb(var(--${tone}-glow))`,
        boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(var(--${tone}) / 0.30), 0 4px 16px rgb(var(--${tone}) / 0.12)`,
      }}
    >
      {loading ? loadingLabel : (
        <><Sparkles className="w-3.5 h-3.5" /> {label}</>
      )}
    </button>
  );
}

function SuccessCallout({ children }) {
  return (
    <div
      className="rounded-xl p-3 mb-4 flex items-center gap-2.5"
      style={{ background: 'rgb(var(--mint) / 0.08)', boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.22)' }}
    >
      <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'rgb(var(--mint-glow))' }} />
      <p className="text-[12.5px] text-text-1">{children}</p>
    </div>
  );
}
