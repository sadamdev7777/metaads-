import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, B, Btn, Card, PageHead, Pill } from "../components/ui";
import { useAuth } from "../lib/auth";
import { type Destination, type Draft, type MediaItem, cpl, fetchDestinations, fetchDrafts, fetchMedia, mira, rm, saveDraft, useCampaigns, when } from "../lib/live";
import { useStore } from "../lib/store";

const INPUT = "min-h-[40px] sm:min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";
const today = () => {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

export default function CampaignNew() {
  const { user } = useAuth();
  const { act } = useStore();
  const camps = useCampaigns(30);
  const [dests, setDests] = useState<Destination[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [copy, setCopy] = useState({ source: "", name: "", budget: "" });
  const [ask, setAsk] = useState({ dest: "", notes: "" });
  const load = () => fetchDrafts().then(setDrafts);
  useEffect(() => {
    void load();
    void fetchDestinations().then(setDests);
    void fetchMedia().then(setMedia);
  }, []);

  const sources = useMemo(() => camps.data.filter((c) => c.delivery_status === "ACTIVE" || c.spend > 0), [camps.data]);
  const campName = (id: string | null) => camps.data.find((c) => c.id === id)?.name ?? "not chosen";
  const mine = (user?.email ?? "").split("@")[0];

  function pickSource(id: string) {
    const c = camps.data.find((x) => x.id === id);
    setCopy({ source: id, name: c ? `${c.destination ?? c.name.replace(/\s+\d{1,2}\/\d{1,2}.*$/, "")} ${today()} - ${mine}` : "", budget: c?.daily_budget ? String(c.daily_budget) : "" });
  }
  // Quick start: name a destination and the system picks its best campaign to copy.
  function pickDestination(destId: string) {
    const pool = sources.filter((c) => c.destination_id === destId);
    const judged = pool.filter((c) => c.leads >= 5).sort((x, y) => x.spend / x.leads - y.spend / y.leads);
    const best = judged[0] ?? [...pool].sort((x, y) => y.spend - x.spend)[0];
    if (best) pickSource(best.id);
    else act("No campaign to copy for that destination", "New campaign", "That destination has no campaign with spend in the last 30 days. Choose a campaign to copy yourself.");
  }
  async function addCopy() {
    const c = camps.data.find((x) => x.id === copy.source);
    if (!c || !copy.name.trim()) return;
    setBusy("Saving…");
    const err = await saveDraft({ name: copy.name.trim(), source_campaign_id: c.id, destination_id: c.destination_id, daily_budget: copy.budget ? Number(copy.budget) : null }, user?.email ?? "");
    setBusy("");
    act(`Drafted campaign “${copy.name.trim()}” as a copy of “${c.name}”${err ? " (failed)" : ""}`, "New campaign", err ?? "Draft saved below. Nothing is in Meta yet.");
    if (!err) setCopy({ source: "", name: "", budget: "" });
    await load();
  }
  async function askMira() {
    setBusy("Mira is drafting. This takes about a minute…");
    const r = await mira({ action: "draft", destination_id: ask.dest, notes: ask.notes });
    setBusy("");
    act(r.ok ? "Mira drafted a campaign" : "Mira could not draft a campaign", "New campaign", r.ok ? "Draft ready below. Nothing is in Meta yet." : r.error ?? "Failed.");
    if (r.ok) setAsk({ dest: "", notes: "" });
    await load();
  }
  async function launch(d: Draft) {
    setBusy("Creating in Meta. This can take a minute…");
    const r = await mira({ action: "launch", draft_id: d.id });
    setBusy("");
    setConfirm(null);
    act(r.ok ? `Created “${d.name}” in Meta, paused` : `Creating “${d.name}” in Meta failed`, "New campaign", r.ok ? r.note ?? "Created paused in Meta." : r.error ?? "Failed.");
    await Promise.all([load(), camps.reload()]);
  }
  async function discard(d: Draft) {
    const err = await saveDraft({ ...d, status: "discarded" }, user?.email ?? "");
    act(`Discarded draft “${d.name}”`, "New campaign", err ?? "Discarded.");
    await load();
  }
  const copyText = (t: string) => void navigator.clipboard?.writeText(t).then(() => act("Copied ad text from a draft", "New campaign", "Copied."));

  return (
    <>
      <PageHead title="Duplicate a campaign" sub="Copies a whole campaign as it is, with every ad set and ad, under a new name. It is created paused. To choose the settings and ads yourself, use Run campaign." right={<Link to="/campaigns/new" className="flex min-h-[36px] sm:min-h-[44px] items-center rounded-lg border border-[#9AA39E] bg-white px-4 text-sm font-semibold text-ink no-underline">Run campaign</Link>} />

      {busy && <div role="status" className="rounded-xl bg-[#FBEFD5] px-5 py-3 text-sm font-semibold">{busy}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Copy a campaign">
          <div className="text-sm">Pick one that worked. The system copies its ad sets, targeting and ads under a new name.</div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cq" className="text-[13px] font-semibold">Quick start: destination</label>
            <select id="cq" value="" onChange={(e) => e.target.value && pickDestination(e.target.value)} className={INPUT}>
              <option value="">Choose a destination…</option>
              {dests.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <div className="text-xs text-muted">Picks that destination's campaign with the cheapest leads and fills in the name and budget for you.</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cs" className="text-[13px] font-semibold">Campaign to copy</label>
            <select id="cs" value={copy.source} onChange={(e) => pickSource(e.target.value)} className={INPUT}>
              <option value="">Choose…</option>
              {sources.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {rm(c.spend)}{c.leads ? ` · CPL ${cpl(c.spend, c.leads)}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cn" className="text-[13px] font-semibold">New campaign name</label>
            <input id="cn" value={copy.name} onChange={(e) => setCopy({ ...copy, name: e.target.value })} placeholder="Korea - Winter 1/12 - Haniss" className={INPUT} />
            <div className="text-xs text-muted">Country - Destination date - Staff, so it is matched to a destination by itself.</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cb" className="text-[13px] font-semibold">Daily budget, RM (optional)</label>
            <input id="cb" inputMode="decimal" value={copy.budget} onChange={(e) => setCopy({ ...copy, budget: e.target.value.replace(/[^0-9.]/g, "") })} className={`${INPUT} max-w-[160px]`} />
            <div className="text-xs text-muted">Applied only when the campaign has one shared budget. Otherwise ad set budgets are copied as they are.</div>
          </div>
          <div>
            <Btn disabled={Boolean(busy) || !copy.source || !copy.name.trim()} onClick={() => void addCopy()}>
              Save as draft
            </Btn>
          </div>
        </Card>

        <Card title="Ask Mira to draft" right={<Avatar who="plan" state={busy.startsWith("Mira") ? "work" : "idle"} size={40} />}>
          <div className="text-sm">Mira reads the results for a destination and Luqman's notebook, chooses the best campaign to copy, and writes new ad text in Malay.</div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ad" className="text-[13px] font-semibold">Destination</label>
            <select id="ad" value={ask.dest} onChange={(e) => setAsk({ ...ask, dest: e.target.value })} className={INPUT}>
              <option value="">Choose…</option>
              {dests.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="an" className="text-[13px] font-semibold">Anything she should know (optional)</label>
            <textarea id="an" rows={3} value={ask.notes} onChange={(e) => setAsk({ ...ask, notes: e.target.value })} placeholder="e.g. Push the 5 Dec departure, price RM4,290, school holiday angle" className={`${INPUT} py-2`} />
            <div className="text-xs text-muted">She uses only facts she is given. Put the price here if you want it in the ad: she will not make one up.</div>
          </div>
          <div>
            <Btn disabled={Boolean(busy) || !ask.dest} onClick={() => void askMira()}>
              Ask Mira
            </Btn>
          </div>
        </Card>
      </div>

      <h2 className="m-0 text-lg font-bold">Drafts</h2>
      {drafts.length === 0 && <div className="text-sm text-muted">No drafts yet.</div>}
      <div className="flex flex-col gap-4">
        {drafts.map((d) => {
          const picked = media.filter((m) => d.media_ids?.includes(m.id));
          return (
            <Card key={d.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-base font-bold">{d.name}</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill>{d.made_by === "mira" ? "Drafted by Mira" : "Copy"}</Pill>
                  <Pill tone={d.status === "created" ? "g" : d.status === "failed" ? "r" : "a"}>{d.status === "created" ? "Created in Meta, paused" : d.status === "failed" ? "Failed" : "Draft"}</Pill>
                </div>
              </div>
              <div className="text-[13px] text-muted">
                Copies <B>{campName(d.source_campaign_id)}</B>
                {d.daily_budget ? `, daily budget RM${d.daily_budget}` : ""}. {d.created_by_email}, {when(d.created_at)}
              </div>
              {d.reasoning && <div className="rounded-lg bg-ground px-3 py-2.5 text-sm">{d.reasoning}</div>}
              {(d.audience || d.placements || d.objective) && (
                <div className="text-sm">
                  {d.objective && (<><B>Objective:</B> {d.objective}. </>)}
                  {d.audience && (<><B>Audience:</B> {d.audience} </>)}
                  {d.placements && (<><B>Placements:</B> {d.placements}</>)}
                </div>
              )}
              {d.primary_texts?.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="text-[13px] font-semibold text-muted">Ad text (copy into Ads Manager)</div>
                  {d.primary_texts.map((t, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2.5">
                      <div className="min-w-0 flex-1 whitespace-pre-wrap text-sm">{t}</div>
                      <Btn small kind="s" onClick={() => copyText(t)}>Copy</Btn>
                    </div>
                  ))}
                  {d.headlines?.length > 0 && (
                    <div className="text-sm">
                      <B>Headlines:</B> {d.headlines.join(" · ")}
                    </div>
                  )}
                </div>
              )}
              {picked.length > 0 && (
                <div className="text-sm">
                  <B>Media to use:</B> {picked.map((m) => m.file_name).join(", ")}. <Link to="/media" className="font-semibold">Open Media</Link>
                </div>
              )}
              {d.result_note && <div className={`rounded-lg px-3 py-2 text-[13px] ${d.status === "failed" ? "bg-[#FBE6E3] text-[#A3231B]" : "bg-[#E3F2E9] text-[#17663F]"}`}>{d.result_note}</div>}

              {(d.status === "draft" || d.status === "failed") &&
                (confirm === d.id ? (
                  <div className="flex flex-col gap-2 rounded-lg bg-[#FBEFD5] px-3 py-3">
                    <div className="text-sm font-bold text-[#5C3900]">Create “{d.name}” in Meta now?</div>
                    <div className="text-[13px]">
                      It will be a copy of “{campName(d.source_campaign_id)}”, with every ad set and ad <B>paused</B>. Nothing spends until someone turns
                      it on in Ads Manager. The copied ads keep the old text and creative: change them there before turning it on.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Btn disabled={Boolean(busy)} onClick={() => void launch(d)}>Yes, create it paused</Btn>
                      <Btn kind="s" disabled={Boolean(busy)} onClick={() => setConfirm(null)}>Cancel</Btn>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Btn disabled={Boolean(busy) || !d.source_campaign_id} onClick={() => setConfirm(d.id)}>Create in Meta, paused…</Btn>
                    <Btn kind="s" disabled={Boolean(busy)} onClick={() => void discard(d)}>Discard</Btn>
                  </div>
                ))}
              {d.model && <div className="text-xs text-muted">Written by an AI model ({d.model}). Check every fact and price before it goes live.</div>}
            </Card>
          );
        })}
      </div>
    </>
  );
}
