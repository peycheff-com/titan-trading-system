import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [operatorId, setOperatorId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!operatorId || !password) {
      setError('Operator ID and Password required');
      return;
    }

    const success = await login(operatorId, password);
    if (success) {
      navigate('/');
    } else {
      setError('Invalid credentials or server error');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-50">
      <div className="w-full max-w-md p-8 bg-slate-900 rounded-lg border border-slate-800 shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-cyan-500 mb-2">TITAN CONSOLE</h1>
          <p className="text-slate-400">Restricted Access // Phase 2</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-400 bg-red-950/30 border border-red-900 rounded">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Operator ID</label>
            <input
              type="text"
              value={operatorId}
              onChange={(e) => setOperatorId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded focus:outline-none focus:border-cyan-500 transition-colors text-slate-100"
              placeholder="Enter ID"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded focus:outline-none focus:border-cyan-500 transition-colors text-slate-100"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded transition-colors shadow-lg shadow-cyan-900/20"
          >
            AUTHENTICATE
          </button>
        </form>

        <div className="mt-8 text-center text-xs text-slate-600">
          <p>SYSTEM ACCESS LOGGED AND MONITORED</p>
          <p className="mt-1">Titan Trading System v2026</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
