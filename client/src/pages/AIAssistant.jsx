import { useState } from 'react';
import { Sparkles, Inbox, Target, CheckCircle2, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';

export default function AIAssistant() {
  const [inboxResult, setInboxResult] = useState(null);
  const [prioritiesResult, setPrioritiesResult] = useState(null);
  const [loading, setLoading] = useState({ inbox: false, priorities: false });
  const [applying, setApplying] = useState(false);

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

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-purple-500" />
          AI Assistant
        </h1>
        <p className="text-gray-500 mt-1">Let AI help you process and prioritize using GTD principles</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="gtd-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-yellow-100 p-2 rounded-lg"><Inbox className="w-5 h-5 text-yellow-600" /></div>
            <div>
              <h2 className="font-semibold">Process Inbox</h2>
              <p className="text-sm text-gray-500">AI categorizes your inbox items</p>
            </div>
          </div>
          <button onClick={processInbox} disabled={loading.inbox} className="gtd-btn gtd-btn-primary w-full flex items-center justify-center gap-2">
            {loading.inbox ? 'Processing...' : <><Sparkles className="w-4 h-4" /> Analyze Inbox</>}
          </button>

          {inboxResult?.processed_items && (
            <div className="mt-4 pt-4 border-t space-y-3">
              {inboxResult.processed_items.map((item, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="font-medium text-sm">{item.suggested_title || inboxResult.tasks[item.original_index - 1]?.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <ArrowRight className="w-3 h-3" />
                    <span className={`gtd-badge list-${item.recommended_list}`}>{item.recommended_list.replace('_', ' ')}</span>
                    {item.context && <span className="context-badge">{item.context}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{item.reasoning}</p>
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
            <div className="bg-green-100 p-2 rounded-lg"><Target className="w-5 h-5 text-green-600" /></div>
            <div>
              <h2 className="font-semibold">Daily Focus</h2>
              <p className="text-sm text-gray-500">AI suggests today's priorities</p>
            </div>
          </div>
          <button onClick={getDailyPriorities} disabled={loading.priorities} className="gtd-btn gtd-btn-primary w-full flex items-center justify-center gap-2">
            {loading.priorities ? 'Analyzing...' : <><Sparkles className="w-4 h-4" /> Get Suggestions</>}
          </button>

          {prioritiesResult?.suggested_focus && (
            <div className="mt-4 pt-4 border-t">
              {prioritiesResult.productivity_tip && (
                <div className="bg-blue-50 rounded-lg p-3 mb-4">
                  <p className="text-sm text-blue-700"><strong>Tip:</strong> {prioritiesResult.productivity_tip}</p>
                </div>
              )}
              <div className="space-y-3">
                {prioritiesResult.suggested_focus.map((item, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3">
                    <div className="font-medium text-sm">{prioritiesResult.tasks[item.task_index - 1]?.title}</div>
                    <p className="text-xs text-gray-500 mt-1">{item.reason}</p>
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
    </div>
  );
}
