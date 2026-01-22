import React, { createContext, useContext, useState, useEffect } from 'react';
import { getApiBaseUrl } from '@/lib/api-config';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  login: (operatorId: string, password: string) => Promise<boolean>;
  logout: () => void;
  operatorId: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('titan_jwt'));
  const [operatorId, setOperatorId] = useState<string | null>(
    localStorage.getItem('titan_operator'),
  );

  const isAuthenticated = !!token;

  const login = async (opId: string, pass: string): Promise<boolean> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId: opId, password: pass }),
      });

      if (response.ok) {
        const data = await response.json();
        // Assuming response structure { token: "..." }
        const newToken = data.token;
        if (newToken) {
          localStorage.setItem('titan_jwt', newToken);
          localStorage.setItem('titan_operator', opId);
          setToken(newToken);
          setOperatorId(opId);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('titan_jwt');
    localStorage.removeItem('titan_operator');
    setToken(null);
    setOperatorId(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, token, login, logout, operatorId }}>
      {children}
    </AuthContext.Provider>
  );
};
