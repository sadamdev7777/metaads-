import { supabase } from "./supabase";
import type { AppUser } from "./auth";

export type ActivityRow = {
  id?: string;
  created_at: string;
  user_email: string;
  user_name: string;
  action: string;
  area: string;
};

const LOCAL_KEY = "mtb_activity_log";

function readLocal(): ActivityRow[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

/** Record who did what. Written to Supabase when connected, otherwise kept in this browser. */
export async function logActivity(user: AppUser | null, action: string, area: string) {
  if (!user) return;
  const row: ActivityRow = {
    created_at: new Date().toISOString(),
    user_email: user.email,
    user_name: user.name,
    action,
    area,
  };
  if (supabase) {
    const { error } = await supabase.from("activity_log").insert({
      user_email: row.user_email,
      user_name: row.user_name,
      action: row.action,
      area: row.area,
    });
    if (!error) return;
    console.warn("activity_log insert failed, keeping the entry locally", error.message);
  }
  const all = [row, ...readLocal()].slice(0, 200);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
}

export async function fetchActivity(): Promise<{ rows: ActivityRow[]; source: "supabase" | "browser" }> {
  if (supabase) {
    const { data, error } = await supabase
      .from("activity_log")
      .select("id, created_at, user_email, user_name, action, area")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) return { rows: data as ActivityRow[], source: "supabase" };
  }
  return { rows: readLocal(), source: "browser" };
}
