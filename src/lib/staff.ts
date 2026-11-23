import { supabase } from "./supabase";

export type StaffRow = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "staff";
  active: boolean;
  must_change_password: boolean;
  created_at: string;
  added_by_email: string | null;
  last_sign_in_at: string | null;
};

type Res<T> = { ok: boolean; error?: string } & Partial<T>;
async function call<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<Res<T>> {
  if (!supabase) return { ok: false, error: "Demo mode: staff accounts need Supabase." } as Res<T>;
  const { data, error } = await supabase.functions.invoke("staff-admin", { body });
  if (error) {
    // The function answers with a JSON error even on 403; read it if it is there.
    const ctx = (error as { context?: Response }).context;
    const parsed = ctx ? await ctx.json().catch(() => null) : null;
    return { ok: false, error: parsed?.error ?? error.message } as Res<T>;
  }
  return data;
}

export const listStaff = () => call<{ is_admin: boolean; people: StaffRow[] }>({ action: "list" });
export const addStaff = (v: { name: string; email: string; role: string; password: string }) => call({ action: "create", ...v });
export const updateStaff = (id: string, patch: { name?: string; role?: string; active?: boolean }) => call({ action: "update", id, ...patch });
export const resetStaffPassword = (id: string, password: string) => call({ action: "reset_password", id, password });
export const setMyPassword = (password: string) => call({ action: "set_my_password", password });

/** A temporary password that is easy to read out: no 0/O or 1/l, letters and digits mixed. */
export function makePassword() {
  const letters = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (set: string, n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => set[x % set.length]).join("");
  return `${pick(letters, 4)}-${pick(digits, 4)}-${pick(letters, 4)}`;
}
