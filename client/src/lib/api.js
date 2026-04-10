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

export const api = {
  tasks: {
    getAll: (list) => fetchApi(list ? `/tasks?list=${list}` : '/tasks'),
    getById: (id) => fetchApi(`/tasks/${id}`),
    getStats: () => fetchApi('/tasks/stats'),
    getDailyFocus: () => fetchApi('/tasks/daily-focus'),
    create: (task) => fetchApi('/tasks', { method: 'POST', body: JSON.stringify(task) }),
    update: (id, updates) => fetchApi(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    delete: (id) => fetchApi(`/tasks/${id}`, { method: 'DELETE' }),
    complete: (id) => fetchApi(`/tasks/${id}/complete`, { method: 'POST' }),
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
  },

  ai: {
    processInbox: () => fetchApi('/ai/process-inbox', { method: 'POST' }),
    applyInboxProcessing: (items) => fetchApi('/ai/apply-inbox-processing', { method: 'POST', body: JSON.stringify({ items }) }),
    getDailyPriorities: () => fetchApi('/ai/daily-priorities', { method: 'POST' }),
    applyDailyFocus: (taskIds) => fetchApi('/ai/apply-daily-focus', { method: 'POST', body: JSON.stringify({ taskIds }) }),
  }
};
