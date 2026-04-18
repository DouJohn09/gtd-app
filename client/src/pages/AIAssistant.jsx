import { useState } from 'react';
import { Sparkles, Inbox, Target, CheckCircle2, ArrowRight, FileText, Upload, Copy, Trash2, Check } from 'lucide-react';
import { api } from '../lib/api';
import MonoLabel from '../components/ui/MonoLabel';

export default function AIAssistant() {
  const [inboxResult, setInboxResult] = useState(null);
  const [prioritiesResult, setPrioritiesResult] = useState(null);
  const [loading, setLoading] = useState({ inbox: false, priorities: false, import: false, duplicates: false });
  const [applying, setApplying] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [importSelected, setImportSelected] = useState(new Set());
  const [importDone, setImportDone] = useState(null);
  const [dupResult, setDupResult] = useState(null);
  const [dupSelected, setDupSelected] = useState(new Set());
  const [dupDone, setDupDone] = useState(null);

  const processInbox = async () => {
    setLoading(l => ({ ...l, inbox: true }));
    try { setInboxResult(await api.ai.processInbox()); }
    catch (error) { console.error('Failed to process inbox:', error); }
    finally { setLoading(l => ({ ...l, inbox: false })); }
  };

  const getDailyPriorities = async () => {
    setLoading(l => ({ ...l, priorities: true }));
    try { setPrioritiesResult(await api.ai.getDailyPriorities()); }
    catch (error) { console.error('Failed to get priorities:', error); }
    finally { setLoading(l => ({ ...l, priorities: false })); }
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
    } finally { setApplying(false); }
  };

  const applyDailyFocus = async () => {
    if (!prioritiesResult?.suggested_focus) return;
    setApplying(true);
    try {
      const taskIds = prioritiesResult.suggested_focus.map(f => prioritiesResult.tasks[f.task_index - 1]?.id).filter(Boolean);
      await api.ai.applyDailyFocus(taskIds);
      setPrioritiesResult(null);
    } finally { setApplying(false); }
  };

  const analyzeImport = async () => {
    if (!importText.trim()) return;
    setLoading(l => ({ ...l, import: true }));
    setImportDone(null);
    try {
      const result = await api.ai.importNotes(importText);
      setImportResult(result);
      if (result?.items) setImportSelected(new Set(result.items.map((_, i) => i)));
    } catch (error) { console.error('Failed to analyze notes:', error); }
    finally { setLoading(l => ({ ...l, import: false })); }
  };

  const toggleImportItem = (index) => {
    setImportSelected(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const applyImport = async () => {
    if (!importResult?.items) return;
    setApplying(true);
    try {
      const items = importResult.items.filter((_, i) => importSelected.has(i));
      const result = await api.ai.applyImport(items);
      setImportDone(result.count);
      setImportResult(null); setImportText(''); setImportSelected(new Set());
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
              {inboxResult.processed_items.map((item, i) => (
                <div
                  key={i}
                  className="rounded-xl p-3"
                  style={{ background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'rgb(var(--mint-glow))' }} />
                    <span className="text-[13px] font-medium text-text-1">
                      {item.suggested_title || inboxResult.tasks[item.original_index - 1]?.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <ArrowRight className="w-3 h-3 text-text-3" />
                    <span className={`gtd-badge list-${item.recommended_list}`}>{item.recommended_list.replace('_', ' ')}</span>
                    {item.context && <span className="context-badge">{item.context}</span>}
                  </div>
                  <p className="text-[11.5px] text-text-3 mt-1.5 leading-relaxed">{item.reasoning}</p>
                </div>
              ))}
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
                {prioritiesResult.suggested_focus.map((item, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-3 flex items-start gap-3"
                    style={{ background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}
                  >
                    <span className="font-mono text-[11px] text-mint-glow mt-0.5 flex-shrink-0">
                      {(i + 1).toString().padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-text-1">
                        {prioritiesResult.tasks[item.task_index - 1]?.title}
                      </div>
                      <p className="text-[11.5px] text-text-3 mt-1 leading-relaxed">{item.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={applyDailyFocus}
                disabled={applying}
                className="gtd-btn gtd-btn-primary w-full mt-3 text-[12.5px] disabled:opacity-60"
              >
                {applying ? 'Applying…' : "Set as Today's Focus"}
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
            <PrimaryAction
              tone="violet"
              loading={loading.import}
              onClick={analyzeImport}
              disabled={!importText.trim()}
              label="Analyze & Categorize"
              loadingLabel="Analyzing…"
            />
          </>
        )}

        {importResult?.items && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-text-3 uppercase tracking-wider">
                {importResult.items.length} {importResult.items.length === 1 ? 'item' : 'items'} found
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
              return (
                <button
                  key={i}
                  onClick={() => toggleImportItem(i)}
                  className="w-full text-left rounded-xl p-3 transition-all"
                  style={
                    sel
                      ? { background: 'rgb(var(--violet) / 0.06)', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.25)' }
                      : { background: 'rgba(255,255,255,0.015)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)', opacity: 0.6 }
                  }
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 w-4 h-4 rounded grid place-items-center flex-shrink-0 transition-all"
                      style={
                        sel
                          ? { background: 'rgb(var(--violet))', boxShadow: '0 0 12px rgb(var(--violet) / 0.5)' }
                          : { boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.18)' }
                      }
                    >
                      {sel && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[13.5px] font-medium text-text-1">{item.title}</span>
                      {item.notes && <p className="text-[11.5px] text-text-3 mt-0.5">{item.notes}</p>}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <ArrowRight className="w-3 h-3 text-text-3" />
                        <span className={`gtd-badge list-${item.recommended_list}`}>
                          {item.recommended_list.replace('_', ' ')}
                        </span>
                        {item.context && <span className="context-badge">{item.context}</span>}
                        {item.energy_level && (
                          <span className="font-mono text-[10.5px] text-text-3">energy:{item.energy_level}</span>
                        )}
                        {item.time_estimate && (
                          <span className="font-mono text-[10.5px] text-text-3">{item.time_estimate}m</span>
                        )}
                      </div>
                      <p className="text-[11.5px] text-text-3 mt-1.5 leading-relaxed">{item.reasoning}</p>
                    </div>
                  </div>
                </button>
              );
            })}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setImportResult(null)}
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
