import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { APPROVALS, UNTAGGED, type Approval, type Untagged } from "./data";
import { logActivity } from "./activity";
import { useAuth } from "./auth";

type Saved = { decided: string[]; tagged: string[]; paused: string[] };

type Store = {
  approvals: Approval[];
  untagged: Untagged[];
  paused: string[];
  toast: string | null;
  /** Record an action in the activity log and show a short confirmation. */
  act: (action: string, area: string, toast?: string) => void;
  decide: (a: Approval, verdict: "Approved" | "Rejected") => void;
  decideAll: () => void;
  tag: (u: Untagged) => void;
  togglePause: (id: string, name: string) => void;
  reset: () => void;
};

const KEY = "mtb_phase0_state";
const Ctx = createContext<Store | null>(null);

function load(): Saved {
  try {
    return { decided: [], tagged: [], paused: [], ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { decided: [], tagged: [], paused: [] };
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [saved, setSaved] = useState<Saved>(load);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(saved));
  }, [saved]);

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

  const approvals = APPROVALS.filter((a) => !saved.decided.includes(a.id));
  const untagged = UNTAGGED.filter((u) => !saved.tagged.includes(u.id));

  const store: Store = {
    approvals,
    untagged,
    paused: saved.paused,
    toast,
    act,
    decide: (a, verdict) => {
      setSaved((s) => ({ ...s, decided: [...s.decided, a.id] }));
      act(`${verdict}: ${a.tag.toLowerCase()} for ${a.target}`, "Approvals", `${verdict}. Sample data, so nothing was sent to Meta.`);
    },
    decideAll: () => {
      const n = approvals.length;
      setSaved((s) => ({ ...s, decided: [...s.decided, ...approvals.map((a) => a.id)] }));
      act(`Approved all ${n} pending items`, "Approvals", `Approved ${n} items. Sample data, so nothing was sent to Meta.`);
    },
    tag: (u) => {
      setSaved((s) => ({ ...s, tagged: [...s.tagged, u.id] }));
      act(`Tagged campaign ${u.name}${u.product ? ` as ${u.product}` : ""}`, "Campaigns", "Tag saved.");
    },
    togglePause: (id, name) => {
      const isPaused = saved.paused.includes(id);
      setSaved((s) => ({ ...s, paused: isPaused ? s.paused.filter((x) => x !== id) : [...s.paused, id] }));
      act(`${isPaused ? "Resumed" : "Paused"} campaign ${name}`, "Campaigns", `${isPaused ? "Resumed" : "Paused"} here only. Sample data, so nothing was sent to Meta.`);
    },
    reset: () => setSaved({ decided: [], tagged: [], paused: [] }),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
