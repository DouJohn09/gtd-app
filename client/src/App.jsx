import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inbox from './pages/Inbox';
import Projects from './pages/Projects';
import Lists from './pages/Lists';
import AIAssistant from './pages/AIAssistant';
import Habits from './pages/Habits';
import CompletedTasks from './pages/CompletedTasks';
import WeeklyReview from './pages/WeeklyReview';
import Login from './pages/Login';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="projects" element={<Projects />} />
        <Route path="lists/:list" element={<Lists />} />
        <Route path="habits" element={<Habits />} />
        <Route path="completed" element={<CompletedTasks />} />
        <Route path="review" element={<WeeklyReview />} />
        <Route path="ai" element={<AIAssistant />} />
      </Route>
    </Routes>
  );
}
