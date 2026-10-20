import { useEffect, useRef, useState } from 'react';

// Single-key shortcuts for a page. `map` is { key: handler }; keys are
// KeyboardEvent.key values ('j', 'ArrowLeft', '?', 'Backspace'). Ignored while
// typing in a field, with a modifier held (⌘K etc. stay with their owners), or
// while a modal is open — modals portal to <body> as a `fixed inset-0` layer;
// overlays rendered in place carry data-modal.
export function shortcutsBlocked(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const t = e.target;
  if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return true;
  return !!document.querySelector('body > .fixed.inset-0, [data-modal]');
}

export function useHotkeys(map, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e) => {
      if (e.defaultPrevented || shortcutsBlocked(e)) return;
      const fn = ref.current[e.key];
      if (!fn) return;
      // A handler returning false passes the key on (e.g. arrows keep
      // scrolling the page until a task is selected).
      if (fn(e) !== false) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

// Keyboard selection over the task cards a page renders. Order comes from the
// DOM ([data-task-id] inside <main>), so grouped and AI-sorted layouts work
// without each page computing its own visible order. j/k or arrows move,
// Enter opens, and the page supplies the per-task actions.
export function useTaskListKeys({ tasks, onOpen, onComplete, onDelete, onStar, extra = {} }) {
  const [selectedId, setSelectedId] = useState(null);

  const ids = () => [...document.querySelectorAll('main [data-task-id]')].map(el => Number(el.dataset.taskId));
  const find = (id) => tasks.find(t => t.id === id);

  // Paint the selection straight onto the card; follow it into view.
  useEffect(() => {
    document.querySelectorAll('[data-kb-selected]').forEach(el => el.removeAttribute('data-kb-selected'));
    if (selectedId == null) return;
    const el = document.querySelector(`main [data-task-id="${selectedId}"]`);
    if (!el) return;
    el.setAttribute('data-kb-selected', '');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  // When the selected task leaves the list (done, moved, deleted), select the
  // one that took its place.
  const lastIndex = useRef(0);
  useEffect(() => {
    if (selectedId == null) return;
    const list = ids();
    const i = list.indexOf(selectedId);
    if (i >= 0) { lastIndex.current = i; return; }
    setSelectedId(list.length ? list[Math.min(lastIndex.current, list.length - 1)] : null);
  });

  const step = (dir) => {
    const list = ids();
    if (!list.length) return;
    const i = list.indexOf(selectedId);
    const next = i < 0 ? (dir > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, i + dir));
    setSelectedId(list[next]);
  };
  const withTask = (fn) => () => {
    const t = find(selectedId);
    if (!t || !fn) return false;
    fn(t);
  };

  useHotkeys({
    j: () => step(1), ArrowDown: () => (selectedId == null ? false : step(1)),
    k: () => step(-1), ArrowUp: () => (selectedId == null ? false : step(-1)),
    Enter: withTask(onOpen),
    x: withTask(t => onComplete?.(t.id)),
    f: withTask(onStar),
    Backspace: withTask(t => onDelete?.(t.id)),
    Delete: withTask(t => onDelete?.(t.id)),
    Escape: () => (selectedId == null ? false : setSelectedId(null)),
    ...Object.fromEntries(Object.entries(extra).map(([k, fn]) => [k, withTask(fn)])),
  });

  return selectedId;
}
