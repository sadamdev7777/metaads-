import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { logActivity } from "./activity";
import { useAuth } from "./auth";

type Store = {
  toast: string | null;
  /** Record an action in the activity log and show a short confirmation. */
  act: (action: string, area: string, toast?: string) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const act = useCallback(
    (action: string, area: string, message?: string) => {
      void logActivity(user, action, area);
      setToast(message ?? `Recorded: ${action}`);
    },
    [user],
  );

  return <Ctx.Provider value={{ toast, act }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
