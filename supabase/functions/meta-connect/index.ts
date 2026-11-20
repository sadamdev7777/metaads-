// Connects the system to Meta Ads.
// The access token is typed into Settings, Integrations and sent here once. It is stored in
// Supabase Vault and is never sent back to the browser or written to any log.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const GRAPH = "https://graph.facebook.com/v27.0";
const SECRET_NAME = "meta_access_token";

type Account = { id: string; name: string; active: boolean; currency: string };

async function fetchAccounts(token: string, edge: string) {
  const res = await fetch(`${GRAPH}/me/${edge}?fields=account_id,name,account_status,currency&limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    return { ok: false as const, error: String(body?.error?.message ?? `Meta answered with status ${res.status}`) };
  }
  const accounts: Account[] = (body.data ?? []).map((a: Record<string, unknown>) => ({
    id: String(a.account_id),
    name: String(a.name ?? a.account_id),
    active: a.account_status === 1,
    currency: String(a.currency ?? ""),
  }));
  return { ok: true as const, accounts };
}

/** Ad accounts this token can see. System users list theirs under assigned_ad_accounts. */
async function listAccounts(token: string) {
  const first = await fetchAccounts(token, "adaccounts");
  if (first.ok && first.accounts.length > 0) return first;
  const second = await fetchAccounts(token, "assigned_ad_accounts");
  if (second.ok && second.accounts.length > 0) return second;
  return first.ok ? first : second.ok ? second : first;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: who, error: whoErr } = await userClient.auth.getUser();
  if (whoErr || !who.user) return json({ ok: false, error: "Sign in first." }, 401);
  const email = who.user.email ?? "";

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Send JSON." }, 400);
  }

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date().toISOString();
  const setStatus = (fields: Record<string, unknown>) =>
    admin.from("integration_status").update({ ...fields, last_checked_at: now }).eq("key", "meta_ads");
  const currentConfig = async () => {
    const { data } = await admin.from("integration_status").select("config").eq("key", "meta_ads").maybeSingle();
    return (data?.config ?? {}) as { accounts?: Account[]; selected?: string[] };
  };
  const describe = (accounts: Account[], selected: string[]) =>
    `Token is valid. ${accounts.length} ad account${accounts.length === 1 ? "" : "s"} visible, ${selected.length} selected. Read only until Phase 2.`;

  switch (body.action) {
    case "save_token": {
      // A copy button can put extra text around the token (labels, several copies of it).
      // If the pasted text holds exactly one token, use that.
      const raw = String(body.token ?? "").trim();
      const found = [...new Set(raw.match(/EAA[A-Za-z0-9]{50,}/g) ?? [])];
      const token = found.length === 1 ? found[0] : raw;
      if (token.length < 20) return json({ ok: false, error: "That does not look like an access token." });
      const result = await listAccounts(token);
      if (!result.ok) return json({ ok: false, error: `Meta rejected the token: ${result.error}` });
      const { error: saveErr } = await admin.rpc("set_integration_secret", { p_name: SECRET_NAME, p_secret: token });
      if (saveErr) return json({ ok: false, error: `Could not store the token: ${saveErr.message}` });
      const old = await currentConfig();
      const selected = (old.selected ?? []).filter((id) => result.accounts.some((a) => a.id === id));
      await setStatus({
        status: result.accounts.length > 0 ? "connected" : "check",
        detail: result.accounts.length > 0 ? describe(result.accounts, selected) : "Token is valid but it cannot see any ad account. Assign the ad account to the system user in Meta.",
        secret_hint: token.slice(-4),
        updated_by_email: email,
        config: { accounts: result.accounts, selected },
      });
      return json({ ok: true, accounts: result.accounts, selected });
    }

    case "test": {
      const { data: token, error: readErr } = await admin.rpc("get_integration_secret", { p_name: SECRET_NAME });
      if (readErr) return json({ ok: false, error: `Could not read the stored token: ${readErr.message}` });
      if (!token || String(token).length < 20) return json({ ok: false, error: "No token has been saved yet." });
      const result = await listAccounts(String(token));
      const old = await currentConfig();
      if (!result.ok) {
        await setStatus({ status: "check", detail: `Meta rejected the stored token: ${result.error}` });
        return json({ ok: false, error: `Meta rejected the stored token: ${result.error}` });
      }
      const selected = (old.selected ?? []).filter((id) => result.accounts.some((a) => a.id === id));
      await setStatus({ status: "connected", detail: describe(result.accounts, selected), config: { accounts: result.accounts, selected } });
      return json({ ok: true, accounts: result.accounts, selected });
    }

    case "set_accounts": {
      const old = await currentConfig();
      const accounts = old.accounts ?? [];
      const wanted = Array.isArray(body.account_ids) ? body.account_ids.map(String) : [];
      const selected = wanted.filter((id) => accounts.some((a) => a.id === id));
      await setStatus({ detail: describe(accounts, selected), config: { accounts, selected } });
      return json({ ok: true, accounts, selected });
    }

    case "disconnect": {
      const { error: clearErr } = await admin.rpc("set_integration_secret", { p_name: SECRET_NAME, p_secret: "-" });
      if (clearErr) return json({ ok: false, error: `Could not remove the token: ${clearErr.message}` });
      await setStatus({ status: "not_set_up", detail: "Disconnected. No token is stored.", secret_hint: null, updated_by_email: email, config: {} });
      return json({ ok: true, accounts: [], selected: [] });
    }

    default:
      return json({ ok: false, error: "Unknown action." }, 400);
  }
});
