// Staff accounts, managed from Settings, Users. There is no open sign-up: an admin adds each person here.
//   list            - everyone on the staff list (any active staff member)
//   create          - admin adds a person with a temporary password; they must change it at first sign-in
//   update          - admin changes a person's name, role, or turns their access off or back on
//   reset_password  - admin sets a new temporary password
//   set_my_password - the signed-in person sets their own new password
// Passwords are never stored or logged here; they go straight to Supabase Auth.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
type Row = Record<string, unknown>;
const FOREVER = "876000h"; // about 100 years: how Supabase turns an account off without deleting it
const goodPassword = (p: string) => p.length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: who, error: whoErr } = await userClient.auth.getUser();
  if (whoErr || !who.user) return json({ ok: false, error: "Sign in first." }, 401);
  const { data: me } = await admin.from("profiles").select("id, email, name, role, active").eq("id", who.user.id).maybeSingle();
  if (!me?.active) return json({ ok: false, error: "Your access is turned off. Ask an admin." }, 403);
  const isAdmin = me.role === "admin";
  const body = (await req.json().catch(() => ({}))) as Row;
  const log = (action: string) => admin.from("activity_log").insert({ user_id: me.id, user_email: me.email, user_name: me.name, action, area: "Settings, Users" });

  if (body.action === "set_my_password") {
    const password = String(body.password ?? "");
    if (!goodPassword(password)) return json({ ok: false, error: "Use at least 10 characters, with letters and numbers." });
    const { error } = await admin.auth.admin.updateUserById(me.id, { password });
    if (error) return json({ ok: false, error: error.message });
    await admin.from("profiles").update({ must_change_password: false }).eq("id", me.id);
    await log("Changed their password");
    return json({ ok: true });
  }

  if (body.action === "list") {
    const { data: people } = await admin.from("profiles").select("id, email, name, role, active, must_change_password, can_approve_budget, created_at, added_by_email").order("created_at");
    const seen = new Map<string, string | null>();
    for (let page = 1; page <= 10; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      for (const u of data?.users ?? []) seen.set(u.id, u.last_sign_in_at ?? null);
      if (!data || data.users.length < 200) break;
    }
    return json({ ok: true, is_admin: isAdmin, people: (people ?? []).map((p) => ({ ...p, last_sign_in_at: seen.get(p.id) ?? null })) });
  }

  if (!isAdmin) return json({ ok: false, error: "Only an admin can change the staff list." }, 403);

  if (body.action === "create") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim().slice(0, 80);
    const role = body.role === "admin" ? "admin" : "staff";
    const password = String(body.password ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "Enter a valid email." });
    if (!name) return json({ ok: false, error: "Enter the person's name." });
    if (!goodPassword(password)) return json({ ok: false, error: "The temporary password needs at least 10 characters, with letters and numbers." });
    const { data: made, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    if (error || !made.user) return json({ ok: false, error: /already/i.test(error?.message ?? "") ? "That email already has an account. Find it in the list below." : error?.message ?? "Could not create the account." });
    const { error: pErr } = await admin.from("profiles").upsert({ id: made.user.id, email, name, role, active: true, must_change_password: true, added_by_email: me.email });
    if (pErr) return json({ ok: false, error: pErr.message });
    await log(`Added ${name} (${email}) as ${role}`);
    return json({ ok: true });
  }

  const id = String(body.id ?? "");
  const { data: target } = await admin.from("profiles").select("id, email, name, role, active").eq("id", id).maybeSingle();
  if (!target) return json({ ok: false, error: "That person was not found." });

  if (body.action === "update") {
    const patch: Row = {};
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 80);
    if (body.role === "admin" || body.role === "staff") patch.role = body.role;
    if (typeof body.active === "boolean") patch.active = body.active;
    if (typeof body.can_approve_budget === "boolean") patch.can_approve_budget = body.can_approve_budget;
    // Keep at least one active admin, and never lock yourself out.
    const losesAdmin = target.role === "admin" && target.active && (patch.role === "staff" || patch.active === false);
    if (losesAdmin) {
      if (target.id === me.id) return json({ ok: false, error: "You cannot remove your own admin access. Ask another admin." });
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("active", true);
      if ((count ?? 0) <= 1) return json({ ok: false, error: "There must be at least one active admin." });
    }
    if (typeof patch.active === "boolean") {
      const { error } = await admin.auth.admin.updateUserById(target.id, { ban_duration: patch.active ? "none" : FOREVER });
      if (error) return json({ ok: false, error: error.message });
    }
    const { error } = await admin.from("profiles").update(patch).eq("id", target.id);
    if (error) return json({ ok: false, error: error.message });
    const what = patch.active === false ? "Turned off access for" : patch.active === true ? "Turned on access for" : patch.role ? `Made ${patch.role}:` : typeof patch.can_approve_budget === "boolean" ? (patch.can_approve_budget ? "Allowed budget raises for" : "Removed budget raises for") : "Renamed";
    await log(`${what} ${target.name} (${target.email})`);
    return json({ ok: true });
  }

  if (body.action === "reset_password") {
    const password = String(body.password ?? "");
    if (!goodPassword(password)) return json({ ok: false, error: "The temporary password needs at least 10 characters, with letters and numbers." });
    const { error } = await admin.auth.admin.updateUserById(target.id, { password });
    if (error) return json({ ok: false, error: error.message });
    await admin.from("profiles").update({ must_change_password: true }).eq("id", target.id);
    await log(`Set a new temporary password for ${target.name} (${target.email})`);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Unknown action." }, 400);
});
