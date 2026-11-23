import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { B, Btn, PageHead, Pill } from "../components/ui";
import { DestPicker } from "../components/DestPicker";
import { AdsForm, fromSource } from "../components/build/AdsForm";
import { AudienceForm } from "../components/build/AudienceForm";
import { Fld, INPUT, Part, Seg, Step, money } from "../components/build/parts";
import { useAuth } from "../lib/auth";
import {
  ATTRIBUTION, BIDS, type Build, EVENTS, GOALS, OBJECTIVES, type Options, type SourceAd, type SourceSet, type WinSet, type Winners,
  PAGE_FIX, audienceFrom, audienceLine, blankBuild, builder, dm, loadSaved, problems, saveLocal, staffName, standardAudience,
} from "../lib/build";
import { type Destination, type MediaItem, adCreate, cpl, fetchDestinations, fetchMedia, rm, seatsFor, useCampaigns, useCountryCost, useDashTotals, useDestinationCost, useRpc } from "../lib/live";
import { useStore } from "../lib/store";

type Line = { key: string; name: string; state: "wait" | "ok" | "fail"; note: string };
type Run = { phase: "idle" | "running" | "done"; error: string; campaign_id: string; ad_set_id: string; note: string; lines: Line[] };
const IDLE: Run = { phase: "idle", error: "", campaign_id: "", ad_set_id: "", note: "", lines: [] };
const NONE: Winners = { ads: [], ad_sets: [] };
const USUAL_BUDGET = 100;

