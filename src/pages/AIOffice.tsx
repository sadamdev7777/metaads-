import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, B, Btn, Card, PageHead, Pill, T } from "../components/ui";
import { useAuth } from "../lib/auth";
import { STAFF } from "../lib/data";
import { type SchedSettings, fetchSchedule } from "../lib/schedule";
import { ScheduleStrip } from "../components/AdSchedule";
import { type Lesson, type Report, analyst, confTone, fetchLatestReport, fetchLessons, removeLesson, when, runAgent } from "../lib/live";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";

type Run = { id: number; started_at: string; finished_at: string | null; ok: boolean | null; error: string | null; triggered_by: string | null; summary: Record<string, number> };

export default function AIOffice() {
  const { user } = useAuth();
  const { act } = useStore();
  const [runs, setRuns] = useState<Run[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [aiOn, setAiOn] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Report | null>(null);
  const [sched, setSched] = useState<SchedSettings | null>(null);
  // On a phone the long parts start folded; on a computer everything shows.
  const [unfold, setUnfold] = useState<Record<string, boolean>>({});
  const isOpen = (k: string) => Boolean(unfold[k]);
  const phone = typeof window !== "undefined" && window.innerWidth < 640;
  const toggle = (k: string) => setUnfold((u) => ({ ...u, [k]: !u[k] }));
  const fold = (k: string) => (isOpen(k) ? "" : "hidden sm:flex");
  const More = ({ k, label }: { k: string; label: string }) => (
    <button type="button" onClick={() => toggle(k)} className="self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-brand underline sm:hidden">
      {isOpen(k) ? "Show less" : label}
    </button>
  );
  const [review, setReview] = useState<Report | null>(null);
  const [working, setWorking] = useState("");
  async function ask(fn: "budget-planner" | "creative-analyst", name: string, what: string) {
    setWorking(fn);
    act(`Asked ${name} for ${what} now`, "AI Office", `${name} is working. This takes about a minute.`);
    const r = await runAgent(fn);
    setWorking("");
    act(r.ok ? `${name} finished ${what}` : `${name} could not finish ${what}`, "AI Office", r.ok ? "Done. Proposals are in Approvals." : r.error ?? "Failed.");
    await load();
    window.dispatchEvent(new Event("mtb:proposals"));
  }

  async function load() {
    if (!supabase) return;
    const [r, rep, les, ai] = await Promise.all([
      supabase.from("sync_runs").select("*").order("id", { ascending: false }).limit(12),
      fetchLatestReport(),
      fetchLessons(),
      supabase.from("integration_status").select("status, secret_hint, detail").eq("key", "ai_model").maybeSingle(),
    ]);
    setRuns((r.data ?? []) as Run[]);
    void fetchSchedule().then((x) => setSched(x.settings));
    void fetchLatestReport("budget").then(setPlan);
    void fetchLatestReport("creative").then(setReview);
    setReport(rep);
    setLessons(les);
    setAiOn(Boolean(ai.data?.secret_hint));
    setAiNote(ai.data?.status === "check" ? ai.data?.detail ?? "" : "");
  }
  useEffect(() => { void load(); }, []);
  const lastGood = runs.find((r) => r.ok);

  async function study() {
    setBusy(true);
    act("Asked Luqman to study the ads now", "AI Office", "Luqman is studying the ads. This takes about a minute.");
    const r = await analyst("run");
    setBusy(false);
    act(r.ok ? "Luqman finished a study" : "Luqman's study failed", "AI Office", r.ok ? `Done: ${String(r.proposals)} proposals, ${String(r.lessons)} new lessons.` : r.error ?? "Failed.");
    await load();
    window.dispatchEvent(new Event("mtb:proposals"));
  }
  async function drop(l: Lesson) {
    await removeLesson(l.id, user?.email ?? "");
    setLessons((list) => list.filter((x) => x.id !== l.id));
    act(`Removed a lesson from Luqman's notebook: ${l.lesson.slice(0, 80)}`, "AI Office", "Removed. Luqman will no longer use it.");
  }

  return (
    <>
      <PageHead
        title="AI Office"
        sub="Dara keeps the data. Luqman studies the ads at night. Bakri plans the budget each morning. Anis reviews the creatives. Adam changes Meta only when you approve. Mira drafts campaigns when you ask."
        right={
          aiOn ? (
            <Btn disabled={busy} onClick={() => void study()}>
              {busy ? "Luqman is studying…" : "Study the ads now"}
            </Btn>
          ) : (
            <Link to="/settings/integrations" className="flex min-h-[36px] sm:min-h-[44px] items-center rounded-lg bg-brand px-4 text-sm font-bold text-white no-underline">
              Connect AI model
            </Link>
          )
        }
      />

      {aiNote && <div className="rounded-xl bg-[#FBE6E3] px-3.5 py-3 sm:px-5 sm:py-4 text-sm text-[#A3231B]"><B>Luqman's last study did not finish.</B> {aiNote} Press Study the ads now to try again.</div>}

      <ScheduleStrip />
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {STAFF.map((s) => {
          const on = s.who === "sch" ? Boolean(sched?.enabled) : s.who === "data" || s.who === "ads" || s.who === "plan" || aiOn;
          return (
            <Card key={s.who}>
              <div className="flex items-center gap-2.5 sm:gap-3.5">
                <span className="sm:hidden"><Avatar who={s.who} state={on ? "work" : "idle"} size={40} /></span>
                <span className="hidden sm:block"><Avatar who={s.who} state={on ? "work" : "idle"} size={64} /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="m-0 text-[15px] font-bold leading-tight sm:text-lg">{s.name} <span className="text-[12px] font-normal text-muted sm:hidden">· {s.role}</span></h2>
                  <div className="hidden text-[13px] text-muted sm:block">{s.role}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Pill tone={s.who === "sch" && sched?.enabled && sched.dry_run ? "a" : on ? "g" : "n"}>{s.who === "sch" ? (!sched?.enabled ? "Off" : sched.dry_run ? "Show-only" : "On") : s.who === "ads" || s.who === "plan" ? "On call" : on ? "Running" : "Not started"}</Pill>
                    <Pill>{s.kind}</Pill>
                  </div>
                </div>
                <button type="button" aria-expanded={isOpen(`job-${s.who}`)} onClick={() => toggle(`job-${s.who}`)} className="flex-none border-0 bg-transparent p-0 text-[12px] font-semibold text-brand sm:hidden">
                  {isOpen(`job-${s.who}`) ? "Less" : "About"}
                </button>
              </div>
              <div className={`text-[13px] text-muted ${isOpen(`job-${s.who}`) ? "" : "hidden sm:block"}`}>{s.job}</div>
              <div className="mt-auto rounded-lg bg-ground px-2.5 py-2 text-[12px] sm:px-3 sm:py-2.5 sm:text-sm">
                {s.who === "sch" ? (
                  <>{sched?.last_tick_at ? `Last check ${when(sched.last_tick_at)}: ${sched.last_tick_note}` : "No check yet."} <Link to="/settings/ad-schedule">Set her rules</Link></>
                ) : s.who === "data" ? (
                  <>Last sync {when(lastGood?.finished_at)}. Every hour, and in full at 01:37.</>
                ) : s.who === "ana" && aiOn ? (
                  <>{report ? `Last study ${when(report.created_at)}.` : "Connected. No study yet."} Every night at 02:10.</>
                ) : s.who === "bud" && aiOn ? (
                  <>{plan ? `Last plan ${when(plan.created_at)}.` : "No plan yet."} Every morning at 06:30.</>
                ) : s.who === "cre" && aiOn ? (
                  <>{review ? `Last review ${when(review.created_at)}.` : "No review yet."} Monday and Thursday at 03:00.</>
                ) : (
                  s.starts
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {(
        [
          { key: "budget-planner", name: "Bakri", title: "Bakri's budget plan", rep: plan, what: "a budget plan", button: "Plan the budget now", empty: "No plan yet. Bakri plans the budget every morning at 06:30." },
          { key: "creative-analyst", name: "Anis", title: "Anis's creative review", rep: review, what: "a creative review", button: "Review the creatives now", empty: "No review yet. Anis reviews the top-spending ads on Monday and Thursday. She sees each ad's text and one picture; for a video that is a still frame." },
        ] as const
      ).map((a) => (
        <Card
          key={a.key}
          title={a.title}
          right={
            <span className="flex flex-wrap items-center gap-2.5">
              {a.rep && <span className="text-[13px] text-muted">{when(a.rep.created_at)}</span>}
              {aiOn && (
                <Btn small kind="s" disabled={working !== ""} onClick={() => void ask(a.key, a.name, a.what)}>
                  {working === a.key ? `${a.name} is working…` : a.button}
                </Btn>
              )}
            </span>
          }
        >
          {a.rep ? (
            <>
              <div className={`text-sm leading-snug sm:text-[15px] sm:leading-relaxed ${isOpen(a.key) ? "" : "line-clamp-4 sm:line-clamp-none"}`}>{a.rep.summary}</div>
              <More k={a.key} label={`Read all${a.rep.findings?.length ? ` and ${a.rep.findings.length} findings` : ""}`} />
              {a.rep.findings?.length > 0 && (
                <div className={`${fold(a.key)} grid flex-col gap-2 sm:gap-2.5 md:grid-cols-2`}>
                  {a.rep.findings.map((f, i) => (
                    <div key={i} className="rounded-lg bg-ground px-2.5 py-2 text-[13px] sm:px-3 sm:py-2.5 sm:text-sm">
                      <B>{f.title}</B>
                      <div className="whitespace-pre-line">{f.detail}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[12px] text-muted">Written by an AI model from Meta and TravelCRM figures. Check the numbers before acting. Proposals are in Approvals.</div>
            </>
          ) : (
            <div className="text-sm text-muted">{a.empty}</div>
          )}
        </Card>
      ))}

      <Card
        title="Luqman's night report"
        right={report ? <div className="text-[13px] text-muted">{when(report.created_at)}{report.triggered_by && report.triggered_by !== "schedule" ? `, asked by ${report.triggered_by}` : ""}</div> : undefined}
      >
        {report ? (
          <>
            <div className={`text-sm leading-snug sm:text-[15px] sm:leading-relaxed ${isOpen("luqman") ? "" : "line-clamp-4 sm:line-clamp-none"}`}>{report.summary}</div>
            <More k="luqman" label={`Read all${report.findings?.length ? ` and ${report.findings.length} findings` : ""}`} />
            {report.findings?.length > 0 && (
              <div className={`${fold("luqman")} flex-col gap-2 sm:gap-2.5`}>
                {report.findings.map((f, i) => (
                  <div key={i} className="rounded-lg bg-ground px-2.5 py-2 text-[13px] sm:px-3 sm:py-2.5 sm:text-sm">
                    <B>{f.title}</B>
                    <div>{f.detail}</div>
                  </div>
                ))}
              </div>
            )}
            {report.review?.length > 0 && (
              <div className={`${fold("luqman")} flex-col gap-2`}>
                <div className="text-[13px] font-semibold text-muted">How his earlier advice turned out</div>
                <T
                  minW={640}
                  heads={["Earlier proposal", "Verdict", "What happened"]}
                  rows={report.review.map((r) => [r.proposal, <Pill tone={r.verdict === "right" ? "g" : r.verdict === "wrong" ? "r" : "n"}>{r.verdict}</Pill>, r.detail])}
                />
              </div>
            )}
            <div>
              <Link to="/approvals" className="inline-flex min-h-[36px] sm:min-h-[44px] items-center rounded-lg border border-[#9AA39E] px-4 text-sm font-semibold text-ink no-underline">
                See his proposals in Approvals
              </Link>
            </div>
            <div className="text-xs text-muted">Written by an AI model ({report.model}) from Meta figures only. Check the numbers before acting.</div>
          </>
        ) : (
          <div className="text-sm">{aiOn ? "No study yet. Press Study the ads now, or wait for tonight." : "Luqman needs an AI model. Add an Anthropic API key in Settings, Integrations and he starts tonight."}</div>
        )}
      </Card>

      <Card title="Luqman's notebook" sub="What he has learned about MTB's ads. He reads this before every study, and Mira will use it to plan campaigns. Remove a lesson that is wrong and he stops using it.">
        {lessons.length > 0 ? (
          <T
            minW={760}
            heads={["Lesson", "Evidence", "Confidence", "Learned", ""]}
            rows={(isOpen("notes") || !phone ? lessons : lessons.slice(0, 3)).map((l) => [
              <B>{l.lesson}</B>,
              l.evidence,
              <Pill tone={confTone(l.confidence)}>{l.confidence ?? ""}</Pill>,
              when(l.created_at),
              <Btn small kind="s" onClick={() => void drop(l)}>
                Remove
              </Btn>,
            ])}
          />
        ) : (
          <div className="text-sm text-muted">Empty. Lessons appear after his first study.</div>
        )}
        {phone && lessons.length > 3 && <More k="notes" label={`Show all ${lessons.length} lessons`} />}
      </Card>

      <Card title="Dara's log" sub="Every sync with Meta, newest first.">
        <T
          minW={760}
          heads={["Started", "Started by", "Result", "Details"]}
          rows={(isOpen("runs") || !phone ? runs : runs.slice(0, 4)).map((r) => [
            when(r.started_at),
            r.triggered_by === "schedule" ? "Schedule" : r.triggered_by ?? "",
            r.ok === null ? Date.now() - new Date(r.started_at).getTime() > 300000 ? <Pill>Stopped early</Pill> : <Pill tone="a">Running</Pill> : r.ok ? <Pill tone="g">Done</Pill> : <Pill tone="r">Failed</Pill>,
            r.ok === false ? r.error : `${r.summary?.campaigns ?? 0} campaigns, ${r.summary?.ads ?? 0} ads, ${r.summary?.spend_rows ?? 0} spend rows`,
          ])}
        />
        {runs.length === 0 && <div className="text-sm text-muted">No sync has run yet.</div>}
        {phone && runs.length > 4 && <More k="runs" label={`Show all ${runs.length} syncs`} />}
      </Card>
    </>
  );
}
