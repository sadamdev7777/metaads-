import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { type AgentKey, Avatar } from "./ui";
import { supabase } from "../lib/supabase";

type Who = "luqman" | "bakri" | "anis" | "alila" | "mira" | "dara";
type Msg = { role: "user" | "assistant"; text: string; agent?: Who; links?: { label: string; path: string }[]; follow_ups?: string[]; failed?: boolean };
const STAFF: Record<Who, { name: string; who: AgentKey; about: string }> = {
  luqman: { name: "Luqman", who: "ana", about: "Results" },
  bakri: { name: "Bakri", who: "bud", about: "Budget" },
  anis: { name: "Anis", who: "cre", about: "Creative" },
  alila: { name: "Alila", who: "sch", about: "Schedule" },
  mira: { name: "Mira", who: "plan", about: "Campaigns" },
  dara: { name: "Dara", who: "data", about: "Data and how-to" },
};
const STARTERS = ["Destinasi mana paling murah kos per pax bulan ni?", "Campaign mana patut saya tutup?", "Macam mana nak run campaign baru?"];
const KEY = "mtb:chat:v1";

async function ask(question: string, agent: Who | "", history: Msg[]): Promise<{ ok: boolean; error?: string; agent?: Who; answer?: string; links?: Msg["links"]; follow_ups?: string[] }> {
  if (!supabase) return { ok: false, error: "Supabase is not connected in this build." };
  const { data, error } = await supabase.functions.invoke("ask", { body: { question, agent, history: history.filter((m) => !m.failed).map((m) => ({ role: m.role, text: m.text })) } });
  if (error && !data) return { ok: false, error: "No answer. Check the connection and ask again." };
  return data ?? { ok: false, error: "No answer." };
}

