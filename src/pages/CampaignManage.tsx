import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { B, Btn, Card, PageHead, Pill } from "../components/ui";
import { type AdRow, type AdSetRow, type ManagedCampaign, type MediaItem, PERIODS, PREVIEW_FORMATS, adCreate, adPreview, adam, count, cpl, delivery, fetchBrief, fetchManaged, fetchMedia, period, rm, seatsFor, spanText } from "../lib/live";
import { useStore } from "../lib/store";

const INPUT = "min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";
type Level = "campaign" | "ad_set" | "ad";
type Ask = { level: Level; id: string; name: string; kind: "pause" | "activate" | "budget"; current?: number | null };

/** One campaign, run from here: turn things on and off, change a daily budget, add a new ad. */
export default function CampaignManage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const briefId = params.get("brief") ?? "";
  const { act } = useStore();
  const [label, setLabel] = useState("Last 7 days");
  const range = useMemo(() => period(label), [label]);
  const [data, setData] = useState<ManagedCampaign | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState("");
  const [brief, setBrief] = useState<{ hook: string; text: string; concept: string } | null>(null);
  const [view, setView] = useState<{ id: string; format: string; src: string; note: string } | null>(null);
  async function preview(adId: string, format = "MOBILE_FEED_STANDARD") {
    setView({ id: adId, format, src: "", note: "Asking Meta for the preview…" });
    const r = await adPreview(adId, format);
    setView({ id: adId, format, src: r.ok ? r.src ?? "" : "", note: r.ok ? "" : r.error ?? "No preview." });
  }
  const load = () => fetchManaged(id, range).then(setData);
  useEffect(() => {
    setData(null);
    void load();
  }, [id, range.from, range.to]);
  useEffect(() => {
    if (briefId) void fetchBrief(briefId).then(setBrief);
  }, [briefId]);

  async function change() {
    if (!ask) return;
    setBusy(true);
    const r = await adam({ action: "direct", level: ask.level, id: ask.id, kind: ask.kind, new_daily_budget: ask.kind === "budget" ? Number(amount) : undefined });
    setBusy(false);
    const verb = ask.kind === "pause" ? "Paused" : ask.kind === "activate" ? "Turned on" : "Changed the budget of";
    act(r.ok ? `${verb} ${ask.name}` : `Could not change ${ask.name}`, "Campaigns", r.ok ? r.note ?? "Done." : r.error ?? "Failed.");
    if (r.ok) {
      setAsk(null);
      setAmount("");
      await load();
    }
  }

  const c = data?.campaign;
  if (data && !c) return <PageHead title="Campaign not found" sub="It may have been removed. Go back to Campaigns and sync with Meta." />;

  const Toggle = ({ level, row }: { level: Level; row: { id: string; name: string; delivery_status: string | null } }) => {
    const on = row.delivery_status === "ACTIVE";
    const paused = ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"].includes(row.delivery_status ?? "");
    if (!on && !paused) return null;
    return (
      <Btn small kind="s" onClick={() => setAsk({ level, id: row.id, name: row.name, kind: on ? "pause" : "activate" })}>
        {on ? "Pause" : "Turn on"}
      </Btn>
    );
  };
  const Confirm = ({ level, rowId }: { level: Level; rowId: string }) =>
    ask && ask.level === level && ask.id === rowId ? (
      <div className="mt-2 flex flex-col gap-2 rounded-lg bg-[#FBEFD5] px-3 py-3 text-sm">
        {ask.kind === "budget" ? (
          <label className="flex flex-col gap-1 font-semibold" htmlFor={`b-${rowId}`}>
            New daily budget in RM{ask.current != null ? ` (now RM${ask.current})` : ""}
            <input id={`b-${rowId}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${INPUT} max-w-[200px] font-normal`} />
          </label>
        ) : (
          <div>
            <B>{ask.kind === "pause" ? "Pause" : "Turn on"} “{ask.name}” in Meta?</B>{" "}
            {ask.kind === "activate" ? "It starts spending as soon as Meta approves it." : "It stops spending at once. You can turn it on again here."}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Btn small disabled={busy || (ask.kind === "budget" && !(Number(amount) >= 5))} onClick={() => void change()}>
            {busy ? "Working…" : ask.kind === "budget" ? "Change budget in Meta" : ask.kind === "pause" ? "Yes, pause it" : "Yes, turn it on"}
          </Btn>
          <Btn small kind="s" disabled={busy} onClick={() => setAsk(null)}>
            Cancel
          </Btn>
        </div>
      </div>
    ) : null;
  const figures = (r: AdRow) => (r.spend ? `${rm(r.spend)} · ${count(r.leads)} leads${r.leads ? ` · ${cpl(r.spend, r.leads)} each` : ""}` : "No spend in this period");

  return (
    <>
      <PageHead
        title={c?.name ?? "Loading…"}
        sub={`Run this campaign from here. Every change is made in Meta at once, under your name, and kept in History. ${spanText(range)}.`}
        right={
          <label className="flex flex-col gap-1 text-[13px] font-semibold" htmlFor="mp">
            Period
            <select id="mp" value={label} onChange={(e) => setLabel(e.target.value)} className="min-h-[44px] rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] font-normal">
              {PERIODS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        }
      />
      <div className="text-sm">
        <Link to="/campaigns">Back to Campaigns</Link>
      </div>

      {brief && (
        <div className="rounded-xl bg-[#E6F1EE] px-5 py-4 text-sm">
          <B>Anis's brief is loaded.</B> Hook: “{brief.hook}”. Choose the ad set below and press Add ad: her text is filled in for you.
          {brief.concept && <div className="mt-1 text-muted">What to show: {brief.concept}</div>}
        </div>
      )}

      {c && (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={delivery(c.delivery_status).tone}>{delivery(c.delivery_status).text}</Pill>
            {c.destination ? <Pill tone="t">{c.destination}</Pill> : <Pill tone="a">No destination</Pill>}
            {c.run_by && <span className="text-[13px] text-muted">Run by {c.run_by}</span>}
            <span className="text-[13px] text-muted">{c.daily_budget ? `Campaign budget ${rm(c.daily_budget)} a day` : "Budget is set on each ad set"}</span>
            <span className="ml-auto flex flex-wrap gap-2">
              {c.daily_budget != null && (
                <Btn small kind="s" onClick={() => setAsk({ level: "campaign", id: c.id, name: c.name, kind: "budget", current: c.daily_budget })}>
                  Change budget
                </Btn>
              )}
              <Toggle level="campaign" row={c} />
            </span>
          </div>
          <Confirm level="campaign" rowId={c.id} />
        </Card>
      )}

      {data && data.ad_sets.length === 0 && <Card><div className="text-sm">This campaign has no ad sets. Create the first one in Ads Manager, then sync.</div></Card>}

      {data?.ad_sets.map((s: AdSetRow) => (
        <Card key={s.id}>
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <div className="min-w-0 flex-[1_1_260px]">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="m-0 break-words text-base font-bold">{s.name}</h2>
                <Pill tone={delivery(s.delivery_status).tone}>{delivery(s.delivery_status).text}</Pill>
              </div>
              <div className="mt-0.5 text-[13px] text-muted">
                Ad set{s.daily_budget ? ` · ${rm(s.daily_budget)} a day` : ""} · {figures(s)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {s.daily_budget != null && (
                <Btn small kind="s" onClick={() => setAsk({ level: "ad_set", id: s.id, name: s.name, kind: "budget", current: s.daily_budget })}>
                  Change budget
                </Btn>
              )}
              <Toggle level="ad_set" row={s} />
              <Btn small onClick={() => setAdding(adding === s.id ? "" : s.id)}>{adding === s.id ? "Close" : "Add ad"}</Btn>
            </div>
          </div>
          <Confirm level="ad_set" rowId={s.id} />

          {adding === s.id && (
            <AddAd
              adSet={s}
              destinationId={c?.destination_id ?? null}
              brief={brief}
              briefId={briefId}
              onDone={async (note) => {
                act(`Created a new ad in ${s.name}`, "Campaigns", note);
                setAdding("");
                await load();
              }}
            />
          )}

          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {s.ads.length === 0 && <li className="py-2 text-sm text-muted">No ads in this ad set.</li>}
            {s.ads.map((a) => (
              <li key={a.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="min-w-0 flex-[1_1_220px]">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <B>{a.name}</B>
                      <Pill tone={delivery(a.delivery_status).tone}>{delivery(a.delivery_status).text}</Pill>
                    </div>
                    <div className="text-[13px] text-muted">{figures(a)}</div>
                  </div>
                  <span className="flex flex-wrap gap-2">
                    <Btn small kind="s" onClick={() => (view?.id === a.id ? setView(null) : void preview(a.id))}>{view?.id === a.id ? "Hide preview" : "Preview"}</Btn>
                    <Toggle level="ad" row={a} />
                  </span>
                </div>
                <Confirm level="ad" rowId={a.id} />
                {view?.id === a.id && (
                  <div className="mt-2 flex flex-col gap-2 rounded-lg bg-ground p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {PREVIEW_FORMATS.map((f) => (
                        <button key={f.key} type="button" onClick={() => void preview(a.id, f.key)} className={`min-h-[36px] rounded-full border px-3 text-[13px] ${view.format === f.key ? "border-brand bg-[#E6F1EE] font-semibold" : "border-line bg-white"}`}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                    {view.note && <div className="text-sm">{view.note}</div>}
                    {view.src && <iframe title={`Preview of ${a.name}`} src={view.src} sandbox="allow-scripts allow-same-origin" className="h-[640px] w-full max-w-[380px] rounded-lg border border-line bg-white" />}
                    <div className="text-[12px] text-muted">Drawn by Meta. A new ad may show as blank for a minute while Meta prepares it.</div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}

/** The form for one new ad. It is created in Meta paused; turning it on is a separate, deliberate step. */
function AddAd({ adSet, destinationId, brief, briefId, onDone }: { adSet: AdSetRow; destinationId: string | null; brief: { hook: string; text: string } | null; briefId: string; onDone: (note: string) => Promise<void> }) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [all, setAll] = useState(false);
  const [mediaId, setMediaId] = useState("");
  const [from, setFrom] = useState("");
  const [tplName, setTplName] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("Reading the settings to copy from Meta…");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [seats, setSeats] = useState<{ departures: number; seats: number; unknown: number; next: string | null } | null>(null);
  const [sure, setSure] = useState(false);

  async function readTemplate(templateAdId?: string) {
    setNote("Reading the settings to copy from Meta…");
    const t = await adCreate({ action: "template", ad_set_id: adSet.id, template_ad_id: templateAdId });
    if (!t.ok) return setNote(t.error ?? "Could not read the settings.");
    setFrom(t.template_ad_id ?? "");
    setTplName(t.template_ad ?? "");
    setTitle((v) => v || t.title || "");
    setText((v) => v || brief?.text || t.message || "");
    setCopied(t.message ?? "");
    setLink(t.link ?? "");
    setNote("");
  }
  useEffect(() => {
    void fetchMedia().then(setMedia);
    void readTemplate();
    if (destinationId) void seatsFor(destinationId).then(setSeats);
  }, [adSet.id]);

  const shown = media.filter((m) => all || !destinationId || m.destination_id === destinationId);
  const chosen = media.find((m) => m.id === mediaId);
  const today = new Date().toLocaleDateString("en-MY", { day: "numeric", month: "numeric", timeZone: "Asia/Kuala_Lumpur" });
  useEffect(() => {
    if (chosen && !name) setName(`${chosen.format ?? "AD"} ${today}`);
  }, [mediaId]);

  // Things worth a second look before the ad goes to Meta. They warn; they do not block.
  const prices = Array.from(new Set(text.match(/RM\s?[\d,]+(?:\.\d+)?/g) ?? []));
  const warnings: string[] = [];
  if (prices.length) warnings.push(`The text quotes ${prices.join(", ")}. Check it against the price in TravelCRM today.`);
  if (/\[HARGA\]|\[[A-Z ]{3,}\]/.test(text)) warnings.push("The text still has a placeholder in square brackets. Fill it in.");
  if (!brief?.text && copied && text.trim() === copied.trim()) warnings.push("The text is exactly the same as the ad it was copied from. If only the picture or video is new, that is fine.");
  if (seats && seats.departures > 0 && seats.unknown === 0 && seats.seats <= 5) warnings.push(`Only ${seats.seats} seat${seats.seats === 1 ? "" : "s"} left across the ${seats.departures} coming departure${seats.departures === 1 ? "" : "s"} we know of for this destination. A new ad may sell seats that are not there.`);
  if (!destinationId) warnings.push("This campaign has no destination, so its spend is not counted anywhere. Set it on the Campaigns page.");
  if (name.trim() && !/^(MP4|PNG|JPG|VID|IMG)\b/i.test(name.trim())) warnings.push("Ad names usually start with MP4 or PNG (for example “MP4 H3”), so Luqman and Anis can compare formats.");
  if (text.length > 0 && text.length < 80) warnings.push("The text is very short for an MTB ad.");
  useEffect(() => setSure(false), [text, name, mediaId]);

  async function create() {
    setBusy(true);
    setNote(chosen?.format === "MP4" ? "Sending the video to Meta. This can take a minute or two…" : "Creating the ad in Meta…");
    const r = await adCreate({ action: "create", ad_set_id: adSet.id, template_ad_id: from, media_id: mediaId, name, title, message: text, link, proposal_id: briefId || undefined });
    setBusy(false);
    if (!r.ok) return setNote(r.error ?? "Could not create the ad.");
    await onDone(r.note ?? "Created, paused.");
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-brand bg-[#F1F8F5] p-4">
      <div className="text-base font-bold">New ad in “{adSet.name}”</div>
      <div className="text-[13px] text-muted">
        The page, Instagram account, link and button are copied from {tplName ? <B>{tplName}</B> : "an ad already in this campaign"}. The ad is created paused: nothing spends until you
        turn it on.
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-semibold">1. Choose the picture or video</span>
          <span className="flex flex-wrap items-center gap-3 text-[13px]">
            {destinationId && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all destinations
              </label>
            )}
            <Link to="/media">Upload in Media</Link>
          </span>
        </div>
        {shown.length === 0 ? (
          <div className="rounded-lg bg-white px-3 py-3 text-sm">No media for this destination yet. Upload it in Media, or tick Show all destinations.</div>
        ) : (
          <div className="grid max-h-[340px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
            {shown.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mediaId === m.id}
                onClick={() => setMediaId(m.id)}
                className={`flex flex-col overflow-hidden rounded-lg border-2 bg-white p-0 text-left ${mediaId === m.id ? "border-brand" : "border-line"}`}
              >
                <span className="flex aspect-square items-center justify-center overflow-hidden bg-[#ECEFEC]">
                  {m.url && m.format !== "MP4" ? <img src={m.url} alt="" className="h-full w-full object-cover" /> : m.url ? <video src={m.url} muted preload="metadata" className="h-full w-full object-cover" /> : <span className="text-xs text-muted">{m.format}</span>}
                </span>
                <span className="truncate px-1.5 py-1 text-[11px]">{m.format} · {m.file_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1.5 text-[13px] font-semibold" htmlFor={`n-${adSet.id}`}>
        2. Ad name
        <input id={`n-${adSet.id}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MP4 H3" className={`${INPUT} font-normal`} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold" htmlFor={`h-${adSet.id}`}>
        3. Headline
        <input id={`h-${adSet.id}`} value={title} onChange={(e) => setTitle(e.target.value)} className={`${INPUT} font-normal`} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold" htmlFor={`t-${adSet.id}`}>
        4. Ad text {brief?.text ? "(from Anis's brief: check the price and dates)" : "(copied from the ad above: change what is new)"}
        <textarea id={`t-${adSet.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={10} className={`${INPUT} py-2.5 font-normal leading-relaxed`} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold" htmlFor={`l-${adSet.id}`}>
        5. Link the button opens
        <input id={`l-${adSet.id}`} value={link} onChange={(e) => setLink(e.target.value)} inputMode="url" className={`${INPUT} font-normal`} />
      </label>

      {warnings.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-[#FBEFD5] px-3 py-3 text-sm">
          <B>Check before you create</B>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <label className="mt-1 flex items-start gap-2 font-semibold">
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-1" /> I have checked these.
          </label>
        </div>
      )}
      {note && <div className="rounded-lg bg-white px-3 py-2.5 text-sm">{note}</div>}
      <div className="flex flex-wrap gap-2">
        <Btn disabled={busy || !mediaId || !name.trim() || !text.trim() || !from || (warnings.length > 0 && !sure)} onClick={() => void create()}>
          {busy ? "Working…" : "Create in Meta, paused"}
        </Btn>
      </div>
    </div>
  );
}
