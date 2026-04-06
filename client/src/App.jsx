import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inbox from './pages/Inbox';
import Projects from './pages/Projects';
import Lists from './pages/Lists';
import AIAssistant from './pages/AIAssistant';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="projects" element={<Projects />} />
        <Route path="lists/:list" element={<Lists />} />
        <Route path="ai" element={<AIAssistant />} />
      </Route>
    </Routes>
  );
}
