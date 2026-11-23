import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

export type AppUser = { email: string; name: string };
/** The person's place on the staff list. null while loading or in demo mode. */
export type Access = { role: "admin" | "staff"; active: boolean; mustChange: boolean };

type AuthState = {
  user: AppUser | null;
  loading: boolean;
  demo: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  access: Access | null;
  accessLoaded: boolean;
  refreshAccess: () => Promise<void>;
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
  const [access, setAccess] = useState<Access | null>(null);
  const [accessLoaded, setAccessLoaded] = useState(false);

  async function refreshAccess() {
    if (!supabase) {
      setAccess({ role: "admin", active: true, mustChange: false });
      setAccessLoaded(true);
      return;
    }
    const { data: s } = await supabase.auth.getSession();
    const id = s.session?.user?.id;
    if (!id) {
      setAccess(null);
      setAccessLoaded(true);
      return;
    }
    const { data } = await supabase.from("profiles").select("role, active, must_change_password").eq("id", id).maybeSingle();
    setAccess(data ? { role: data.role === "admin" ? "admin" : "staff", active: Boolean(data.active), mustChange: Boolean(data.must_change_password) } : { role: "staff", active: false, mustChange: false });
    setAccessLoaded(true);
  }

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
      void refreshAccess();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user;
      setUser(u?.email ? { email: u.email, name: (u.user_metadata?.name as string) || nameFromEmail(u.email) } : null);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setAccessLoaded(false);
        // Supabase asks not to await other calls inside this callback.
        setTimeout(() => void refreshAccess(), 0);
      }
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
      void refreshAccess();
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

  return <AuthContext.Provider value={{ user, loading, demo, signIn, signOut, access, accessLoaded, refreshAccess }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
