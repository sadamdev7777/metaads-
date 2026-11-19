import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, Btn, Card, Field, PageHead, Pill, SampleTag } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useStore } from "../lib/store";

const COPY_FROM = [
  { id: "m1", name: "Korea Spring 3/10 - AI", sub: "RM47.06 per pax, 204 pax. Broad PNG, RM200 a day", best: true },
  { id: "m2", name: "Korea Winter 5/10 - Staff A", sub: "RM84.85 per pax, 198 pax. Broad PNG and MP4, RM850 a day", best: false },
  { id: "m3", name: "KK Kundasang 23/9 - Staff B", sub: "RM45.00 per pax, 160 pax. Different country", best: false },
];
const ANGLES = [
  { id: "c1", name: "Harga termasuk flight", sub: "Tekankan harga pakej yang sudah termasuk tiket penerbangan." },
  { id: "c2", name: "Musim luruh di Korea", sub: "Tekankan pemandangan musim luruh dan tarikh terhad." },
  { id: "c3", name: "Urusan trip mudah", sub: "Tekankan semua diuruskan dari mula hingga pulang." },
];
const MEDIA = [
  { name: "korea-autumn-01.png", tag: "PNG 4:5", on: true },
  { name: "korea-autumn-reel.mp4", tag: "MP4 9:16", on: true },
  { name: "korea-spring-harga-flight.png", tag: "PNG 4:5", on: false },
  { name: "korea-winter-h1.mp4", tag: "MP4 9:16", on: false },
];