export default function CampaignBuild() {
  const { user } = useAuth();
  const { act } = useStore();
  const email = user?.email ?? "";
  const [b, setB] = useState<Build>(() => loadSaved() ?? blankBuild(email));
  const restored = useRef(Boolean(loadSaved()));
  const [open, setOpen] = useState(1);
  const [opts, setOpts] = useState<Options | null>(null);
  const [dests, setDests] = useState<Destination[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [extras, setExtras] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [everything, setEverything] = useState(false);
  const [pickCountry, setPickCountry] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [sure, setSure] = useState(false);
  const [run, setRun] = useState<Run>(IDLE);
  const [seats, setSeats] = useState<{ departures: number; seats: number; unknown: number; next: string | null } | null>(null);
  const win = useRpc<Winners>("campaign_winners", { p_days: 30 }, NONE);
  const camps = useCampaigns(30);
  const countryCost = useCountryCost(30);
  const destCost = useDestinationCost(30);
  const dash = useDashTotals();

  useEffect(() => {
    void fetchDestinations().then(setDests);
    void fetchMedia().then(setMedia);
    void builder<Options>({ action: "options" }).then((o) => {
      setOpts(o);
      if (!o.ok) return setNote(o.error ?? "Could not read the ad account from Meta.");
      setB((x) => (x.s.pixel_id || !o.pixels?.length ? x : { ...x, s: { ...x.s, pixel_id: o.pixels[0].id } }));
    });
  }, []);
  useEffect(() => saveLocal(run.phase === "done" ? null : b), [b, run.phase]);
  useEffect(() => {
    setSeats(null);
    if (b.dest) void seatsFor(b.dest).then(setSeats);
  }, [b.dest]);

  const dest = dests.find((d) => d.id === b.dest);
  const place = dest ? (dest.name.toLowerCase() === dest.country.toLowerCase() ? dest.country : dest.name.replace(new RegExp(`^${dest.country}\\s*[-–:]\\s*`, "i"), "")) : "";
  const who = staffName(email);
  // What to copy: the region chosen, else its country, else (only when asked) the whole account.
  const country = dest?.country ?? pickCountry;
  const regionSets = useMemo(() => (b.dest ? win.data.ad_sets.filter((s) => s.destination_id === b.dest) : []), [win.data, b.dest]);
  const countrySets = useMemo(() => (country ? win.data.ad_sets.filter((s) => (s.country ?? "").toLowerCase() === country.toLowerCase()) : []), [win.data, country]);
  const scope: "region" | "country" | "account" | "none" = everything ? "account" : regionSets.length ? "region" : countrySets.length ? "country" : country ? "none" : "account";
  const sets = scope === "region" ? regionSets : scope === "country" ? countrySets : scope === "account" ? win.data.ad_sets : [];
  const forDest = scope === "region" || scope === "country";
  const ads = useMemo(() => {
    const ids = new Set(sets.map((x) => x.id));
    return scope === "account" ? win.data.ads : win.data.ads.filter((a) => ids.has(a.ad_set_id));
  }, [win.data, sets, scope]);
  // The figures behind the suggestion, last 30 days.
  const cRow = (countryCost.data?.rows ?? []).find((r) => r.country.toLowerCase() === country.toLowerCase());
  const dRow = dest ? (destCost.data?.rows ?? []).find((r) => r.destination === dest.name) : undefined;
  const goal = { target: Number(dash.data?.target ?? 50), limit: Number(dash.data?.limit ?? 80) };
  const perPax = (spend: number, pax: number) => (pax > 0 ? spend / pax : null);
  const paxTone = (v: number | null) => (v == null ? "text-muted" : v <= goal.target ? "text-[#17663F]" : v <= goal.limit ? "text-[#8A5300]" : "text-[#A3231B]");
  const existing = b.where === "existing";
  const target = camps.data.find((c) => c.id === b.campaign_id);
  const objective = existing ? target?.objective || "OUTCOME_LEADS" : b.c.objective;
  const cbo = existing ? target?.daily_budget != null : b.c.budget_level === "campaign";
  const goals = GOALS[objective] ?? GOALS.OUTCOME_LEADS;
  const events = EVENTS[objective] ?? EVENTS.OUTCOME_LEADS;
  const bid = cbo && !existing ? b.c.bid_strategy : b.s.bid_strategy;
  const creativeOk = opts?.creative_ok !== false;
  const defaults = { link: opts?.identity?.link ?? "", cta: opts?.identity?.cta ?? "CONTACT_US", url_tags: opts?.identity?.url_tags ?? "" };
  const issues = problems(b, cbo);
  const upC = (p: Partial<Build["c"]>) => setB((x) => ({ ...x, c: { ...x.c, ...p } }));
  const upS = (p: Partial<Build["s"]>) => setB((x) => ({ ...x, s: { ...x.s, ...p } }));

  function pickDest(id: string) {
    const d = dests.find((x) => x.id === id);
    // A region is written as a tag, "[Korea Winter] 24/11 - Sadam", so the system matches it exactly.
    const short = d ? (d.name.includes(" - ") ? `[${d.name.replace(/\s+-\s+/g, " ")}]` : d.country) : "";
    setB((x) => ({ ...x, dest: id, campaign_id: "", c: { ...x.c, name: short && (!x.c.name || / - /.test(x.c.name)) ? `${short} ${dm()} - ${who}` : x.c.name } }));
    setEverything(false);
    if (d) setPickCountry(d.country);
  }
  function setObjective(v: string) {
    const g = GOALS[v] ?? [];
    setB((x) => ({ ...x, c: { ...x.c, objective: v }, s: { ...x.s, goal: g.some((o) => o.v === x.s.goal) ? x.s.goal : (g[0]?.v ?? ""), event: (EVENTS[v] ?? []).some((e) => e.v === x.s.event) ? x.s.event : (EVENTS[v]?.[0]?.v ?? "") } }));
  }
  function applySet(s: SourceSet, w: WinSet) {
    const { audience, extras: ex } = audienceFrom(s.targeting, opts?.audiences ?? []);
    setExtras(ex);
    const kind = /mp4|video/i.test(w.ad_set) ? "MP4" : /png|jpg|image/i.test(w.ad_set) ? "PNG" : "";
    setB((x) => {
      const obj = x.where === "new" && GOALS[s.objective] ? s.objective : x.c.objective;
      const goalOk = (GOALS[x.where === "new" ? obj : objective] ?? []).some((g) => g.v === s.goal);
      return {
        ...x,
        c: { ...x.c, objective: obj, budget_level: s.campaign_budget ? "campaign" : "adset", daily_budget: s.campaign_budget ? String(s.campaign_budget) : x.c.daily_budget, bid_strategy: s.bid_strategy },
        s: {
          ...x.s, name: `Broad ${kind ? `${kind} ` : ""}${dm()} - ${who}`, goal: goalOk ? s.goal : x.s.goal, pixel_id: s.pixel_id || x.s.pixel_id, event: s.event || x.s.event,
          budget: s.daily_budget ? String(s.daily_budget) : x.s.budget, budget_type: "daily", bid_strategy: s.bid_strategy, bid_amount: s.bid_amount ? String(s.bid_amount) : "", attribution: s.attribution, audience,
          from: { id: w.id, name: w.ad_set, campaign: w.campaign },
        },
      };
    });
  }
  async function copySet(w: WinSet, withAds: number) {
    setBusy(`Reading “${w.ad_set}” from Meta…`);
    setNote("");
    const top = withAds ? win.data.ads.filter((a) => a.ad_set_id === w.id).slice(0, withAds) : [];
    const r = await builder<{ ad_set?: SourceSet; ads?: SourceAd[] }>({ action: "source", ad_set_id: w.id, ad_ids: top.map((a) => a.id) });
    setBusy("");
    if (!r.ok || !r.ad_set) return setNote(r.error ?? "Could not read that ad set from Meta.");
    applySet(r.ad_set, w);
    const got = (r.ads ?? []).filter((a) => a.creative_id);
    if (got.length) setB((x) => ({ ...x, ads: [...x.ads.filter((a) => !got.some((g) => g.id === a.from?.id)), ...got.map((g) => fromSource(g, top.find((t) => t.id === g.id), defaults))] }));
    act(`Copied the settings of ad set “${w.ad_set}” into a new campaign form`, "Run campaign", withAds ? `Settings and ${got.length} ad${got.length === 1 ? "" : "s"} copied. Check each step, then create.` : "Settings copied. Now add the ads.");
    setOpen(existing ? 3 : 2);
  }
  function standard() {
    setExtras([]);
    setB((x) => ({ ...x, c: { ...x.c, objective: "OUTCOME_LEADS", budget_level: "adset", bid_strategy: "LOWEST_COST_WITHOUT_CAP" }, s: { ...x.s, goal: "OFFSITE_CONVERSIONS", event: "COMPLETE_REGISTRATION", pixel_id: opts?.pixels?.[0]?.id ?? x.s.pixel_id, budget: String(USUAL_BUDGET), budget_type: "daily", bid_strategy: "LOWEST_COST_WITHOUT_CAP", bid_amount: "", attribution: "7c1v", audience: standardAudience(), from: undefined } }));
    setOpen(existing ? 3 : 2);
  }
  function startOver() {
    setB(blankBuild(email));
    setExtras([]);
    setRun(IDLE);
    setSure(false);
    setOpen(1);
    restored.current = false;
  }

  const adBody = (ad: Build["ads"][number], adSetId: string) => {
    const base = { action: "create", ad_set_id: adSetId, name: ad.name.trim(), copied_from: ad.from?.ad ?? "" };
    if (ad.mode === "reuse") return { ...base, creative_id: ad.creative_id };
    const words = { message: ad.message, title: ad.title, description: ad.description, link: ad.link, cta: ad.cta, url_tags: ad.url_tags, page_id: opts?.identity?.page_id ?? "", instagram_user_id: opts?.identity?.instagram_user_id ?? "", template_ad_id: ad.from?.id ?? win.data.ads[0]?.id };
    return ad.mode === "same" ? { ...base, ...words, image_hash: ad.image_hash, video_id: ad.kind === "video" ? ad.video_id : "" } : { ...base, ...words, media_id: ad.media_id };
  };
  async function makeAd(key: string, adSetId: string) {
    const ad = b.ads.find((a) => a.key === key);
    if (!ad) return;
    setRun((r) => ({ ...r, lines: r.lines.map((l) => (l.key === key ? { ...l, state: "wait", note: "Creating…" } : l)) }));
    const r = await adCreate(adBody(ad, adSetId));
    setRun((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, state: r.ok ? "ok" : "fail", note: r.ok ? "Created, paused." : (r.error ?? "Failed.") } : l)) }));
  }
  async function create() {
    setSure(false);
    setRun({ ...IDLE, phase: "running", lines: b.ads.map((a) => ({ key: a.key, name: a.name, state: "wait", note: "Waiting…" })) });
    const r = await builder<{ campaign_id?: string; ad_set_id?: string; note?: string }>({
      action: "create", page_id: opts?.identity?.page_id ?? "",
      campaign: { mode: b.where, id: b.campaign_id, name: b.c.name.trim(), objective: b.c.objective, budget_level: b.c.budget_level, daily_budget: b.c.daily_budget, bid_strategy: b.c.bid_strategy, spend_cap: b.c.spend_cap, destination_id: b.dest },
      ad_set: { name: b.s.name.trim(), goal: b.s.goal, pixel_id: b.s.pixel_id, event: b.s.event, budget_type: b.s.budget_type, budget: b.s.budget, start: b.s.start, end: b.s.end, bid_strategy: b.s.bid_strategy, bid_amount: b.s.bid_amount, attribution: b.s.attribution, audience: b.s.audience, source_ad_set_id: b.s.from?.id ?? "" },
    });
    if (!r.ok || !r.ad_set_id) {
      setRun({ ...IDLE, error: r.error ?? "Meta did not accept it." });
      return act(`Creating “${existing ? target?.name : b.c.name}” in Meta failed`, "Run campaign", r.error ?? "Failed.");
    }
    setRun((x) => ({ ...x, campaign_id: r.campaign_id ?? "", ad_set_id: r.ad_set_id ?? "", note: r.note ?? "" }));
    for (const ad of b.ads) await makeAd(ad.key, r.ad_set_id);
    setRun((x) => ({ ...x, phase: "done" }));
    act(`Created ${existing ? `ad set “${b.s.name}” in “${target?.name}”` : `campaign “${b.c.name}”`} in Meta, paused`, "Run campaign", "Created in Meta, paused. Open it to preview and turn it on.");
    void camps.reload();
  }

  /* ---------- After Create is pressed ---------- */
  if (run.phase !== "idle") {
    const failed = run.lines.filter((l) => l.state === "fail");
    return (
      <>
        <PageHead title="Run campaign" sub={run.phase === "running" ? "Creating in Meta. Keep this page open." : "Finished."} />
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
          <div className="flex items-center gap-2 text-sm">
            <Pill tone={run.ad_set_id ? "g" : "a"}>{run.ad_set_id ? "Done" : "Working…"}</Pill>
            <span>{existing ? <>Ad set <B>{b.s.name}</B> in <B>{target?.name}</B></> : <>Campaign <B>{b.c.name}</B> and ad set <B>{b.s.name}</B></>}</span>
          </div>
          {run.note && <div className="text-[13px] text-muted">{run.note}</div>}
          <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-lg border border-line p-0">
            {run.lines.map((l) => (
              <li key={l.key} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                <Pill tone={l.state === "ok" ? "g" : l.state === "fail" ? "r" : "a"}>{l.state === "ok" ? "Created" : l.state === "fail" ? "Not created" : "…"}</Pill>
                <span className="min-w-0 flex-1">
                  <B>{l.name}</B>
                  <span className="block break-words text-[13px] text-muted">{l.note}</span>
                </span>
                {l.state === "fail" && run.phase === "done" && (
                  <Btn small kind="s" onClick={() => void makeAd(l.key, run.ad_set_id)}>Try again</Btn>
                )}
              </li>
            ))}
          </ul>
          {run.phase === "done" && (
            <>
              <div className="rounded-lg bg-[#E6F1EE] px-3 py-2.5 text-sm">
                <B>Everything is paused.</B> Nothing spends until someone turns it on. Open the campaign to preview each ad, then turn it on there.
                {failed.length > 0 && <> {failed.length} ad{failed.length === 1 ? " was" : "s were"} not created: fix the cause and press Try again, or add {failed.length === 1 ? "it" : "them"} later from the campaign page.</>}
              </div>
              <div className="flex flex-wrap gap-2">
                {run.campaign_id && (
                  <Link to={`/campaigns/${run.campaign_id}`} className="flex min-h-[36px] sm:min-h-[44px] items-center rounded-lg bg-brand px-4 text-sm font-bold text-white no-underline">
                    Open the campaign
                  </Link>
                )}
                <Btn kind="s" onClick={startOver}>Run another</Btn>
              </div>
            </>
          )}
        </section>
      </>
    );
  }

  const bestSet = sets[0];
  const bestAds = bestSet ? win.data.ads.filter((a) => a.ad_set_id === bestSet.id).slice(0, 2) : [];
  const sum1 = existing ? (target ? `Add an ad set to ${target.name}` : "Add an ad set to an existing campaign") : `${dest?.name ?? "No destination"} · new campaign${b.s.from ? ` · settings from ${b.s.from.name}` : ""}`;
  const sum2 = `${b.c.name || "No name"} · ${OBJECTIVES.find((o) => o.v === b.c.objective)?.t} · ${b.c.budget_level === "campaign" ? `RM${b.c.daily_budget || "?"} a day for the campaign` : "budget on the ad set"}`;
  const sum3 = `${b.s.name || "No name"} · ${goals.find((g) => g.v === b.s.goal)?.t ?? "?"}${cbo ? "" : ` · RM${b.s.budget || "?"}${b.s.budget_type === "daily" ? " a day" : " in total"}`} · ${audienceLine(b.s.audience)}`;
  const sum4 = b.ads.length ? b.ads.map((a) => a.name).join(", ") : "No ads yet";
  const budgetNow = Number(cbo && !existing ? b.c.daily_budget : b.s.budget) || 0;

  return (
    <>
      <PageHead
        title="Run campaign"
        sub="Step 3. Build a campaign here instead of Ads Manager: copy what already works, or set everything yourself. It is created paused."
        right={<Btn kind="s" onClick={startOver}>Start over</Btn>}
      />
      {restored.current && (
        <div className="rounded-xl bg-[#E6F1EE] px-4 py-3 text-sm">
          Your unfinished campaign was kept on this device. Carry on, or press Start over.
        </div>
      )}
      {busy && <div role="status" className="rounded-xl bg-[#FBEFD5] px-4 py-3 text-sm font-semibold">{busy}</div>}
      {note && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl bg-[#FBE6E3] px-4 py-3 text-sm text-[#7A1A14]">
          <span>{note}</span>
          <button type="button" onClick={() => setNote("")} className="border-0 bg-transparent p-0 text-sm font-semibold text-[#7A1A14] underline">Close</button>
        </div>
      )}
      {!creativeOk && <div role="alert" className="rounded-xl bg-[#FBE6E3] px-4 py-3 text-sm text-[#7A1A14]"><B>One thing to fix in Meta first.</B> {PAGE_FIX}</div>}
      {run.error && <div role="alert" className="rounded-xl bg-[#FBE6E3] px-4 py-3 text-sm text-[#7A1A14]"><B>Not created.</B> {run.error}</div>}

      {/* ---------- 1. Start ---------- */}
      <Step n={1} title="What to sell, and what to copy" summary={sum1} open={open === 1} done={Boolean(b.dest || b.s.from)} onToggle={() => setOpen(open === 1 ? 0 : 1)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Fld label="Destination" hint="Tags the campaign, so its cost per pax is counted against the right deposits.">
            <DestPicker dests={dests} value={b.dest} email={email} onChange={pickDest} onCreated={setDests} onCountry={(c) => { setPickCountry(c); setEverything(false); }} />
            {seats && b.dest && (
              <div className={`rounded-lg px-3 py-2 text-[13px] ${seats.departures === 0 ? "bg-[#FBEFD5]" : "bg-ground"}`}>
                {seats.departures === 0 ? "No coming departure for this destination in TravelCRM. Check there is something to sell before spending." : <>TravelCRM: <B>{seats.seats}</B> seats left across {seats.departures} coming departure{seats.departures === 1 ? "" : "s"}{seats.next ? `, next on ${seats.next}` : ""}.</>}
              </div>
            )}
          </Fld>
          <Fld label="Where it goes">
            <Seg label="Where it goes" value={b.where} options={[{ v: "new", t: "A new campaign", d: "One campaign for one product, as MTB runs them." }, { v: "existing", t: "Add to a campaign", d: "A new ad set, with its ads, inside a campaign that already exists." }]} onChange={(v) => setB((x) => ({ ...x, where: v }))} />
            {existing && (
              <select aria-label="Campaign to add to" value={b.campaign_id} onChange={(e) => setB((x) => ({ ...x, campaign_id: e.target.value }))} className={INPUT}>
                <option value="">Choose the campaign…</option>
                {camps.data.filter((c) => !b.dest || c.destination_id === b.dest).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </Fld>
        </div>

        <Part>Copy what already works</Part>
        {!country && !everything ? (
          <div className="rounded-lg bg-ground px-3 py-3 text-sm">
            Choose a country above, and the best ad set there is suggested here, with its figures.{" "}
            <button type="button" onClick={() => setEverything(true)} className="border-0 bg-transparent p-0 text-sm font-semibold text-brand underline">Or see the best in the whole account</button>
          </div>
        ) : win.loading ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : (
          <>
            {country && !everything && (
              <div className="flex flex-col gap-1.5 rounded-lg bg-ground px-3 py-2.5 text-[13px]">
                <div className="font-bold">{country}{dest && place !== dest.country ? <> › {place}</> : null}, last 30 days</div>
                {[
                  { label: country, row: cRow ? { spend: cRow.spend, leads: cRow.leads, pax: cRow.pax } : null, sets: countrySets.length },
                  ...(dest && place !== dest.country ? [{ label: place, row: dRow ? { spend: dRow.spend, leads: dRow.leads, pax: dRow.pax } : null, sets: regionSets.length }] : []),
                ].map((x) => {
                  const pp = x.row ? perPax(x.row.spend, x.row.pax) : null;
                  return (
                    <div key={x.label} className="flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="min-w-[90px] font-semibold">{x.label}</span>
                      {x.row && x.row.spend > 0 ? (
                        <>
                          <span>{rm(x.row.spend)} spent</span>
                          <span>{x.row.leads} leads{x.row.leads ? ` · ${cpl(x.row.spend, x.row.leads)} each` : ""}</span>
                          <span>{x.row.pax} deposit pax{pp != null ? <> · <b className={paxTone(pp)}>RM{Math.round(pp)} a pax</b></> : ""}</span>
                          <span className="text-muted">{x.sets} ad set{x.sets === 1 ? "" : "s"} with leads</span>
                        </>
                      ) : (
                        <span className="text-muted">No ad spend in 30 days.</span>
                      )}
                    </div>
                  );
                })}
                <div className="text-[11px] text-muted">Cost per pax against the target RM{goal.target} and limit RM{goal.limit}. Deposits are matched by destination, not by ad set.</div>
              </div>
            )}

            {scope === "none" ? (
              <div className="flex flex-col gap-2 rounded-lg border-2 border-[#E8C98A] bg-[#FDF6E7] px-3 py-3 text-sm">
                <div>
                  <B>Nothing to copy for {dest && place !== dest.country ? `${place} or ` : ""}{country}.</B> No ad set there brought a lead in the last 30 days, so there is no proven setting to suggest.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Btn small disabled={Boolean(busy)} onClick={standard}>Start from MTB's standard settings</Btn>
                  <Btn small kind="s" onClick={() => setEverything(true)}>Copy from another country</Btn>
                </div>
              </div>
            ) : (
              <>
                {dest && scope === "country" && place !== dest.country && (
                  <div className="rounded-lg bg-[#FDF6E7] px-3 py-2 text-[13px]">
                    <B>Nothing for {place} yet:</B> no ad set there brought a lead in the last 30 days. The best in {country} is suggested instead.
                  </div>
                )}
                {bestSet && (
                  <div className="flex flex-col gap-2 rounded-lg border-2 border-brand bg-[#E6F1EE] px-3 py-3">
                    <div className="text-sm">
                      <B>Quickest way{scope === "account" ? " (whole account)" : scope === "region" ? ` for ${place}` : ` for ${country}`}.</B> Copy <B>{bestSet.ad_set}</B> from {bestSet.campaign}: {cpl(bestSet.spend, bestSet.leads)} a lead, {bestSet.leads} leads, {rm(bestSet.spend)}
                      {bestAds.length ? <>, with its {bestAds.length === 1 ? "best ad" : `${bestAds.length} best ads`}: {bestAds.map((a) => a.ad).join(", ")}</> : ""}.
                    </div>
                    {!bestSet.proven && <div className="text-[12px] text-[#8A5300]">Only {bestSet.leads} leads, so this is not proven yet: its cost could be luck.</div>}
                    {sets.length > 1 && <div className="text-[12px] text-muted">Next best: {sets[1].ad_set}, {cpl(sets[1].spend, sets[1].leads)} a lead ({sets[1].leads} leads).</div>}
                    <div>
                      <Btn disabled={Boolean(busy)} onClick={() => void copySet(bestSet, 2)}>Use the best</Btn>
                    </div>
                  </div>
                )}
                <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-lg border border-line p-0">
                  {sets.slice(0, 6).map((s, i) => (
                    <li key={s.id} className="flex items-center gap-2 px-3 py-2.5">
                      <span className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ground text-xs font-bold">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 text-sm font-bold">
                          {s.ad_set} {s.proven && <Pill tone="g">Proven</Pill>} {b.s.from?.id === s.id && <Pill tone="a">Copied</Pill>}
                        </span>
                        <span className="block break-words text-[12px] text-muted">
                          {s.campaign}{scope !== "region" && s.destination ? ` (${s.destination})` : ""} · <B>{cpl(s.spend, s.leads)}</B> a lead · {s.leads} leads · {rm(s.spend)}{s.daily_budget ? ` · RM${s.daily_budget} a day` : ""}
                        </span>
                      </span>
                      <Btn small kind="s" disabled={Boolean(busy)} onClick={() => void copySet(s, 0)}>Copy settings</Btn>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {(country || everything) && (
              <button type="button" onClick={() => setEverything(!everything)} className="self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-brand underline">
                {everything ? (country ? `Back to ${dest && place !== dest.country ? place : country}` : "Hide the whole account") : "Show the best in the whole account"}
              </button>
            )}
          </>
        )}
        <div className={`${scope === "none" && !everything ? "hidden" : "flex"} flex-wrap items-center gap-2`}>
          <Btn kind="s" disabled={Boolean(busy)} onClick={standard}>Start from MTB's standard settings</Btn>
          <span className="text-xs text-muted">Leads on the website, Malaysia, 22+, Advantage+ audience and placements, RM{USUAL_BUDGET} a day.</span>
        </div>
        <div className="text-xs text-muted">“Proven” means at least 8 leads for an ad set, or 5 for an ad, so the cost is not a lucky day. Leads are website leads from Meta; deposits are known only by destination.</div>
      </Step>

      {/* ---------- 2. Campaign ---------- */}
      {!existing && (
        <Step n={2} title="Campaign" summary={sum2} open={open === 2} done={Boolean(b.c.name.trim())} onToggle={() => setOpen(open === 2 ? 0 : 2)}>
          <Fld label="Campaign name" htmlFor="c-name" hint="[Destination] date - your name, for example [Korea Winter] 24/11 - Haniss. The tag in brackets tells the system the destination.">
            <input id="c-name" value={b.c.name} onChange={(e) => upC({ name: e.target.value })} placeholder={`Yunnan ${dm()} - ${who}`} className={INPUT} />
          </Fld>
          <Fld label="Objective">
            <Seg label="Objective" value={b.c.objective} options={OBJECTIVES} onChange={setObjective} />
          </Fld>
          <Fld label="Where the budget sits">
            <Seg label="Where the budget sits" value={b.c.budget_level} options={[{ v: "adset", t: "On each ad set", d: "You decide how much each ad set spends. What MTB uses." }, { v: "campaign", t: "On the campaign (Advantage+ budget)", d: "One budget for the campaign. Meta moves it between the ad sets by itself." }]} onChange={(v) => upC({ budget_level: v })} />
          </Fld>
          {b.c.budget_level === "campaign" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Fld label="Campaign daily budget, RM" htmlFor="c-bud">
                <input id="c-bud" inputMode="decimal" value={b.c.daily_budget} onChange={(e) => upC({ daily_budget: money(e.target.value) })} className={INPUT} />
              </Fld>
              <Fld label="Bid strategy">
                <Seg label="Bid strategy" value={b.c.bid_strategy} options={BIDS} onChange={(v) => upC({ bid_strategy: v })} />
              </Fld>
            </div>
          )}
          <Fld label="Campaign spending limit, RM (optional)" htmlFor="c-cap" hint="The campaign stops for good once it has spent this much in total. Leave empty for no limit.">
            <input id="c-cap" inputMode="decimal" value={b.c.spend_cap} onChange={(e) => upC({ spend_cap: money(e.target.value) })} className={`${INPUT} max-w-[200px]`} />
          </Fld>
          <div className="text-xs text-muted">Special ad categories: none (travel is not one). Buying type: auction.</div>
          <div><Btn onClick={() => setOpen(3)}>Next: ad set</Btn></div>
        </Step>
      )}

      {/* ---------- 3. Ad set ---------- */}
      <Step n={existing ? 2 : 3} title="Ad set: result, budget, audience, placements" summary={sum3} open={open === 3} done={issues.every((i) => i.step !== 3) && Boolean(b.s.from || b.s.name)} onToggle={() => setOpen(open === 3 ? 0 : 3)}>
        {b.s.from && <div className="rounded-lg bg-[#E6F1EE] px-3 py-2 text-[13px]">Settings copied from <B>{b.s.from.name}</B> in {b.s.from.campaign}. Change anything below.</div>}
        <Fld label="Ad set name" htmlFor="s-name">
          <input id="s-name" value={b.s.name} onChange={(e) => upS({ name: e.target.value })} className={INPUT} />
        </Fld>

        <Part>Result to aim for</Part>
        <Fld label="What Meta should get the most of">
          <Seg label="Performance goal" value={b.s.goal} options={goals} onChange={(v) => upS({ goal: v })} />
        </Fld>
        {b.s.goal === "OFFSITE_CONVERSIONS" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Fld label="Pixel (dataset)" htmlFor="s-pix">
              <select id="s-pix" value={b.s.pixel_id} onChange={(e) => upS({ pixel_id: e.target.value })} className={INPUT}>
                <option value="">{opts ? "Choose…" : "Reading from Meta…"}</option>
                {b.s.pixel_id && !(opts?.pixels ?? []).some((p) => p.id === b.s.pixel_id) && <option value={b.s.pixel_id}>{b.s.pixel_id}</option>}
                {(opts?.pixels ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Fld>
            <Fld label="Event that counts as a result" htmlFor="s-evt">
              <select id="s-evt" value={b.s.event} onChange={(e) => upS({ event: e.target.value })} className={INPUT}>
                {!events.some((e) => e.v === b.s.event) && b.s.event && <option value={b.s.event}>{b.s.event}</option>}
                {events.map((e) => (
                  <option key={e.v} value={e.v}>{e.t}</option>
                ))}
              </select>
            </Fld>
          </div>
        )}

        <Part>Budget and schedule</Part>
        {cbo ? (
          <div className="rounded-lg bg-ground px-3 py-2 text-[13px]">The budget sits on the campaign{existing && target?.daily_budget ? ` (RM${target.daily_budget} a day)` : ""}, so this ad set has none of its own.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Fld label="Budget type">
              <Seg label="Budget type" value={b.s.budget_type} options={[{ v: "daily", t: "Daily", d: "About this much each day. Meta may spend up to 75% more on a good day and less on others." }, { v: "lifetime", t: "Lifetime", d: "This much in total between the start and the end date." }]} onChange={(v) => upS({ budget_type: v })} />
            </Fld>
            <Fld label={b.s.budget_type === "daily" ? "Daily budget, RM" : "Total budget, RM"} htmlFor="s-bud" hint={b.s.budget_type === "daily" ? `MTB's ad sets usually run at RM${USUAL_BUDGET} a day.` : undefined}>
              <input id="s-bud" inputMode="decimal" value={b.s.budget} onChange={(e) => upS({ budget: money(e.target.value) })} className={INPUT} />
            </Fld>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Fld label="Start (optional)" htmlFor="s-start" hint="Malaysia time. Empty means it can start as soon as it is turned on.">
            <input id="s-start" type="datetime-local" value={b.s.start} onChange={(e) => upS({ start: e.target.value })} className={INPUT} />
          </Fld>
          <Fld label={b.s.budget_type === "lifetime" && !cbo ? "End" : "End (optional)"} htmlFor="s-end" hint="Empty means it runs until someone pauses it.">
            <input id="s-end" type="datetime-local" value={b.s.end} onChange={(e) => upS({ end: e.target.value })} className={INPUT} />
          </Fld>
        </div>

        <AudienceForm a={b.s.audience} set={(audience) => upS({ audience })} saved={opts?.audiences ?? []} extras={extras} />

        <button type="button" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)} className="self-start border-0 bg-transparent p-0 text-sm font-semibold text-brand underline">
          {advanced ? "Hide bidding and attribution" : "Bidding and attribution (MTB's usual is already set)"}
        </button>
        {advanced && (
          <>
            <Part>Bidding and attribution</Part>
            {!(cbo && !existing) && (
              <Fld label="Bid strategy">
                <Seg label="Bid strategy" value={b.s.bid_strategy} options={BIDS} onChange={(v) => upS({ bid_strategy: v })} />
              </Fld>
            )}
            {bid !== "LOWEST_COST_WITHOUT_CAP" && (
              <Fld label={bid === "COST_CAP" ? "Cost per result to aim for, RM" : "Highest bid, RM"} htmlFor="s-bid" hint="Set it too low and the ad set may hardly deliver.">
                <input id="s-bid" inputMode="decimal" value={b.s.bid_amount} onChange={(e) => upS({ bid_amount: money(e.target.value) })} className={`${INPUT} max-w-[200px]`} />
              </Fld>
            )}
            {b.s.goal === "OFFSITE_CONVERSIONS" && (
              <Fld label="Attribution: which results count" htmlFor="s-att">
                <select id="s-att" value={b.s.attribution} onChange={(e) => upS({ attribution: e.target.value })} className={INPUT}>
                  {ATTRIBUTION.map((a) => (
                    <option key={a.v} value={a.v}>{a.t}</option>
                  ))}
                </select>
              </Fld>
            )}
            <div className="text-xs text-muted">Charged per impression, as Meta requires for these goals. The advertiser declaration Meta needs for Malaysia is copied from your recent ad sets by itself.</div>
          </>
        )}
        <div><Btn onClick={() => setOpen(4)}>Next: ads</Btn></div>
      </Step>

      {/* ---------- 4. Ads ---------- */}
      <Step n={existing ? 3 : 4} title="Ads: media and words" summary={sum4} open={open === 4} done={b.ads.length > 0 && issues.every((i) => i.step !== 4)} onToggle={() => setOpen(open === 4 ? 0 : 4)}>
        <AdsForm ads={b.ads} set={(list) => setB((x) => ({ ...x, ads: list }))} winners={ads.length ? ads : win.data.ads} media={media} destId={b.dest} defaults={defaults} creativeOk={creativeOk} onNote={setNote} />
        <div><Btn onClick={() => setOpen(5)}>Next: check and create</Btn></div>
      </Step>

      {/* ---------- 5. Review ---------- */}
      <Step n={existing ? 4 : 5} title="Check and create" summary={issues.length ? `${issues.length} thing${issues.length === 1 ? "" : "s"} still to fill in` : "Ready to create, paused"} open={open === 5} done={false} onToggle={() => setOpen(open === 5 ? 0 : 5)}>
        <dl className="m-0 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[150px_1fr]">
          <dt className="font-semibold text-muted">Campaign</dt>
          <dd className="m-0">{existing ? <>{target?.name ?? "Not chosen"} (already exists)</> : <>{b.c.name || "No name"} · {OBJECTIVES.find((o) => o.v === b.c.objective)?.t} · {dest?.name ?? "no destination tag"}</>}</dd>
          <dt className="font-semibold text-muted">Ad set</dt>
          <dd className="m-0">{b.s.name || "No name"} · {goals.find((g) => g.v === b.s.goal)?.t}{b.s.goal === "OFFSITE_CONVERSIONS" ? ` (${events.find((e) => e.v === b.s.event)?.t ?? b.s.event})` : ""}</dd>
          <dt className="font-semibold text-muted">Budget</dt>
          <dd className="m-0">{cbo && existing ? "On the campaign" : `RM${budgetNow}${cbo || b.s.budget_type === "daily" ? " a day" : " in total"}${cbo ? " for the campaign" : ""}`} · {BIDS.find((x) => x.v === bid)?.t}{b.s.start ? ` · starts ${b.s.start.replace("T", " ")}` : ""}{b.s.end ? ` · ends ${b.s.end.replace("T", " ")}` : ""}</dd>
          <dt className="font-semibold text-muted">Audience</dt>
          <dd className="m-0">{audienceLine(b.s.audience)}</dd>
          <dt className="font-semibold text-muted">Placements</dt>
          <dd className="m-0">{b.s.audience.placements.mode === "auto" ? "Advantage+ (all)" : b.s.audience.placements.mode === "core" ? "Facebook and Instagram feeds, Stories, Reels" : b.s.audience.placements.platforms.join(", ")}</dd>
          <dt className="font-semibold text-muted">Ads ({b.ads.length})</dt>
          <dd className="m-0">{b.ads.length ? b.ads.map((a) => `${a.name} (${a.mode === "reuse" ? "as it is" : a.mode === "same" ? "same media, new words" : "from the library"})`).join(" · ") : "None"}</dd>
        </dl>
        {budgetNow > USUAL_BUDGET * 3 && (cbo || b.s.budget_type === "daily") && (
          <div className="rounded-lg bg-[#FBEFD5] px-3 py-2 text-[13px]"><B>RM{budgetNow} a day</B> is more than three times MTB's usual RM{USUAL_BUDGET}. Make sure that is what you mean.</div>
        )}
        {b.ads.some((a) => a.mode !== "reuse") && <div className="rounded-lg bg-ground px-3 py-2 text-[13px]">Prices and dates in your ad text are not checked against TravelCRM. Read them once more before you create.</div>}
        {!creativeOk && <div className="rounded-lg bg-[#FBE6E3] px-3 py-2 text-[13px] text-[#7A1A14]">The campaign and ad set will be created, but Meta will refuse the ads until the Page access is fixed. After fixing it, press Try again beside each ad on the next screen.</div>}
        {issues.length > 0 ? (
          <div className="flex flex-col gap-1.5 rounded-lg bg-[#FBE6E3] px-3 py-3 text-sm text-[#7A1A14]">
            <B>Still to fill in:</B>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px]">
              {issues.map((i, k) => (
                <li key={k}>
                  <button type="button" onClick={() => setOpen(i.step)} className="border-0 bg-transparent p-0 text-left text-sm text-[#7A1A14] underline">{i.text}</button>
                </li>
              ))}
            </ul>
          </div>
        ) : sure ? (
          <div className="flex flex-col gap-2 rounded-lg bg-[#FBEFD5] px-3 py-3 text-sm">
            <div><B>Create this in Meta now?</B> The campaign, the ad set and {b.ads.length} ad{b.ads.length === 1 ? "" : "s"} are created <B>paused</B>. Nothing spends until someone turns it on. It is recorded under your name.</div>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => void create()}>Yes, create it paused</Btn>
              <Btn kind="s" onClick={() => setSure(false)}>Cancel</Btn>
            </div>
          </div>
        ) : (
          <div><Btn onClick={() => setSure(true)}>Create in Meta, paused…</Btn></div>
        )}
      </Step>

      <div className="text-[13px] text-muted">
        To copy a whole campaign exactly as it is, with every ad set and ad, use <Link to="/campaigns/duplicate">Duplicate a campaign</Link>. Not built here yet: lead forms inside Facebook, click-to-WhatsApp ads, catalogue ads and A/B tests. Make those in Ads Manager.
      </div>
    </>
  );
}
