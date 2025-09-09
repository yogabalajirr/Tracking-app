"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { ACCESS_TOKEN_STORAGE_KEY } from "@/lib/constants";

type UserProfile = {
  id: string;
  email: string;
  name?: string;
  age?: number;
  gender?: "male" | "female" | "other";
  weight?: number;
  height?: number;
  activityLevel?: "sedentary" | "light" | "moderate" | "active" | "very_active";
  goal?: "lose" | "maintain" | "gain";
};

type AuthContextValue = {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const storedToken = typeof window !== "undefined" ? localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : null;
    if (storedToken) {
      setToken(storedToken);
      api
        .get("/auth/me")
        .then((res) => setUser(res.data))
        .catch(() => {
          localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
          setUser(null);
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    const newToken = res.data?.token as string;
    if (newToken) {
      localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, newToken);
      setToken(newToken);
      const me = await api.get("/auth/me");
      setUser(me.data);
    }
  };

  const signup = async (email: string, password: string) => {
    await api.post("/auth/signup", { email, password });
    await login(email, password);
  };

  const logout = () => {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    setUser(null);
    setToken(null);
    if (typeof window !== "undefined") {
      const prefix = process.env.NEXT_PUBLIC_BASE_PATH || "";
      window.location.href = `${prefix}/login`;
    }
  };

  const refreshProfile = async () => {
    if (!token) return;
    const me = await api.get("/auth/me");
    setUser(me.data);
  };

  const value = useMemo(
    () => ({ user, token, isLoading, login, signup, logout, refreshProfile }),
    [user, token, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}



