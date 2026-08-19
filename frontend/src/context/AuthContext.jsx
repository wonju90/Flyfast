import { createContext, useCallback, useContext, useState } from "react";
import { api, setTokens } from "../api/client";

const AuthContext = createContext(null);

const USER_KEY = "flyfast_user";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  const login = useCallback(async (email, password) => {
    const data = await api.login({ email, password });
    setTokens(data.access_token, data.refresh_token);
    const nextUser = { email };
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    return data;
  }, []);

  const logout = useCallback(() => {
    setTokens(null, null);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