/** The round button at the bottom right of every page. Staff ask; the AI staff member it concerns answers. It only answers: it changes nothing. */
export default function ChatBubble() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as Msg[];
    } catch {
      return [];
    }
  });
  const [to, setTo] = useState<Who | "">("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30)));
    } catch {
      /* a convenience only */
    }
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy, open]);
  useEffect(() => {
    document.body.classList.toggle("chat-open", open && window.innerWidth < 640);
    return () => document.body.classList.remove("chat-open");
  }, [open]);
  useEffect(() => {
    if (!open) return;
    if (window.innerWidth >= 640) input.current?.focus(); // on a phone the keyboard would cover the chat before anything is read
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => {
    if (window.innerWidth < 640) setOpen(false); // on a phone the chat covers the page, so a link closes it
  }, [loc.pathname]);

  async function send(q?: string) {
    const question = (q ?? text).trim();
    if (!question || busy) return;
    const before = msgs;
    setMsgs([...before, { role: "user", text: question }]);
    setText("");
    setBusy(true);
    const r = await ask(question, to, before);
    setBusy(false);
    setMsgs((m) => [...m, r.ok && r.answer ? { role: "assistant", text: r.answer, agent: r.agent, links: r.links, follow_ups: r.follow_ups } : { role: "assistant", text: r.error ?? "Something went wrong. Ask again.", failed: true }]);
  }
  const last = msgs[msgs.length - 1];

  return (
    <>
      {!open && (
        <button type="button" aria-label="Ask the AI staff" onClick={() => setOpen(true)} className="fixed bottom-4 right-3 z-40 flex h-12 items-center gap-1.5 rounded-full border-0 bg-brand pl-3.5 pr-4 text-sm font-bold text-white shadow-lg sm:bottom-5 sm:h-14 sm:pl-4 sm:pr-5 md:right-6">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.4 3.7a.6.6 0 0 1-1-.46V16A2.5 2.5 0 0 1 4 13.5v-8Z" fill="#fff" />
          </svg>
          Ask
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="Ask the AI staff" className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] w-full max-w-[100vw] flex-col overflow-hidden bg-white sm:inset-auto sm:bottom-5 sm:right-6 sm:h-[min(640px,calc(100vh-40px))] sm:w-[400px] sm:rounded-2xl sm:border sm:border-line sm:shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <div className="text-[17px] font-bold leading-tight">Ask the AI staff</div>
              <div className="text-[12px] text-muted">They answer from the figures in this system. They change nothing.</div>
            </div>
            <div className="flex flex-none gap-1.5">
              {msgs.length > 0 && (
                <button type="button" onClick={() => setMsgs([])} className="min-h-[36px] sm:min-h-[44px] rounded-lg border border-line bg-white px-2.5 text-[13px] font-semibold text-ink">New chat</button>
              )}
              <button type="button" aria-label="Close the chat" onClick={() => setOpen(false)} className="min-h-[36px] sm:min-h-[44px] min-w-[44px] rounded-lg border border-line bg-white text-lg leading-none text-ink">×</button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {msgs.length === 0 && (
              <div className="flex flex-col gap-3 text-sm">
                <div>Just ask. Whoever looks after that part of the work answers, in Malay or English.</div>
                <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
                  {(Object.keys(STAFF) as Who[]).map((k) => (
                    <li key={k} className="flex items-center gap-2 rounded-lg bg-ground px-2 py-1.5">
                      <Avatar who={STAFF[k].who} state="idle" size={28} />
                      <span className="min-w-0 leading-tight"><span className="block text-[13px] font-bold">{STAFF[k].name}</span><span className="block text-[11px] text-muted">{STAFF[k].about}</span></span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col items-start gap-1.5">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" onClick={() => void send(s)} className="min-h-[40px] rounded-full border border-brand bg-white px-3 text-left text-[13px] font-semibold text-brand">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-sm text-white">{m.text}</div>
              ) : (
                <div key={i} className="flex max-w-[94%] items-start gap-2 self-start">
                  {m.agent && <Avatar who={STAFF[m.agent].who} state="idle" size={30} />}
                  <div className={`min-w-0 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm ${m.failed ? "bg-[#FBE6E3] text-[#7A1A14]" : "bg-ground text-ink"}`}>
                    {m.agent && <div className="mb-0.5 text-[12px] font-bold text-brand">{STAFF[m.agent].name} · {STAFF[m.agent].about}</div>}
                    <div className="whitespace-pre-wrap break-words">{m.text}</div>
                    {m.links && m.links.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.links.map((l) => (
                          <Link key={l.path} to={l.path} className="flex min-h-[36px] items-center rounded-lg border border-brand bg-white px-2.5 text-[13px] font-semibold text-brand no-underline">{l.label} →</Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {busy && <div role="status" className="self-start rounded-2xl bg-ground px-3.5 py-2.5 text-sm text-muted">Looking at the figures…</div>}
            {!busy && last?.role === "assistant" && (last.follow_ups?.length ?? 0) > 0 && (
              <div className="flex flex-col items-start gap-1.5">
                {last.follow_ups!.map((f) => (
                  <button key={f} type="button" onClick={() => void send(f)} className="min-h-[36px] rounded-full border border-line bg-white px-3 text-left text-[13px] text-ink">{f}</button>
                ))}
              </div>
            )}
            <div ref={end} />
          </div>

          <div className="flex flex-col gap-2 border-t border-line px-3 py-3">
            <div className="flex items-center gap-2 text-[12px] text-muted">
              <label htmlFor="chat-to">Ask</label>
              <select id="chat-to" value={to} onChange={(e) => setTo(e.target.value as Who | "")} className="min-h-[36px] rounded-lg border border-line bg-white px-2 text-[13px] text-ink">
                <option value="">whoever fits (recommended)</option>
                {(Object.keys(STAFF) as Who[]).map((k) => (
                  <option key={k} value={k}>{STAFF[k].name}, {STAFF[k].about.toLowerCase()}</option>
                ))}
              </select>
            </div>
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <textarea ref={input} aria-label="Your question" rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Tanya apa-apa tentang iklan…" className="min-h-[52px] flex-1 resize-none rounded-lg border border-[#9AA39E] px-3 py-2 text-[15px] text-ink" />
              <button type="submit" disabled={busy || !text.trim()} className="min-h-[52px] rounded-lg border-0 bg-brand px-4 text-sm font-bold text-white disabled:opacity-50">Send</button>
            </form>
            <div className="text-[11px] text-muted">Answers are written by an AI model and can be wrong. Check a figure on its page before acting on it.</div>
          </div>
        </div>
      )}
    </>
  );
}
