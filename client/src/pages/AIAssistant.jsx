import { useState } from 'react';
import { Sparkles, Inbox, Target, CheckCircle2, ArrowRight, FileText, Upload } from 'lucide-react';
import { api } from '../lib/api';

export default function AIAssistant() {
  const [inboxResult, setInboxResult] = useState(null);
  const [prioritiesResult, setPrioritiesResult] = useState(null);
  const [loading, setLoading] = useState({ inbox: false, priorities: false, import: false });
  const [applying, setApplying] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [importSelected, setImportSelected] = useState(new Set());
  const [importDone, setImportDone] = useState(null);

  const processInbox = async () => {
    setLoading(l => ({ ...l, inbox: true }));
    try {
      const result = await api.ai.processInbox();
      setInboxResult(result);
    } catch (error) {
      console.error('Failed to process inbox:', error);
    } finally {
      setLoading(l => ({ ...l, inbox: false }));
    }
  };

  const getDailyPriorities = async () => {
    setLoading(l => ({ ...l, priorities: true }));
    try {
      const result = await api.ai.getDailyPriorities();
      setPrioritiesResult(result);
    } catch (error) {
      console.error('Failed to get priorities:', error);
    } finally {
      setLoading(l => ({ ...l, priorities: false }));
    }
  };

  const applyInboxProcessing = async () => {
    if (!inboxResult?.processed_items) return;
    setApplying(true);
    try {
      const items = inboxResult.processed_items.map((item, i) => ({
        task_id: inboxResult.tasks[item.original_index - 1]?.id,
        ...item
      })).filter(item => item.task_id);
      await api.ai.applyInboxProcessing(items);
      setInboxResult(null);
    } finally {
      setApplying(false);
    }
  };

  const applyDailyFocus = async () => {
    if (!prioritiesResult?.suggested_focus) return;
    setApplying(true);
    try {
      const taskIds = prioritiesResult.suggested_focus.map(f => prioritiesResult.tasks[f.task_index - 1]?.id).filter(Boolean);
      await api.ai.applyDailyFocus(taskIds);
      setPrioritiesResult(null);
    } finally {
      setApplying(false);
    }
  };

  const analyzeImport = async () => {
    if (!importText.trim()) return;
    setLoading(l => ({ ...l, import: true }));
    setImportDone(null);
    try {
      const result = await api.ai.importNotes(importText);
      setImportResult(result);
      if (result?.items) {
        setImportSelected(new Set(result.items.map((_, i) => i)));
      }
    } catch (error) {
      console.error('Failed to analyze notes:', error);
    } finally {
      setLoading(l => ({ ...l, import: false }));
    }
  };

  const toggleImportItem = (index) => {
    setImportSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
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
      setImportResult(null);
      setImportText('');
      setImportSelected(new Set());
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-purple-500" />
          AI Assistant
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Let AI help you process and prioritize using GTD principles</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="gtd-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded-lg"><Inbox className="w-5 h-5 text-yellow-600" /></div>
            <div>
              <h2 className="font-semibold">Process Inbox</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">AI categorizes your inbox items</p>
            </div>
          </div>
          <button onClick={processInbox} disabled={loading.inbox} className="gtd-btn gtd-btn-primary w-full flex items-center justify-center gap-2">
            {loading.inbox ? 'Processing...' : <><Sparkles className="w-4 h-4" /> Analyze Inbox</>}
          </button>

          {inboxResult?.processed_items && (
            <div className="mt-4 pt-4 border-t dark:border-gray-700 space-y-3">
              {inboxResult.processed_items.map((item, i) => (
                <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="font-medium text-sm">{item.suggested_title || inboxResult.tasks[item.original_index - 1]?.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <ArrowRight className="w-3 h-3" />
                    <span className={`gtd-badge list-${item.recommended_list}`}>{item.recommended_list.replace('_', ' ')}</span>
                    {item.context && <span className="context-badge">{item.context}</span>}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.reasoning}</p>
                </div>
              ))}
              <button onClick={applyInboxProcessing} disabled={applying} className="gtd-btn gtd-btn-primary w-full mt-4">
                {applying ? 'Applying...' : 'Apply All Suggestions'}
              </button>
            </div>
          )}
        </div>

        <div className="gtd-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg"><Target className="w-5 h-5 text-green-600" /></div>
            <div>
              <h2 className="font-semibold">Daily Focus</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">AI suggests today's priorities</p>
            </div>
          </div>
          <button onClick={getDailyPriorities} disabled={loading.priorities} className="gtd-btn gtd-btn-primary w-full flex items-center justify-center gap-2">
            {loading.priorities ? 'Analyzing...' : <><Sparkles className="w-4 h-4" /> Get Suggestions</>}
          </button>

          {prioritiesResult?.suggested_focus && (
            <div className="mt-4 pt-4 border-t dark:border-gray-700">
              {prioritiesResult.productivity_tip && (
                <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3 mb-4">
                  <p className="text-sm text-blue-700 dark:text-blue-400"><strong>Tip:</strong> {prioritiesResult.productivity_tip}</p>
                </div>
              )}
              <div className="space-y-3">
                {prioritiesResult.suggested_focus.map((item, i) => (
                  <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <div className="font-medium text-sm">{prioritiesResult.tasks[item.task_index - 1]?.title}</div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.reason}</p>
                  </div>
                ))}
              </div>
              <button onClick={applyDailyFocus} disabled={applying} className="gtd-btn gtd-btn-primary w-full mt-4">
                {applying ? 'Applying...' : 'Set as Today\'s Focus'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Import Notes Section */}
      <div className="gtd-card mt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-lg"><FileText className="w-5 h-5 text-indigo-600" /></div>
          <div>
            <h2 className="font-semibold">Import Notes</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Paste notes from another app and let AI categorize them</p>
          </div>
        </div>

        {importDone !== null && !importResult && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800 dark:text-green-300">
              Successfully imported {importDone} {importDone === 1 ? 'task' : 'tasks'}! Check your lists.
            </p>
          </div>
        )}

        {!importResult && (
          <>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="gtd-input min-h-[160px] mb-3"
              placeholder={"Paste your notes here — one item per line, or free-form text...\n\nExample:\n- Buy groceries for the week\n- Call dentist to schedule appointment\n- Research vacation destinations\n- Waiting for Bob to send the report\n- Learn Spanish someday"}
            />
            <button
              onClick={analyzeImport}
              disabled={loading.import || !importText.trim()}
              className="gtd-btn gtd-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading.import ? 'Analyzing...' : <><Sparkles className="w-4 h-4" /> Analyze & Categorize</>}
            </button>
          </>
        )}

        {importResult?.items && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>{importResult.items.length} items found</span>
              <button
                onClick={() => {
                  if (importSelected.size === importResult.items.length) {
                    setImportSelected(new Set());
                  } else {
                    setImportSelected(new Set(importResult.items.map((_, i) => i)));
                  }
                }}
                className="text-blue-600 hover:underline"
              >
                {importSelected.size === importResult.items.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            {importResult.items.map((item, i) => (
              <div
                key={i}
                className={`rounded-lg p-3 border cursor-pointer transition-colors ${
                  importSelected.has(i) ? 'bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 opacity-60'
                }`}
                onClick={() => toggleImportItem(i)}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    importSelected.has(i) ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {importSelected.has(i) && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{item.title}</span>
                    {item.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.notes}</p>}
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                      <ArrowRight className="w-3 h-3 text-gray-400" />
                      <span className={`gtd-badge list-${item.recommended_list}`}>
                        {item.recommended_list.replace('_', ' ')}
                      </span>
                      {item.context && <span className="context-badge">{item.context}</span>}
                      {item.energy_level && (
                        <span className="text-gray-400">Energy: {item.energy_level}</span>
                      )}
                      {item.time_estimate && (
                        <span className="text-gray-400">{item.time_estimate}min</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{item.reasoning}</p>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setImportResult(null); }}
                className="gtd-btn gtd-btn-secondary flex-1"
              >
                Back
              </button>
              <button
                onClick={applyImport}
                disabled={applying || importSelected.size === 0}
                className="gtd-btn gtd-btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {applying ? 'Importing...' : <><Upload className="w-4 h-4" /> Import {importSelected.size} {importSelected.size === 1 ? 'item' : 'items'}</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
