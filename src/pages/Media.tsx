import { useEffect, useMemo, useRef, useState } from "react";
import { B, Btn, Card, PageHead, Pill } from "../components/ui";
import { useAuth } from "../lib/auth";
import { type Destination, type MediaItem, fetchDestinations, fetchMedia, removeMedia, uploadMedia, when } from "../lib/live";
import { useStore } from "../lib/store";

const INPUT = "min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";
const PLACEMENTS = ["Reels", "Feed", "Story"];
const mb = (n: number | null) => (n ? `${(n / 1048576).toFixed(1)} MB` : "");

export default function MediaPage() {
  const { user } = useAuth();
  const { act } = useStore();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [dests, setDests] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ destination_id: "", placement: "Reels", talent: "", note: "" });
  const [filter, setFilter] = useState("");
  const pick = useRef<HTMLInputElement>(null);
  const load = async () => {
    setItems(await fetchMedia());
    setLoading(false);
  };
  useEffect(() => {
    void load();
    void fetchDestinations().then(setDests);
  }, []);
  const destName = (id: string | null) => dests.find((d) => d.id === id)?.name ?? "No destination";
  const shown = useMemo(() => items.filter((m) => !filter || m.destination_id === filter), [items, filter]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    let ok = 0;
    for (const f of Array.from(files)) {
      setBusy(`Uploading ${f.name}…`);
      const err = await uploadMedia(f, { ...form, destination_id: form.destination_id || null }, user?.email ?? "");
      if (err) act(`Upload of ${f.name} failed`, "Media", err);
      else ok += 1;
    }
    setBusy("");
    if (pick.current) pick.current.value = "";
    if (ok) act(`Uploaded ${ok} media file${ok === 1 ? "" : "s"} for ${destName(form.destination_id || null)}`, "Media", `${ok} file${ok === 1 ? "" : "s"} uploaded.`);
    await load();
  }
  async function remove(m: MediaItem) {
    const err = await removeMedia(m);
    act(`Removed media ${m.file_name}${err ? " (failed)" : ""}`, "Media", err ?? "Removed.");
    await load();
  }

  return (
    <>
      <PageHead title="Media" sub="Step 2. Reels, Feed and Story creatives, kept by destination so Mira and the team can find them when planning a campaign." />

      <Card title="Add media">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <label htmlFor="md" className="text-[13px] font-semibold">Destination</label>
            <select id="md" value={form.destination_id} onChange={(e) => setForm({ ...form, destination_id: e.target.value })} className={INPUT}>
              <option value="">No destination</option>
              {dests.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="flex min-w-[140px] flex-col gap-1.5">
            <label htmlFor="mp" className="text-[13px] font-semibold">For</label>
            <select id="mp" value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value })} className={INPUT}>
              {PLACEMENTS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
            <label htmlFor="mt" className="text-[13px] font-semibold">Talent (optional)</label>
            <input id="mt" value={form.talent} onChange={(e) => setForm({ ...form, talent: e.target.value })} placeholder="Who appears in it" className={INPUT} />
          </div>
          <div className="flex min-w-[220px] flex-[2] flex-col gap-1.5">
            <label htmlFor="mn" className="text-[13px] font-semibold">Note (optional)</label>
            <input id="mn" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Hook, angle or version, e.g. H1 snow scene" className={INPUT} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={pick} id="mf" type="file" multiple accept="image/*,video/*" className="sr-only" onChange={(e) => void upload(e.target.files)} />
          <Btn disabled={Boolean(busy)} onClick={() => pick.current?.click()}>
            {busy || "Choose files to upload"}
          </Btn>
          <span className="text-[13px] text-muted">Images and videos, up to 50 MB each. The tags above are applied to every file you choose.</span>
        </div>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="text-sm text-muted">{loading ? "Loading…" : `${shown.length} file${shown.length === 1 ? "" : "s"}`}</div>
        <select aria-label="Filter by destination" value={filter} onChange={(e) => setFilter(e.target.value)} className={`${INPUT} max-w-[280px]`}>
          <option value="">All destinations</option>
          {dests.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {!loading && shown.length === 0 && (
        <Card title="Nothing here yet">
          <div className="text-sm">Upload the creatives for a destination. Mira picks from this library when she drafts a campaign.</div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((m) => (
          <Card key={m.id} className="!p-3">
            <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-lg bg-[#ECEFEC]">
              {m.url ? (
                m.format === "MP4" ? (
                  <video src={m.url} controls preload="metadata" className="h-full w-full object-contain" />
                ) : (
                  <img src={m.url} alt={m.note || m.file_name} loading="lazy" className="h-full w-full object-contain" />
                )
              ) : (
                <span className="text-[13px] text-muted">No preview</span>
              )}
            </div>
            <div className="break-all text-sm font-semibold">{m.file_name}</div>
            <div className="flex flex-wrap gap-1.5">
              <Pill tone={m.destination_id ? "t" : "a"}>{destName(m.destination_id)}</Pill>
              {m.placement && <Pill>{m.placement}</Pill>}
              <Pill>{m.format === "MP4" ? "Video" : "Image"}</Pill>
            </div>
            {(m.talent || m.note) && (
              <div className="text-[13px]">
                {m.talent && <B>{m.talent}</B>} {m.note}
              </div>
            )}
            <div className="text-xs text-muted">
              {mb(m.size_bytes)} · {m.uploaded_by_email ?? ""} · {when(m.created_at)}
            </div>
            <div className="mt-auto flex gap-2">
              {m.url && (
                <a href={m.url} target="_blank" rel="noreferrer" className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-[#9AA39E] text-[13px] font-semibold text-ink no-underline">
                  Open
                </a>
              )}
              <Btn small kind="s" onClick={() => void remove(m)}>
                Remove
              </Btn>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
