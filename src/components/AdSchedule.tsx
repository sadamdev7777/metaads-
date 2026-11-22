import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, B, Btn, Card, Pill } from "./ui";
import { Fld, INPUT, Seg, Ticks } from "./build/parts";
import { useAuth } from "../lib/auth";
import { type CampaignRow, type Destination, fetchDestinations, rm, useCampaigns, when } from "../lib/live";
import {
  DAYS, type RuleDraft, type SchedChange, type SchedRule, type SchedSettings, type SchedSuggestion,
  blankRule, dismissSuggestion, doesText, fetchSchedule, inForce, removeRule, saveRule, saveSettings, schedule, toggleRule, whenText,
} from "../lib/schedule";
import { useStore } from "../lib/store";

type Data = { settings: SchedSettings | null; rules: SchedRule[]; open: SchedChange[]; recent: SchedChange[]; suggestions: SchedSuggestion[] };
const EMPTY: Data = { settings: null, rules: [], open: [], recent: [], suggestions: [] };

function inScope(r: Pick<RuleDraft, "scope" | "scope_values">, c: CampaignRow) {
  return r.scope === "all" || (r.scope === "country" && r.scope_values.includes(c.country ?? "")) || (r.scope === "destination" && r.scope_values.includes(c.destination_id ?? "")) || (r.scope === "campaigns" && r.scope_values.includes(c.id));
}
const whoText = (r: Pick<SchedRule, "scope" | "scope_values">, dests: Destination[], camps: CampaignRow[]) =>
  r.scope === "all" ? "All running campaigns"
    : r.scope === "country" ? r.scope_values.join(", ")
    : r.scope === "destination" ? r.scope_values.map((id) => dests.find((d) => d.id === id)?.name ?? "?").join(", ")
    : `${r.scope_values.length} chosen campaign${r.scope_values.length === 1 ? "" : "s"}${r.scope_values.length <= 2 ? `: ${r.scope_values.map((id) => camps.find((c) => c.id === id)?.name ?? "?").join(", ")}` : ""}`;

/** What Alila is doing right now. Shown on Campaigns and in AI Office, so nobody has to open Settings to find out. */
export function ScheduleStrip() {
  const { act } = useStore();
  const [d, setD] = useState<Data>(EMPTY);
  const [busy, setBusy] = useState(false);
  const load = () => void fetchSchedule().then(setD);
  useEffect(load, []);
  const live = d.open.filter((c) => !c.dry_run);
  const shown = d.open.filter((c) => c.dry_run);
  if (!d.settings?.enabled || d.open.length === 0) return null;
  const list = live.length ? live : shown;
  const rules = Array.from(new Set(list.map((c) => c.rule_id))).map((id) => ({ id, name: list.find((c) => c.rule_id === id)?.rule_name ?? "a rule", n: list.filter((c) => c.rule_id === id).length, kind: list.find((c) => c.rule_id === id)?.kind }));
  async function cancel(ruleId: string | null) {
    if (!ruleId) return;
    setBusy(true);
    const r = await schedule({ action: "release", rule_id: ruleId });
    setBusy(false);
    act("Cancelled a schedule rule for now", "Ad schedule", r.ok ? (r.note ?? "Put back.") : (r.error ?? "Could not cancel."));
    load();
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#E3ECF9] px-4 py-3">
      <Avatar who="sch" state="work" size={36} />
      <div className="min-w-0 flex-[1_1_260px] text-sm">
        {rules.map((r) => (
          <div key={r.id ?? "x"}>
            <B>Alila{live.length ? "" : " (show-only)"}:</B> {r.n} {r.kind === "pause" ? `campaign${r.n === 1 ? "" : "s"} ${live.length ? "paused" : "would be paused"}` : `budget${r.n === 1 ? "" : "s"} ${live.length ? "lowered" : "would be lowered"}`} by “{r.name}”.{" "}
            {live.length > 0 && (
              <button type="button" disabled={busy} onClick={() => void cancel(r.id)} className="border-0 bg-transparent p-0 text-sm font-semibold text-[#274C8A] underline">
                {busy ? "Putting back…" : "Cancel for now and put back"}
              </button>
            )}
          </div>
        ))}
      </div>
      <Link to="/settings/ad-schedule" className="text-sm font-semibold text-[#274C8A]">Ad schedule</Link>
    </div>
  );
}

