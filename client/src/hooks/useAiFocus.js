import { useState } from 'react';
import { api } from '../lib/api';

/**
 * Shared "AI suggest" behavior for focus/next-actions surfaces. Calls
 * daily-priorities, maps the AI's picks to task ids + reasons, and exposes
 * run/clear + the result. Pure client-side — no DB write; callers float the
 * picks to the top of their list and offer an undo.
 *
 * `items` is the currently-visible list (used only for the toast count).
 */
export function useAiFocus(items, addToast) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null); // { pickIds: [...ordered], reasonById: { [id]: { confidence, reason } } }

  const run = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const result = await api.ai.getDailyPriorities();
      const focus = result?.suggested_focus || [];
      const tasks = result?.tasks || [];
      const pickIds = [];
      const reasonById = {};
      for (const f of focus) {
        const task = tasks[f.task_index - 1];
        if (!task) continue;
        pickIds.push(task.id);
        reasonById[task.id] = { confidence: f.confidence, reason: f.reason };
      }
      if (pickIds.length === 0) {
        setAiResult(null);
        addToast('AI had no strong picks right now.', 'info');
        return;
      }
      setAiResult({ pickIds, reasonById });
      const shown = pickIds.filter(id => items.some(t => t.id === id)).length;
      addToast(
        shown > 0
          ? `AI surfaced ${shown} ${shown === 1 ? 'task' : 'tasks'} to focus on.`
          : "AI's picks aren't on this list — open the AI assistant to add them.",
        shown > 0 ? 'success' : 'info',
      );
    } catch (e) {
      console.error('AI suggest failed:', e);
      addToast(e?.message?.includes('limit') ? 'Daily AI limit reached.' : 'Could not get AI suggestions.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const clear = () => setAiResult(null);

  return { aiLoading, aiResult, run, clear };
}

/** Split an already-sorted list into AI picks (in the AI's order) + the rest. */
export function partitionByAi(sorted, aiResult) {
  if (!aiResult) return { aiPicks: null, rest: sorted };
  const order = new Map(aiResult.pickIds.map((id, i) => [id, i]));
  const aiPicks = sorted.filter(t => order.has(t.id)).sort((a, b) => order.get(a.id) - order.get(b.id));
  const rest = sorted.filter(t => !order.has(t.id));
  return { aiPicks, rest };
}
