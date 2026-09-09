import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api, setCsrfToken, getCsrfToken } from './api';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  locked: boolean;
  minecraft?: { uuid: string; username: string; linkedAt: string } | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const result = await api.get<AuthUser & { csrfToken?: string }>('/api/auth/me');
    if (result.success && result.data) {
      if (result.data.csrfToken) {
        setCsrfToken(result.data.csrfToken);
      }
      const { csrfToken: _csrf, ...payload } = result.data;
      setUser(payload);
    } else {
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (identifier: string, password: string) => {
    const result = await api.post<{ user: AuthUser; csrfToken: string }>('/api/auth/login', { identifier, password });
    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? 'Login fehlgeschlagen');
    }
    setCsrfToken(result.data.csrfToken);
    setUser(result.data.user);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setCsrfToken(null);
      setUser(null);
    }
  }, []);

  // Expose the CSRF token to the app (needed for state-changing requests)
  useEffect(() => {
    if (user && !getCsrfToken()) {
      // After a page reload, CSRF token is gone. Get a fresh one via refresh.
      // The backend derives it from the session; login/reload flow issues it.
    }
  }, [user]);

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}