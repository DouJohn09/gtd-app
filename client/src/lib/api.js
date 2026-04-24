const API_BASE = '/api';

async function fetchApi(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!response.ok) {
    let errorMessage = `API error: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch (e) {
      // ignore JSON parse error
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function downloadFile(endpoint, fallbackName) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.statusText}`);
  }
  const cd = response.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/.exec(cd);
  const filename = match ? match[1] : fallbackName;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  tasks: {
    getAll: (list) => fetchApi(list ? `/tasks?list=${list}` : '/tasks'),
    getById: (id) => fetchApi(`/tasks/${id}`),
    getStats: () => fetchApi('/tasks/stats'),
    getDailyFocus: () => fetchApi('/tasks/daily-focus'),
    getCalendar: (start, end) => fetchApi(`/tasks/calendar?start=${start}&end=${end}`),
    create: (task) => fetchApi('/tasks', { method: 'POST', body: JSON.stringify(task) }),
    update: (id, updates) => fetchApi(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    delete: (id) => fetchApi(`/tasks/${id}`, { method: 'DELETE' }),
    complete: (id) => fetchApi(`/tasks/${id}/complete`, { method: 'POST' }),
    getDeferred: (list) => fetchApi(`/tasks/deferred?list=${list}`),
    analyze: (id) => fetchApi(`/tasks/${id}/analyze`, { method: 'POST' }),
  },

  projects: {
    getAll: () => fetchApi('/projects'),
    getById: (id) => fetchApi(`/projects/${id}`),
    create: (project) => fetchApi('/projects', { method: 'POST', body: JSON.stringify(project) }),
    update: (id, updates) => fetchApi(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    delete: (id) => fetchApi(`/projects/${id}`, { method: 'DELETE' }),
    breakdown: (id) => fetchApi(`/projects/${id}/breakdown`, { method: 'POST' }),
    applyBreakdown: (id, tasks) => fetchApi(`/projects/${id}/apply-breakdown`, { method: 'POST', body: JSON.stringify({ tasks }) }),
    reorder: (id, taskIds) => fetchApi(`/projects/${id}/reorder`, { method: 'POST', body: JSON.stringify({ taskIds }) }),
  },

  contexts: {
    getAll: () => fetchApi('/contexts'),
    create: (name) => fetchApi('/contexts', { method: 'POST', body: JSON.stringify({ name }) }),
    delete: (id) => fetchApi(`/contexts/${id}`, { method: 'DELETE' }),
  },

  habits: {
    getAll: () => fetchApi('/habits'),
    getStats: () => fetchApi('/habits/stats'),
    create: (habit) => fetchApi('/habits', { method: 'POST', body: JSON.stringify(habit) }),
    update: (id, updates) => fetchApi(`/habits/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    delete: (id) => fetchApi(`/habits/${id}`, { method: 'DELETE' }),
    toggle: (id, date = undefined) => fetchApi(`/habits/${id}/toggle`, { method: 'POST', body: JSON.stringify({ date }) }),
  },

  calendar: {
    getStatus: () => fetchApi('/auth/google-calendar/status'),
    connect: (code) => fetchApi('/auth/google-calendar', { method: 'POST', body: JSON.stringify({ code }) }),
    disconnect: () => fetchApi('/auth/google-calendar', { method: 'DELETE' }),
  },

  ai: {
    processInbox: () => fetchApi('/ai/process-inbox', { method: 'POST' }),
    applyInboxProcessing: (items) => fetchApi('/ai/apply-inbox-processing', { method: 'POST', body: JSON.stringify({ items }) }),
    getDailyPriorities: () => fetchApi('/ai/daily-priorities', { method: 'POST' }),
    applyDailyFocus: (taskIds) => fetchApi('/ai/apply-daily-focus', { method: 'POST', body: JSON.stringify({ taskIds }) }),
    importNotes: (text) => fetchApi('/ai/import-notes', { method: 'POST', body: JSON.stringify({ text }) }),
    applyImport: (items) => fetchApi('/ai/apply-import', { method: 'POST', body: JSON.stringify({ items }) }),
    findDuplicates: () => fetchApi('/ai/find-duplicates', { method: 'POST' }),
    applyDuplicates: (taskIds) => fetchApi('/ai/apply-duplicates', { method: 'POST', body: JSON.stringify({ taskIds }) }),
    weeklyReview: () => fetchApi('/ai/weekly-review', { method: 'POST' }),
    completeReview: (data) => fetchApi('/ai/complete-review', { method: 'POST', body: JSON.stringify(data) }),
    smartCapture: (text) => fetchApi('/ai/smart-capture', { method: 'POST', body: JSON.stringify({ text }) }),
  },

  export: {
    json: () => downloadFile('/export/json', 'gtdflow-export.json'),
    csv: () => downloadFile('/export/csv', 'gtdflow-export.csv'),
  },

  import: {
    preview: (filename, content) => fetchApi('/import/preview', { method: 'POST', body: JSON.stringify({ filename, content }) }),
    commit: (format, payload) => fetchApi('/import/commit', { method: 'POST', body: JSON.stringify({ format, payload }) }),
  },
};
