import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { setMyPassword } from "../lib/staff";
import { Btn, Card, PageHead } from "../components/ui";

const input = "min-h-[40px] sm:min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[16px] sm:text-[15px] text-ink";

/** Change your own password. Shown full screen at the first sign-in with a temporary password, and from the menu at any time. */
export function ChangePassword({ first = false }: { first?: boolean }) {
  const { refreshAccess, user, signOut } = useAuth();
  const nav = useNavigate();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (a !== b) return setMsg({ ok: false, text: "The two passwords are not the same." });
    setBusy(true);
    const r = await setMyPassword(a);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Could not change the password." });
    setA("");
    setB("");
    setMsg({ ok: true, text: "Password changed." });
    await refreshAccess();
    if (first) nav("/dashboard");
  }

  const form = (
    <form onSubmit={submit} className="flex w-full max-w-[380px] flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="np1" className="text-[13px] font-semibold">New password</label>
        <input id="np1" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} className={input} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="np2" className="text-[13px] font-semibold">Type it again</label>
        <input id="np2" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} className={input} />
      </div>
      <p className="m-0 text-[12px] text-muted">At least 10 characters, with letters and numbers.</p>
      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-[13px] font-semibold ${msg.ok ? "bg-[#E3F2EC] text-[#0B5A43]" : "bg-[#FBE6E3] text-[#A3231B]"}`}>
          {msg.text}
        </div>
      )}
      <Btn type="submit" disabled={busy || !a}>{busy ? "Saving…" : "Save new password"}</Btn>
    </form>
  );

  if (!first) {
    return (
      <>
        <PageHead title="Change password" sub={user?.email} />
        <Card>{form}</Card>
      </>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-6 py-10 text-ink">
      <div className="flex w-full max-w-[380px] flex-col gap-4">
        <h1 className="m-0 text-[24px] font-bold">Set your own password</h1>
        <p className="m-0 text-sm text-muted">Welcome, {user?.name}. You signed in with a temporary password. Choose your own before you start.</p>
        {form}
        <button type="button" onClick={() => void signOut()} className="self-start text-[13px] font-semibold text-brand">Sign out</button>
      </div>
    </div>
  );
}

/** Signed in, but not on the active staff list. */
export function NoAccess() {
  const { user, signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-6 py-10 text-ink">
      <div className="flex w-full max-w-[420px] flex-col gap-3">
        <h1 className="m-0 text-[24px] font-bold">No access</h1>
        <p className="m-0 text-sm">
          <span className="font-semibold">{user?.email}</span> is not on the staff list, or its access has been turned off. Ask an admin to add you in
          Settings, Users.
        </p>
        <Btn kind="s" onClick={() => void signOut()} className="self-start">Sign out</Btn>
      </div>
    </div>
  );
}
