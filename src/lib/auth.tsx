import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

export type AppUser = { email: string; name: string };

type AuthState = {
  user: AppUser | null;
  loading: boolean;
  demo: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const DEMO_KEY = "mtb_demo_user";

function nameFromEmail(email: string) {
  const left = email.split("@")[0] || email;
  return left.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const demo = supabase === null;

  useEffect(() => {
    if (!supabase) {
      const saved = sessionStorage.getItem(DEMO_KEY);
      if (saved) setUser(JSON.parse(saved));
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUser(u?.email ? { email: u.email, name: (u.user_metadata?.name as string) || nameFromEmail(u.email) } : null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      setUser(u?.email ? { email: u.email, name: (u.user_metadata?.name as string) || nameFromEmail(u.email) } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    if (!email || !password) return "Enter your email and password.";
    if (!supabase) {
      // Demo mode: no account check. Clearly labelled in the UI.
      const u = { email, name: nameFromEmail(email) };
      sessionStorage.setItem(DEMO_KEY, JSON.stringify(u));
      setUser(u);
      return null;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }

  async function signOut() {
    if (!supabase) {
      sessionStorage.removeItem(DEMO_KEY);
      setUser(null);
      return;
    }
    await supabase.auth.signOut();
  }

  return <AuthContext.Provider value={{ user, loading, demo, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