export default function CampaignNew() {
  const { user } = useAuth();
  const { act } = useStore();
  const nav = useNavigate();
  const [mode, setMode] = useState<"manual" | "ai">("ai");
  const [copy, setCopy] = useState("m1");
  const [angles, setAngles] = useState<string[]>(["c1", "c2", "c3"]);
  const [media, setMedia] = useState<string[]>(MEDIA.filter((m) => m.on).map((m) => m.name));

  const runBy = mode === "ai" ? "AI" : user?.name ?? "";
  const name = `Korea Autumn 20/11 - ${runBy}`;
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const box = (on: boolean) => `rounded-lg p-3 ${on ? "border-2 border-brand" : "border border-line"}`;

  return (
    <>
      <PageHead title="New campaign" sub="Step 3. Choose how to run it: copy a previous campaign, or let AI draft it." right={<SampleTag />} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] text-muted">Product</div>
            <div className="text-xl font-bold">Korea Autumn</div>
            <div className="text-[13px] text-muted">
              Korea. 3 dates, 120 seats, 44 open. Deposit RM500 per pax. Landing page <span className="font-mono">/korea-autumn</span>
            </div>
          </div>
          <Link to="/products" className="flex min-h-[44px] items-center rounded-lg border border-[#9AA39E] px-4 text-sm font-semibold text-ink no-underline">
            Change product
          </Link>
        </div>
      </Card>

      <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
        <legend className="mb-2 text-[13px] font-semibold">How to run it</legend>
        {(["manual", "ai"] as const).map((m) => (
          <label key={m} className={`flex min-h-[44px] cursor-pointer items-center gap-2 px-4 text-sm font-semibold ${box(mode === m)}`}>
            <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} className="h-[18px] w-[18px]" />
            {m === "manual" ? "Manual: copy a previous campaign" : "AI: draft by Campaign Planner"}
          </label>
        ))}
      </fieldset>

      {mode === "manual" ? (
        <Card title="Manual: copy a previous campaign" sub="Pick a campaign to copy. Its objective, audience and ad set setup are reused. You set the budget.">
          {COPY_FROM.map((c) => (
            <label key={c.id} className={`flex cursor-pointer items-start gap-3 ${box(copy === c.id)}`}>
              <input type="radio" name="copy" checked={copy === c.id} onChange={() => setCopy(c.id)} className="mt-0.5 h-[18px] w-[18px]" />
              <span className="flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{c.name}</span>
                  {c.best && <Pill tone="g">Recommended</Pill>}
                </span>
                <span className="block text-[13px] text-muted">{c.sub}</span>
              </span>
            </label>
          ))}
          <div className="flex flex-wrap gap-3">
            <Field id="mb" label="Budget a day" placeholder="RM" note="You decide" />
            <Field id="mr" label="Run by" value={user?.name} note="Taken from your sign-in" />
          </div>
        </Card>
      ) : (
        <Card
          title={
            <span className="flex items-center gap-2.5">
              <Avatar who="plan" state="work" size={36} />
              AI: draft by Campaign Planner
            </span>
          }
          sub="Every suggestion can be edited before it is sent for approval."
        >
          <div className="flex flex-wrap gap-3">
            <Field id="ao" label="Objective" value="Leads" note="Same as your past campaigns" />
            <Field id="ab" label="Budget a day" value="RM100" note="RM2,200 in total over 22 days" />
          </div>
          <div className="rounded-lg bg-ground px-3 py-2.5 text-[13px]">
            <span className="font-bold">Why this budget:</span> 44 open seats × RM50 target per pax = RM2,200.
          </div>
          <Field id="aa" label="Audience" value="Broad, Malaysia" note="Copied from Korea Spring 3/10, the best Korea campaign" />
          <div className="text-[13px] font-semibold">Copywriting, one ad per angle</div>
          {ANGLES.map((a) => (
            <label key={a.id} className={`flex cursor-pointer items-start gap-3 ${box(angles.includes(a.id))}`}>
              <input type="checkbox" checked={angles.includes(a.id)} onChange={() => toggle(angles, setAngles, a.id)} className="mt-0.5 h-[18px] w-[18px]" />
              <span className="flex-1">
                <span className="block text-sm font-bold">{a.name}</span>
                <span className="block text-[13px] text-muted">{a.sub}</span>
              </span>
            </label>
          ))}
        </Card>
      )}

      <Card title="Media for Korea" right={<Link to="/media" className="text-[13px] font-semibold">Open Media</Link>} sub={`Loaded from Media by country tag. ${media.length} of 5 Korea files selected.`}>
        <div className="flex flex-wrap gap-3">
          {MEDIA.map((m) => (
            <label key={m.name} className={`flex min-w-[150px] flex-1 cursor-pointer flex-col gap-1.5 ${box(media.includes(m.name))}`}>
              <span className="flex min-h-[24px] items-center gap-2">
                <input type="checkbox" checked={media.includes(m.name)} onChange={() => toggle(media, setMedia, m.name)} className="h-[18px] w-[18px]" />
                <span className="break-all text-[13px] font-semibold">{m.name}</span>
              </span>
              <span aria-hidden="true" className="flex h-24 items-center justify-center rounded-md bg-[#ECEFEC] text-xs font-bold text-[#3F4A45]">
                {m.tag}
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Field id="nn" label="Campaign name" value={name} key={name} note="Set by the system: product, date, who ran it" />
          <Field id="nu" label="UTM" value={`korea-autumn-2011-${mode === "ai" ? "ai" : "manual"}`} key={mode} note="Set by the system, so leads match this campaign" />
          <div className="flex gap-2 pb-[22px]">
            <Btn kind="s" onClick={() => act(`Saved draft campaign ${name}`, "Campaigns", "Draft saved in the activity log. Sample data.")}>
              Save draft
            </Btn>
            <Btn
              onClick={() => {
                act(`Sent campaign ${name} for approval (${mode === "ai" ? "AI draft" : "manual copy"})`, "Campaigns", "Sent for approval. Sample data, so nothing was sent to Meta.");
                nav("/approvals");
              }}
            >
              Send for approval
            </Btn>
          </div>
        </div>
      </Card>

      <p className="m-0 text-[13px] text-muted">Nothing is published to Meta until it is approved. In this phase nothing is published at all.</p>
    </>
  );
}
