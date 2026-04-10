import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { ListTodo } from 'lucide-react';

export default function Login() {
  const { user, login } = useAuth();

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full text-center">
        <ListTodo className="w-12 h-12 text-blue-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">GTD Flow</h1>
        <p className="text-gray-500 mb-6">Sign in to get things done</p>
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={(credentialResponse) => login(credentialResponse.credential)}
            onError={() => console.error('Login failed')}
          />
        </div>
      </div>
    </div>
  );
}
