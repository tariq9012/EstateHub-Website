// src/context/AuthContext.jsx
// Holds the current user + access token in memory. On mount it silently
// tries /auth/refresh (uses the httpOnly cookie) to restore a session
// after a page reload, without ever putting the access token in
// localStorage/sessionStorage.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setAccessToken, setUnauthorizedHandler, refreshAccessToken } from '../api/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearAuth = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearAuth);
  }, [clearAuth]);

  useEffect(() => {
    (async () => {
      const token = await refreshAccessToken();
      if (token) {
        try {
          const data = await api.get('/auth/me');
          setUser(data.user);
        } catch (err) {
          clearAuth();
        }
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    // /auth/login doesn't include role-specific extras (agentProfile/adminProfile) —
    // fetch /auth/me right away so e.g. an agent's agent_id is available immediately
    // (needed for redirecting them straight to their own /agent-profile/:id).
    const me = await api.get('/auth/me');
    setUser(me.user);
    return me.user;
  };

  const register = async (payload) => {
    const data = await api.post('/auth/register', payload);
    setAccessToken(data.accessToken);
    const me = await api.get('/auth/me');
    setUser(me.user);
    return me.user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearAuth();
    }
  };

  const refreshMe = async () => {
    const data = await api.get('/auth/me');
    setUser(data.user);
    return data.user;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshMe, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}