import { useState } from "react";
import { Link } from "react-router-dom";
import { B, Btn, Pill } from "../ui";
import { type AdDraft, CTAS, type SourceAd, type WinAd, blankAd, builder, uid } from "../../lib/build";
import { type MediaItem, cpl, rm } from "../../lib/live";
import { Fld, INPUT, Seg } from "./parts";

type CopyOption = { angle: string; primary_text: string; headline: string; description: string };
type Defaults = { link: string; cta: string; url_tags: string };

export const fromSource = (s: SourceAd, w: WinAd | undefined, d: Defaults): AdDraft => ({
  key: uid(), name: s.ad, mode: "reuse", from: { id: s.id, ad: s.ad, campaign: w?.campaign, cpl: w ? cpl(w.spend, w.leads) : undefined },
  kind: s.kind, creative_id: s.creative_id, image_hash: s.image_hash, video_id: s.video_id, thumb: s.thumb,
  message: s.message ?? "", title: s.title ?? "", description: s.description ?? "", link: s.link || d.link, cta: s.cta || d.cta, url_tags: s.url_tags ?? d.url_tags,
});

/** The ads of the new ad set: copy the best ones, or make new ones with your own words or Mira's. */
export function AdsForm({ ads, set, winners, media, destId, defaults, creativeOk, onNote }: {
  ads: AdDraft[]; set: (ads: AdDraft[]) => void; winners: WinAd[]; media: MediaItem[]; destId: string; defaults: Defaults; creativeOk: boolean; onNote: (text: string) => void;
}) {
  const [loading, setLoading] = useState("");
  const [more, setMore] = useState(false);
  const patch = (key: string, p: Partial<AdDraft>) => set(ads.map((a) => (a.key === key ? { ...a, ...p } : a)));

  async function addWinner(w: WinAd) {
    setLoading(w.id);
    const r = await builder<{ ads?: SourceAd[] }>({ action: "source", ad_ids: [w.id] });
    setLoading("");
    const s = r.ads?.[0];
    if (!r.ok || !s) return onNote(r.error ?? "Could not read that ad from Meta.");
    if (!s.copyable && !s.creative_id) return onNote(s.error ?? "That ad uses a format that cannot be copied here.");
    set([...ads, fromSource(s, w, defaults)]);
  }
  const used = new Set(ads.map((a) => a.from?.id));
  const offer = winners.filter((w) => !used.has(w.id)).slice(0, more ? 20 : 5);

  return (
    <>
      {!creativeOk && <div className="rounded-lg bg-[#FBE6E3] px-3 py-2.5 text-[13px] text-[#7A1A14]">You can prepare the ads now. Meta will refuse to create them until the Page access is fixed (see the note at the top).</div>}

      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-semibold">Add one of the best ads {destId ? "for this destination" : "in the account"} (last 30 days, cheapest leads first)</div>
        {offer.length === 0 && <div className="text-[13px] text-muted">No more ads with leads to offer here.</div>}
        <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-lg border border-line p-0">
          {offer.map((w) => (
            <li key={w.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 text-sm font-bold">
                  {w.ad} {w.proven && <Pill tone="g">Proven</Pill>}
                </span>
                <span className="block break-words text-[12px] text-muted">
                  {w.campaign} · <B>{cpl(w.spend, w.leads)}</B> a lead · {w.leads} leads · {rm(w.spend)}
                </span>
              </span>
              <Btn small kind="s" disabled={Boolean(loading)} onClick={() => void addWinner(w)}>
                {loading === w.id ? "Reading…" : "Add"}
              </Btn>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {winners.filter((w) => !used.has(w.id)).length > 5 && (
            <Btn small kind="s" onClick={() => setMore(!more)}>
              {more ? "Show fewer" : "Show more"}
            </Btn>
          )}
          <Btn small kind="s" onClick={() => set([...ads, blankAd(ads.length + 1, defaults.link, defaults.cta, defaults.url_tags)])}>
            + New ad from the Media library
          </Btn>
        </div>
      </div>

      {ads.map((ad, i) => (
        <AdCard key={ad.key} ad={ad} n={i + 1} media={media} destId={destId} winners={winners} onNote={onNote} patch={(p) => patch(ad.key, p)}
          remove={() => set(ads.filter((a) => a.key !== ad.key))}
          duplicate={() => set([...ads.slice(0, i + 1), { ...ad, key: uid(), name: `${ad.name} copy`, mode: ad.mode === "reuse" && (ad.image_hash || ad.video_id) ? "same" : ad.mode }, ...ads.slice(i + 1)])} />
      ))}
    </>
  );
}

function AdCard({ ad, n, media, destId, winners, patch, remove, duplicate, onNote }: {
  ad: AdDraft; n: number; media: MediaItem[]; destId: string; winners: WinAd[]; patch: (p: Partial<AdDraft>) => void; remove: () => void; duplicate: () => void; onNote: (t: string) => void;
}) {
  const [all, setAll] = useState(false);
  const [mira, setMira] = useState(false);
  const [notes, setNotes] = useState("");
  const [options, setOptions] = useState<CopyOption[]>([]);
  const [busy, setBusy] = useState("");
  const [full, setFull] = useState(false);
  const canSame = Boolean(ad.image_hash || ad.video_id);
  const modes = [
    ...(ad.creative_id ? [{ v: "reuse" as const, t: "Use the ad as it is", d: "The same picture or video and the same words as the ad that already works. The safest copy." }] : []),
    ...(canSame ? [{ v: "same" as const, t: "Same media, new words", d: "Keeps the picture or video. You change the text, headline, link or button." }] : []),
    { v: "library" as const, t: "Media from the library", d: "A picture or video uploaded in Media, with your own words." },
  ];
  const shown = media.filter((m) => all || !destId || m.destination_id === destId);
  const chosen = media.find((m) => m.id === ad.media_id);
  const edit = ad.mode !== "reuse";

  async function copyWords(id: string) {
    setBusy("Reading the words from Meta…");
    const r = await builder<{ ads?: SourceAd[] }>({ action: "source", ad_ids: [id] });
    setBusy("");
    const s = r.ads?.[0];
    if (!r.ok || !s?.message) return onNote(r.error ?? s?.error ?? "Could not read the words of that ad.");
    patch({ message: s.message, title: s.title ?? "", description: s.description ?? "", link: s.link || ad.link, cta: s.cta || ad.cta });
  }
  async function askMira() {
    setBusy("Mira is writing. About half a minute…");
    const top = winners.slice(0, 3).map((w) => w.id);
    const refs = top.length ? await builder<{ ads?: SourceAd[] }>({ action: "source", ad_ids: top }) : { ok: true, ads: [] as SourceAd[] };
    const r = await builder<{ options?: CopyOption[] }>({ action: "write", destination_id: destId, notes, link: ad.link, references: (refs.ads ?? []).filter((x) => x.message).map((x) => ({ ad: x.ad, title: x.title, message: x.message })) });
    setBusy("");
    if (!r.ok) return onNote(r.error ?? "Mira could not write the text.");
    setOptions(r.options ?? []);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-ground px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-end gap-2">
        <Fld label={`Ad ${n} name`} htmlFor={`an-${ad.key}`} className="min-w-[180px] flex-1">
          <input id={`an-${ad.key}`} value={ad.name} onChange={(e) => patch({ name: e.target.value })} className={INPUT} />
        </Fld>
        <Btn small kind="s" onClick={duplicate}>Duplicate</Btn>
        <Btn small kind="s" onClick={remove}>Remove</Btn>
      </div>
      {ad.from && (
        <div className="text-[12px] text-muted">
          Copied from <B>{ad.from.ad}</B>
          {ad.from.campaign ? ` in ${ad.from.campaign}` : ""}
          {ad.from.cpl ? ` · ${ad.from.cpl} a lead` : ""}
        </div>
      )}
      <Seg label="What this ad uses" value={ad.mode} options={modes} onChange={(v) => patch({ mode: v })} />

      {ad.mode !== "library" ? (
        <div className="flex items-center gap-3">
          {ad.thumb ? <img src={ad.thumb} alt="" className="h-16 w-16 flex-none rounded-lg border border-line object-cover" /> : <div className="h-16 w-16 flex-none rounded-lg bg-white" />}
          <div className="text-[13px]">{ad.kind === "video" ? "Video" : "Picture"} already in the ad account. Nothing to upload.</div>
        </div>
      ) : (
        <Fld label="Picture or video" hint={<>Showing {all || !destId ? "all media" : "media for this destination"}. <Link to="/media">Upload in Media</Link></>}>
          <label className="flex min-h-[36px] items-center gap-2 text-[13px]">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4" /> Show all destinations
          </label>
          {shown.length === 0 ? (
            <div className="rounded-lg bg-white px-3 py-3 text-sm">No media here yet. Upload it in Media, or tick Show all destinations.</div>
          ) : (
            <div className="grid max-h-[300px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
              {shown.map((m) => {
                const on = m.id === ad.media_id;
                const video = m.format === "MP4" || /\.(mp4|mov)$/i.test(m.file_name);
                return (
                  <button key={m.id} type="button" aria-pressed={on} onClick={() => patch({ media_id: m.id, kind: video ? "video" : "image", name: /^Ad \d+$/.test(ad.name) ? `${m.format ?? (video ? "MP4" : "PNG")} ${m.file_name.replace(/\.[a-z0-9]+$/i, "").slice(0, 24)}` : ad.name })} className={`flex flex-col overflow-hidden rounded-lg border-2 bg-white p-0 text-left ${on ? "border-brand" : "border-line"}`}>
                    {video ? <video src={m.url} muted preload="metadata" className="aspect-square w-full bg-black object-cover" /> : <img src={m.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />}
                    <span className="truncate px-1.5 py-1 text-[11px]">{on ? "✓ " : ""}{m.file_name}</span>
                  </button>
                );
              })}
            </div>
          )}
          {chosen && <div className="text-[13px]">Chosen: <B>{chosen.file_name}</B></div>}
        </Fld>
      )}

      {!edit ? (
        <div className="rounded-lg bg-white px-3 py-2.5 text-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted">The words it runs with</div>
          {ad.title && <div className="font-bold">{ad.title}</div>}
          <div className="whitespace-pre-wrap break-words text-[13px]">{full || ad.message.length <= 220 ? ad.message : `${ad.message.slice(0, 220)}…`}</div>
          {ad.message.length > 220 && (
            <button type="button" onClick={() => setFull(!full)} className="border-0 bg-transparent p-0 text-[13px] font-semibold text-brand underline">
              {full ? "Show less" : "Read all"}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Copy the words of a best ad" value="" disabled={Boolean(busy)} onChange={(e) => e.target.value && void copyWords(e.target.value)} className={`${INPUT} max-w-[320px]`}>
              <option value="">Copy the words of a best ad…</option>
              {winners.slice(0, 15).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.ad} · {cpl(w.spend, w.leads)} · {w.campaign}
                </option>
              ))}
            </select>
            <Btn small kind="s" disabled={Boolean(busy)} onClick={() => setMira(!mira)}>
              {mira ? "Close Mira" : "Ask Mira to write"}
            </Btn>
          </div>
          {busy && <div role="status" className="rounded-lg bg-[#FBEFD5] px-3 py-2 text-[13px] font-semibold">{busy}</div>}
          {mira && (
            <div className="flex flex-col gap-2 rounded-lg border border-line bg-white px-3 py-3">
              <Fld label="Tell Mira the facts" htmlFor={`mn-${ad.key}`} hint="She uses only what you give her and the departures in TravelCRM. She will not make up a price: put it here if you want it in the ad.">
                <textarea id={`mn-${ad.key}`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 9H7M Yunnan, from RM4,690 with flight, push the December school holiday dates, 4-star hotels" className={`${INPUT} py-2`} />
              </Fld>
              <div>
                <Btn small disabled={Boolean(busy)} onClick={() => void askMira()}>Write 3 options</Btn>
              </div>
              {options.map((o, k) => (
                <div key={k} className="flex flex-col gap-1 rounded-lg bg-ground px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-[#8A5300]">Option {k + 1}: {o.angle}</span>
                    <Btn small onClick={() => { patch({ message: o.primary_text, title: o.headline, description: o.description || ad.description }); setMira(false); }}>Use this</Btn>
                  </div>
                  <div className="text-sm font-bold">{o.headline}</div>
                  <div className="whitespace-pre-wrap break-words text-[13px]">{o.primary_text}</div>
                </div>
              ))}
              {options.length > 0 && <div className="text-xs text-muted">Written by an AI model. Check every fact, price and date before the ad goes live.</div>}
            </div>
          )}
          <Fld label="Primary text" htmlFor={`am-${ad.key}`} hint={`${ad.message.length} characters. The first two lines matter most: only about 125 characters show before “See more”.`}>
            <textarea id={`am-${ad.key}`} rows={8} value={ad.message} onChange={(e) => patch({ message: e.target.value })} className={`${INPUT} py-2`} />
          </Fld>
          <div className="grid gap-3 sm:grid-cols-2">
            <Fld label="Headline" htmlFor={`at-${ad.key}`} hint={`${ad.title.length} characters. Up to about 40 shows in full.`}>
              <input id={`at-${ad.key}`} value={ad.title} onChange={(e) => patch({ title: e.target.value })} className={INPUT} />
            </Fld>
            <Fld label="Description (optional)" htmlFor={`ad-${ad.key}`} hint="A short line under the headline. Not shown in every placement.">
              <input id={`ad-${ad.key}`} value={ad.description} onChange={(e) => patch({ description: e.target.value })} className={INPUT} />
            </Fld>
            <Fld label="Link" htmlFor={`al-${ad.key}`} hint="Where the button takes people. Must be the page that counts the lead.">
              <input id={`al-${ad.key}`} inputMode="url" value={ad.link} onChange={(e) => patch({ link: e.target.value.trim() })} placeholder="https://muslimtravelbug.com/sale_…" className={INPUT} />
            </Fld>
            <Fld label="Button" htmlFor={`ac-${ad.key}`}>
              <select id={`ac-${ad.key}`} value={ad.cta} onChange={(e) => patch({ cta: e.target.value })} className={INPUT}>
                {CTAS.map((c) => (
                  <option key={c.v} value={c.v}>{c.t}</option>
                ))}
              </select>
            </Fld>
            <Fld label="Tracking added to the link (optional)" htmlFor={`au-${ad.key}`} className="sm:col-span-2" hint="URL parameters, e.g. utm_source=facebook&utm_campaign={{campaign.name}}. Leave as it is unless you know you need it.">
              <input id={`au-${ad.key}`} value={ad.url_tags} onChange={(e) => patch({ url_tags: e.target.value.trim() })} className={INPUT} />
            </Fld>
          </div>
        </>
      )}
    </div>
  );
}
