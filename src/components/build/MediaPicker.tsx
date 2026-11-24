import { useEffect, useState } from "react";
import { Btn } from "../ui";
import { useAuth } from "../../lib/auth";
import { type MediaItem, type MetaImage, fetchMedia, metaImages, uploadMedia } from "../../lib/live";

export type Picked =
  | { from: "library"; media: MediaItem; video: boolean }
  | { from: "meta"; image: MetaImage };

const isVideo = (m: MediaItem) => m.format === "MP4" || /\.(mp4|mov)$/i.test(m.file_name);

/** A pop-up to choose the picture or video for one ad: upload a new one, pick from Media, or reuse a picture from a past ad in Meta. */
export function MediaPicker({ destId, initial, onPick, onClose }: { destId: string; initial: MediaItem[]; onPick: (p: Picked) => void; onClose: () => void }) {
  const { user } = useAuth();
  const [media, setMedia] = useState<MediaItem[]>(initial);
  const [all, setAll] = useState(false);
  const mine = media.filter((m) => all || !destId || m.destination_id === destId);
  const [tab, setTab] = useState<"upload" | "library" | "meta">(mine.length ? "library" : "meta");
  const [meta, setMeta] = useState<MetaImage[] | null>(null);
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function loadMeta(after = "") {
    setBusy("Loading pictures from Meta…");
    setErr("");
    const r = await metaImages(after);
    setBusy("");
    if (!r.ok) return setErr(r.error ?? "Could not load the pictures from Meta.");
    setMeta((old) => [...(after ? old ?? [] : []), ...(r.images ?? [])]);
    setNext(r.next ?? "");
  }
  useEffect(() => {
    if (tab === "meta" && meta === null && !busy) void loadMeta();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(`Uploading ${file.name}…`);
    setErr("");
    const e = await uploadMedia(file, { destination_id: destId || null, placement: "Feed", talent: "", note: "Uploaded from Run campaign" }, user?.email ?? "");
    if (e) {
      setBusy("");
      return setErr(e);
    }
    const fresh = await fetchMedia();
    setMedia(fresh);
    setBusy("");
    const made = fresh.find((m) => m.file_name === file.name);
    if (made) onPick({ from: "library", media: made, video: isVideo(made) });
    else setTab("library");
  }

  const tabs: { v: typeof tab; t: string }[] = [
    { v: "upload", t: "Upload new" },
    { v: "library", t: `Media library (${mine.length})` },
    { v: "meta", t: "From past ads" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Choose a picture or video" className="flex max-h-[92vh] w-full max-w-[860px] flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="text-base font-bold">Choose a picture or video</div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-muted hover:bg-ground">×</button>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2">
          {tabs.map((t) => (
            <button key={t.v} type="button" onClick={() => setTab(t.v)} className={`min-h-[40px] whitespace-nowrap rounded-t-lg px-3 text-sm font-semibold ${tab === t.v ? "border-b-2 border-brand text-brand" : "text-muted"}`}>
              {t.t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {busy && <div className="mb-3 rounded-lg bg-ground px-3 py-2 text-sm">{busy}</div>}
          {err && <div role="alert" className="mb-3 rounded-lg bg-[#FBE6E3] px-3 py-2 text-sm font-semibold text-[#A3231B]">{err}</div>}

          {tab === "upload" && (
            <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#9AA39E] bg-ground px-4 py-6 text-center">
              <span className="text-[15px] font-bold">Tap to choose a file</span>
              <span className="text-[13px] text-muted">A picture (JPG, PNG) or a video (MP4). It is saved in Media{destId ? " for this destination" : ""} and used for this ad.</span>
              <input type="file" accept="image/*,video/mp4,video/quicktime" className="sr-only" disabled={busy !== ""} onChange={(e) => void upload(e.target.files)} />
            </label>
          )}

          {tab === "library" && (
            <>
              {destId && (
                <label className="mb-3 flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4" /> Show all destinations
                </label>
              )}
              {mine.length === 0 ? (
                <div className="flex flex-col items-start gap-2 rounded-lg bg-ground px-3 py-4 text-sm">
                  Nothing in Media{destId && !all ? " for this destination" : ""} yet.
                  <div className="flex flex-wrap gap-2">
                    <Btn small onClick={() => setTab("upload")}>Upload new</Btn>
                    <Btn small kind="s" onClick={() => setTab("meta")}>Use a picture from a past ad</Btn>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {mine.map((m) => (
                    <button key={m.id} type="button" onClick={() => onPick({ from: "library", media: m, video: isVideo(m) })} className="flex flex-col overflow-hidden rounded-lg border-2 border-line bg-white p-0 text-left hover:border-brand">
                      {isVideo(m) ? <video src={m.url} muted preload="metadata" className="aspect-square w-full bg-black object-cover" /> : <img src={m.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />}
                      <span className="truncate px-1.5 py-1 text-[11px]">{m.file_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "meta" && (
            <>
              <p className="m-0 mb-3 text-[13px] text-muted">Pictures already used in MTB's ad account, newest first. Nothing is uploaded again.</p>
              {meta && meta.length === 0 && !busy && <div className="text-sm text-muted">No pictures found in the ad account.</div>}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {(meta ?? []).map((m) => (
                  <button key={m.hash} type="button" onClick={() => onPick({ from: "meta", image: m })} className="flex flex-col overflow-hidden rounded-lg border-2 border-line bg-white p-0 text-left hover:border-brand">
                    <img src={m.thumb} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                    <span className="truncate px-1.5 py-1 text-[11px]">{m.name || "picture"}</span>
                  </button>
                ))}
              </div>
              {next && <Btn small kind="s" className="mt-3" disabled={busy !== ""} onClick={() => void loadMeta(next)}>Show more</Btn>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
