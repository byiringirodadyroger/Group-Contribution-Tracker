import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get("/api/auth/me");
      setUser(data.user || data);
      return data.user || data;
    } catch (error) {
      if (error.response?.status !== 401 && error.response?.status !== 403) throw error;
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshUser().catch(() => setUser(null)).finally(() => setLoading(false));
  }, [refreshUser]);

  const value = useMemo(() => ({
    user,
    loading,
    refreshUser,
    login: async (credentials) => {
      const { data } = await api.post("/api/auth/login", credentials);
      const nextUser = data.user || data;
      setUser(nextUser);
      return nextUser;
    },
    register: (input) => api.post("/api/auth/register", input),
    logout: async () => {
      await api.post("/api/auth/logout");
      setUser(null);
    }
  }), [user, loading, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
