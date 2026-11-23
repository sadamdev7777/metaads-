import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { Avatar } from "../components/ui";

export default function Login() {
  const { signIn, demo } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(await signIn(email.trim(), password));
    setBusy(false);
  }

  const input = "min-h-[40px] sm:min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";

  return (
    <div className="flex min-h-screen flex-col bg-ground text-ink md:flex-row">
      <div className="flex flex-1 flex-col justify-between gap-10 bg-brand px-8 py-10 text-white md:px-12 md:py-14">
        <div>
          <div className="text-xl font-bold">MTB Marketing AI</div>
          <div className="text-sm text-[#D6EBE4]">Muslimtravelbug</div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="text-[34px] font-bold leading-tight">Run every campaign from one place.</div>
          <p className="m-0 max-w-[420px] text-base text-[#D6EBE4]">
            Load products from TravelCRM, add media, launch campaigns by hand or with AI, and see cost per pax by country and by who ran it.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Avatar who="data" state="work" size={40} />
          <Avatar who="plan" state="wait" size={40} />
          <Avatar who="ads" state="wait" size={40} />
          <Avatar who="ana" state="work" size={40} />
          <div className="ml-1.5 text-[13px] text-[#D6EBE4]">4 AI staff on duty</div>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-8 py-10 md:px-12">
        <form onSubmit={submit} className="flex w-full max-w-[380px] flex-col gap-4" noValidate>
          <h1 className="m-0 text-[26px] font-bold">Sign in</h1>
          {demo && (
            <div className="rounded-lg bg-[#FBEFD5] px-3 py-2 text-[13px] text-[#5C3900]">
              <span className="font-bold">Demo mode.</span> Supabase is not connected in this build. Any email and password will open the sample
              data.
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="em" className="text-[13px] font-semibold">
              Work email
            </label>
            <input id="em" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pw" className="text-[13px] font-semibold">
              Password
            </label>
            <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
          </div>
          {error && (
            <div role="alert" className="rounded-lg bg-[#FBE6E3] px-3 py-2 text-[13px] font-semibold text-[#A3231B]">
              {error}
            </div>
          )}
          <button type="submit" disabled={busy} className="min-h-[48px] rounded-lg bg-brand text-[15px] font-bold text-white disabled:opacity-60">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="m-0 text-[13px] text-muted">
            There is no open sign-up: an admin adds each staff member in Settings, Users. Every action is recorded under the name you sign in
            with.
          </p>
        </form>
      </div>
    </div>
  );
}