export default function AdSchedule() {
  const { user } = useAuth();
  const { act } = useStore();
  const email = user?.email ?? "";
  const [d, setD] = useState<Data>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [dests, setDests] = useState<Destination[]>([]);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [sureOn, setSureOn] = useState(false);
  const [dropping, setDropping] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const camps = useCampaigns(30);
  const load = async () => {
    setD(await fetchSchedule());
    setLoading(false);
  };
  useEffect(() => {
    void load();
    void fetchDestinations().then(setDests);
  }, []);

  const running = useMemo(() => camps.data.filter((c) => c.delivery_status === "ACTIVE"), [camps.data]);
  const countries = useMemo(() => Array.from(new Set(camps.data.map((c) => c.country).filter(Boolean) as string[])).sort(), [camps.data]);
  const s = d.settings;
  const live = Boolean(s?.enabled && !s.dry_run);

  async function setSwitch(patch: Partial<Pick<SchedSettings, "enabled" | "dry_run">>, text: string) {
    setBusy("Saving…");
    const e = await saveSettings(patch, email);
    if (!e) await schedule({ action: "tick" }); // so switching off puts things back now, not in 15 minutes
    setBusy("");
    setSureOn(false);
    if (e) return setErr(e);
    act(text, "Ad schedule", text);
    await load();
  }
  async function save() {
    if (!draft) return;
    const problem = !draft.name.trim() ? "Give the rule a name."
      : draft.kind === "weekly" && draft.days.length === 0 ? "Tick at least one day."
      : draft.kind === "weekly" && Boolean(draft.time_from) !== Boolean(draft.time_to) ? "Give both a start and an end time, or leave both empty for the whole day."
      : draft.kind === "dates" && (!draft.starts_at || !draft.ends_at) ? "Give the start and the end."
      : draft.kind === "dates" && String(draft.ends_at) <= String(draft.starts_at) ? "The end must be after the start."
      : draft.scope !== "all" && draft.scope_values.length === 0 ? "Choose what the rule covers."
      : "";
    if (problem) return setErr(problem);
    setBusy("Saving…");
    const e = await saveRule(draft, email);
    setBusy("");
    if (e) return setErr(e);
    act(`${draft.id ? "Changed" : "Added"} the schedule rule “${draft.name.trim()}”: ${whenText(draft)}, ${doesText(draft).toLowerCase()}`, "Ad schedule", "Rule saved. Alila checks the clock every 15 minutes.");
    setDraft(null);
    setErr("");
    await load();
  }
  async function study() {
    setBusy("Alila is studying the last 8 weeks. About half a minute…");
    const r = await schedule({ action: "study" });
    setBusy("");
    if (!r.ok) return setErr(r.error ?? "Could not finish.");
    act("Asked Alila to review the ad schedule", "Ad schedule", r.suggestions ? `${r.suggestions} suggestion${r.suggestions === 1 ? "" : "s"}.` : "She suggests no change this week.");
    await load();
  }

  const touched = draft ? running.filter((c) => inScope(draft, c)) : [];
  const daySpend = touched.reduce((t, c) => t + c.spend, 0) / 30;

  return (
    <>
      {busy && <div role="status" className="rounded-xl bg-[#FBEFD5] px-4 py-3 text-sm font-semibold">{busy}</div>}
      {err && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl bg-[#FBE6E3] px-4 py-3 text-sm text-[#7A1A14]">
          <span>{err}</span>
          <button type="button" onClick={() => setErr("")} className="border-0 bg-transparent p-0 text-sm font-semibold text-[#7A1A14] underline">Close</button>
        </div>
      )}

      {/* ---------- Alila and her switch ---------- */}
      <Card>
        <div className="flex items-start gap-3">
          <Avatar who="sch" state={live ? "work" : "idle"} size={48} />
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold">Alila, Schedule Keeper</span>
              <Pill tone={!s?.enabled ? "n" : s.dry_run ? "a" : "g"}>{loading ? "…" : !s?.enabled ? "Off" : s.dry_run ? "Show-only" : "On"}</Pill>
            </div>
            <div className="mt-1">During the hours and dates below she pauses campaigns or lowers daily budgets in Meta <B>by herself</B>, and afterwards puts back only what she changed. She never raises a budget, creates or deletes anything.</div>
            {s?.last_tick_at && <div className="mt-1 text-[13px] text-muted">Last check {when(s.last_tick_at)}: {s.last_tick_note}</div>}
          </div>
        </div>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px] text-[13px] text-muted">
          <li><B>Off:</B> she does nothing. Anything she changed is put back.</li>
          <li><B>Show-only:</B> she records what she would change, and changes nothing in Meta. Use this for the first week.</li>
          <li><B>On:</B> she makes the changes in Meta. Every change is in History under her name.</li>
        </ul>
        {sureOn ? (
          <div className="flex flex-col gap-2 rounded-lg bg-[#FBEFD5] px-3 py-3 text-sm">
            <div><B>Let Alila change Meta by herself?</B> From now on she will pause campaigns and lower budgets when a rule begins, without asking each time. You can switch her off here at any moment and she puts everything back.</div>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => void setSwitch({ enabled: true, dry_run: false }, "Switched Alila on: she now changes Meta by the schedule rules")}>Yes, switch her on</Btn>
              <Btn kind="s" onClick={() => setSureOn(false)}>Cancel</Btn>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {s?.enabled && <Btn kind="s" disabled={Boolean(busy)} onClick={() => void setSwitch({ enabled: false }, "Switched Alila off")}>Switch off</Btn>}
            {!(s?.enabled && s.dry_run) && <Btn kind="s" disabled={Boolean(busy)} onClick={() => void setSwitch({ enabled: true, dry_run: true }, "Set Alila to show-only: she records what she would change")}>Show-only</Btn>}
            {!live && <Btn disabled={Boolean(busy)} onClick={() => setSureOn(true)}>Switch on…</Btn>}
          </div>
        )}
      </Card>

      {/* ---------- What is changed right now ---------- */}
      {d.open.length > 0 && (
        <Card title={`Changed right now (${d.open.length})`} sub="Put back by itself when the rule ends, or when you switch the rule or Alila off.">
          <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-lg border border-line p-0">
            {d.open.slice(0, 40).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <Pill tone={c.last_error ? "r" : c.dry_run ? "a" : "g"}>{c.last_error ? "Problem" : c.dry_run ? "Would" : c.kind === "pause" ? "Paused" : "Lowered"}</Pill>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-semibold">{c.entity_name}</span>
                  <span className="block text-[12px] text-muted">
                    {c.kind === "pause" ? "Paused" : `RM${c.before.daily_budget} to RM${c.after.daily_budget} a day`} · {c.rule_name} · since {when(c.applied_at)}
                    {c.last_error ? ` · could not put back (${c.attempts} tries): ${c.last_error}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ---------- Her suggestions ---------- */}
      <Card title="Alila suggests" right={<Btn small kind="s" disabled={Boolean(busy)} onClick={() => void study()}>Ask her now</Btn>} sub="Every Monday she studies spend, leads and cost per lead by weekday, and how her own rules went. You decide.">
        {s?.last_review && <div className="rounded-lg bg-ground px-3 py-2.5 text-sm"><span className="text-[12px] text-muted">Her last review, {when(s.last_review_at)}:</span><br />{s.last_review}</div>}
        {d.suggestions.length === 0 && <div className="text-sm text-muted">{s?.last_review ? "No suggestion waiting." : "No review yet. Press Ask her now, or wait for Monday."}</div>}
        {d.suggestions.map((g) => (
          <div key={g.id} className="flex flex-col gap-2 rounded-lg border border-line px-3 py-3 text-sm">
            <div className="text-[15px] font-bold">{g.title}</div>
            {g.why && <div>{g.why}</div>}
            {g.numbers && <div className="text-[13px] text-muted">{g.numbers}</div>}
            <div className="rounded-lg bg-[#E3ECF9] px-3 py-2 text-[13px]"><B>The rule:</B> {whenText({ kind: "weekly", days: [], time_from: null, time_to: null, end_offset: 0, starts_at: null, ends_at: null, ...g.rule } as SchedRule)} · {doesText({ action: "budget", percent: 50, ...g.rule } as SchedRule)} · all running campaigns</div>
            {dropping === g.id ? (
              <div className="flex flex-col gap-2">
                <Fld label="Why not? She reads this next week." htmlFor={`dr-${g.id}`}>
                  <input id={`dr-${g.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sunday staff do reply, keep full budget" className={INPUT} />
                </Fld>
                <div className="flex flex-wrap gap-2">
                  <Btn small kind="x" onClick={async () => { await dismissSuggestion(g.id, reason, email); act(`Turned down Alila's suggestion “${g.title}”`, "Ad schedule", "Noted. She will read your reason."); setDropping(null); setReason(""); await load(); }}>Turn it down</Btn>
                  <Btn small kind="s" onClick={() => setDropping(null)}>Back</Btn>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Btn small onClick={() => { setDraft({ ...blankRule(), ...g.rule, from_suggestion: g.id } as RuleDraft); setErr(""); }}>Use this: open as a rule…</Btn>
                <Btn small kind="s" onClick={() => { setDropping(g.id); setReason(""); }}>No…</Btn>
              </div>
            )}
          </div>
        ))}
        <div className="text-xs text-muted">Written by an AI model from 8 weeks of figures. She knows spend, leads and cost per lead by day. She does not know which day's leads became deposits.</div>
      </Card>

      {/* ---------- The rules ---------- */}
      <Card title={`Rules (${d.rules.length})`} right={!draft && <Btn onClick={() => { setDraft(blankRule()); setErr(""); }}>Add rule</Btn>}>
        {d.rules.length === 0 && !draft && <div className="text-sm">No rule yet. Add one, for example “Sunday: lower budgets by 50%”.</div>}
        <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-lg border border-line p-0 empty:hidden">
          {d.rules.map((r) => {
            const now = inForce(r);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-3">
                <span className="min-w-0 flex-[1_1_240px] text-sm">
                  <span className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
                    {r.name} {!r.enabled ? <Pill tone="n">Off</Pill> : now ? <Pill tone="g">In force now</Pill> : r.skip_until && new Date(r.skip_until) > new Date() ? <Pill tone="a">Cancelled for now</Pill> : null}
                  </span>
                  <span className="block"><B>When:</B> {whenText(r)}</span>
                  <span className="block"><B>Does:</B> {doesText(r)}</span>
                  <span className="block break-words"><B>For:</B> {whoText(r, dests, camps.data)}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Btn small kind="s" onClick={async () => { await toggleRule(r.id, !r.enabled); if (r.enabled) await schedule({ action: "tick" }); act(`${r.enabled ? "Switched off" : "Switched on"} the schedule rule “${r.name}”`, "Ad schedule", r.enabled ? "Rule off. What it changed has been put back." : "Rule on."); await load(); }}>{r.enabled ? "Switch off" : "Switch on"}</Btn>
                  <Btn small kind="s" onClick={() => { setDraft({ ...r, end_offset: r.end_offset ?? 0, time_from: r.time_from?.slice(0, 5) ?? null, time_to: r.time_to?.slice(0, 5) ?? null, starts_at: r.starts_at?.slice(0, 16) ?? null, ends_at: r.ends_at?.slice(0, 16) ?? null }); setErr(""); }}>Edit</Btn>
                  <Btn small kind="s" onClick={async () => { if (d.open.some((c) => c.rule_id === r.id && !c.dry_run)) return setErr("This rule has changes in force. Switch it off first, wait for Alila to put them back, then remove it."); await removeRule(r.id); act(`Removed the schedule rule “${r.name}”`, "Ad schedule", "Rule removed."); await load(); }}>Remove</Btn>
                </span>
              </li>
            );
          })}
        </ul>

        {draft && (
          <div className="flex flex-col gap-4 rounded-xl border-2 border-brand px-3 py-4 sm:px-4">
            <div className="text-[15px] font-bold">{draft.id ? "Edit rule" : draft.from_suggestion ? "New rule from Alila's suggestion" : "New rule"}</div>
            <Fld label="Name" htmlFor="r-name">
              <input id="r-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Sunday, office closed" className={INPUT} />
            </Fld>
            <Fld label="When">
              <Seg label="When" value={draft.kind} options={[{ v: "weekly", t: "Every week", d: "The same days and hours each week." }, { v: "dates", t: "Certain dates", d: "Once, from a start to an end. For public holidays and company leave." }]} onChange={(v) => setDraft({ ...draft, kind: v })} />
            </Fld>
            {draft.kind === "weekly" ? (
              <>
                <Fld label="Days">
                  <Ticks label="Days" options={DAYS.map((x) => ({ v: String(x.v), t: x.t }))} value={draft.days.map(String)} onChange={(v) => setDraft({ ...draft, days: v.map(Number) })} />
                </Fld>
                <div className="grid grid-cols-2 gap-3 sm:max-w-[420px]">
                  <Fld label="From (optional)" htmlFor="r-tf">
                    <input id="r-tf" type="time" value={draft.time_from ?? ""} onChange={(e) => setDraft({ ...draft, time_from: e.target.value || null })} className={INPUT} />
                  </Fld>
                  <Fld label="To (optional)" htmlFor="r-tt">
                    <input id="r-tt" type="time" value={draft.time_to ?? ""} onChange={(e) => setDraft({ ...draft, time_to: e.target.value || null })} className={INPUT} />
                  </Fld>
                </div>
                <Fld label="Ends" htmlFor="r-off" hint={draft.days.length > 1 && (draft.end_offset ?? 0) > 0 ? "Counted from each ticked day." : undefined}>
                  <select id="r-off" value={draft.end_offset ?? 0} onChange={(e) => setDraft({ ...draft, end_offset: Number(e.target.value) })} className={`${INPUT} sm:max-w-[420px]`}>
                    <option value={0}>The same day (or the next morning, if “To” is earlier than “From”)</option>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {draft.days.length === 1 ? `${DAYS[(draft.days[0] - 1 + n) % 7].t}, ${n === 1 ? "the next day" : `${n} days later`}` : n === 1 ? "The next day" : `${n} days later`}
                      </option>
                    ))}
                  </select>
                </Fld>
                <div className="rounded-lg bg-[#E3ECF9] px-3 py-2 text-[13px]"><B>This rule:</B> {whenText(draft)}</div>
                <div className="text-xs text-muted">Malaysia time. Leave both times empty for whole days. Example: Sat ticked, From 11:00, To 11:59, Ends “Sun, the next day” means Saturday 11:00 to Sunday 11:59.</div>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Fld label="From" htmlFor="r-ds">
                  <input id="r-ds" type="datetime-local" value={draft.starts_at ?? ""} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value || null })} className={INPUT} />
                </Fld>
                <Fld label="Until" htmlFor="r-de">
                  <input id="r-de" type="datetime-local" value={draft.ends_at ?? ""} onChange={(e) => setDraft({ ...draft, ends_at: e.target.value || null })} className={INPUT} />
                </Fld>
              </div>
            )}
            <Fld label="What Alila does">
              <Seg label="What Alila does" value={draft.action} options={[{ v: "budget", t: "Lower the budget", d: "Gentler: the ads keep running on less money, so Meta keeps learning. Good for a weekly rule." }, { v: "pause", t: "Pause", d: "Turns the campaigns off, then back on. Good for days the office is closed and long holidays." }]} onChange={(v) => setDraft({ ...draft, action: v })} />
            </Fld>
            {draft.action === "budget" && (
              <Fld label="Lower by" htmlFor="r-pct" hint="Of each daily budget. She never goes below RM5 a day.">
                <select id="r-pct" value={draft.percent ?? 50} onChange={(e) => setDraft({ ...draft, percent: Number(e.target.value) })} className={`${INPUT} max-w-[200px]`}>
                  {[20, 30, 40, 50, 60, 70, 80, 90].map((p) => (
                    <option key={p} value={p}>{p}%</option>
                  ))}
                </select>
              </Fld>
            )}
            <Fld label="For which campaigns">
              <Seg label="For which campaigns" value={draft.scope} options={[{ v: "all", t: "All" }, { v: "country", t: "By country" }, { v: "destination", t: "By destination" }, { v: "campaigns", t: "Choose campaigns" }]} onChange={(v) => setDraft({ ...draft, scope: v, scope_values: [] })} />
              {draft.scope === "country" && <Ticks label="Countries" options={countries.map((c) => ({ v: c, t: c }))} value={draft.scope_values} onChange={(v) => setDraft({ ...draft, scope_values: v })} />}
              {draft.scope === "destination" && <Ticks label="Destinations" options={dests.map((x) => ({ v: x.id, t: x.name }))} value={draft.scope_values} onChange={(v) => setDraft({ ...draft, scope_values: v })} />}
              {draft.scope === "campaigns" && (
                <div className="flex max-h-[280px] flex-col overflow-y-auto rounded-lg border border-line">
                  {running.length === 0 && <div className="px-3 py-3 text-sm text-muted">No campaign is running right now. Only running campaigns can be chosen.</div>}
                  {running.map((c) => (
                    <label key={c.id} className="flex min-h-[36px] sm:min-h-[44px] items-center gap-2.5 border-b border-line px-3 text-sm last:border-b-0">
                      <input type="checkbox" checked={draft.scope_values.includes(c.id)} onChange={(e) => setDraft({ ...draft, scope_values: e.target.checked ? [...draft.scope_values, c.id] : draft.scope_values.filter((x) => x !== c.id) })} className="h-5 w-5 flex-none" />
                      <span className="min-w-0 break-words">{c.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </Fld>
            <div className="rounded-lg bg-[#E3ECF9] px-3 py-2.5 text-sm">
              <B>What this would touch today:</B> {touched.length} running campaign{touched.length === 1 ? "" : "s"}
              {touched.length > 0 && <>, spending about {rm(daySpend)} a day{draft.action === "budget" ? <>. Lowered by {draft.percent ?? 50}%, that is about <B>{rm((daySpend * (100 - (draft.percent ?? 50))) / 100)}</B> a day while the rule is in force</> : <>. Paused, that is <B>RM0</B> while the rule is in force</>}</>}.
              {draft.scope !== "campaigns" && " Campaigns started later are covered too."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn disabled={Boolean(busy)} onClick={() => void save()}>Save rule</Btn>
              <Btn kind="s" onClick={() => { setDraft(null); setErr(""); }}>Cancel</Btn>
            </div>
          </div>
        )}
        <div className="text-xs text-muted">She checks the clock every 15 minutes, so a change can come up to 15 minutes after the time you set. If two rules cover a campaign at once, a pause wins over a budget cut, and the bigger cut wins over the smaller.</div>
      </Card>

      {/* ---------- What she did lately ---------- */}
      {d.recent.length > 0 && (
        <Card title="Put back lately" sub="The full record is in History.">
          <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-lg border border-line p-0">
            {d.recent.slice(0, 15).map((c) => (
              <li key={c.id} className="px-3 py-2 text-sm">
                <span className="block break-words font-semibold">{c.entity_name}</span>
                <span className="block text-[12px] text-muted">{c.rule_name} · {c.kind === "pause" ? "paused" : `RM${c.before.daily_budget} to RM${c.after.daily_budget}`} {when(c.applied_at)} · {c.restore_note} ({when(c.restored_at)})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="text-[13px] text-muted">
        One limit to know: if someone pauses a campaign in Ads Manager itself while Alila has it paused, she cannot tell, and turns it back on when the rule ends. A pause made in this system she does see, and leaves alone.
      </div>
    </>
  );
}
