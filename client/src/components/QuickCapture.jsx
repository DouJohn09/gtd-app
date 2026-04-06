import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './Toast';

export default function QuickCapture({ onCapture, placeholder = "Quick capture - what's on your mind?" }) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    
    setLoading(true);
    try {
      await api.tasks.create({ title: title.trim() });
      setTitle('');
      addToast('Task captured to inbox', 'success');
      onCapture?.();
    } catch (error) {
      console.error('Failed to capture:', error);
      addToast(error.message || 'Failed to capture task', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        className="gtd-input flex-1"
        disabled={loading}
      />
      <button
        type="submit"
        disabled={!title.trim() || loading}
        className="gtd-btn gtd-btn-primary flex items-center gap-2 disabled:opacity-50"
      >
        <Plus className="w-4 h-4" />
        Capture
      </button>
    </form>
  );
}
