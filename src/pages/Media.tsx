import { useState } from "react";
import { Btn, PageHead, Pill, SampleTag, Sel, Stat } from "../components/ui";
import { MEDIA } from "../lib/data";
import { useStore } from "../lib/store";

const BOX = { "9:16": { w: 118, h: 210 }, "4:5": { w: 136, h: 170 }, "1:1": { w: 150, h: 150 } } as const;

export default function MediaPage() {
  const { act } = useStore();
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const needsTag = MEDIA.filter((m) => !m.country && !confirmed.includes(m.name)).length;

  return (
    <>
      <PageHead
        title="Media"
        sub="Step 2. Reels, Feed and Story creatives, tagged by country and ready to load into a campaign."
        right={
          <div className="flex items-center gap-3">
            <SampleTag />
            <Btn onClick={() => act("Pressed Upload media", "Media", "Upload arrives with Phase 3. Showing sample media.")}>Upload media</Btn>
          </div>
        }
      />

      <div className="flex flex-wrap gap-4">
        <Stat label="Media files" value="8" sub="5 Feed, 3 Reels" />
        <Stat label="Not used yet" value="3" sub="ready for a campaign" />
        <Stat label="Needs country tag" value={String(needsTag)} sub="cannot be used until tagged" />
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-white p-4">
        <Sel id="mc" label="Country" options={["All countries", "Korea", "Malaysia", "Japan", "Turkiye", "Vietnam", "Indonesia", "Needs tag"]} />
        <Sel id="mp" label="Placement" options={["All placements", "Reels", "Feed", "Story"]} />
        <Sel id="mf" label="Format" options={["PNG and MP4", "PNG only", "MP4 only"]} />
        <Sel id="mt" label="Talent in video" options={["All talent", "Talent A", "Talent B"]} />
        <Sel id="mu" label="Usage" options={["Used and unused", "Not used yet", "Used"]} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MEDIA.map((m) => {
          const country = m.country ?? (confirmed.includes(m.name) ? m.suggest ?? null : null);
          return (
            <div key={m.name} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3">
              <div className="flex h-[220px] items-center justify-center rounded-lg bg-[#F1F4F1]">
                <div
                  aria-hidden="true"
                  className="flex items-center justify-center rounded-md bg-[#DDE3DE] text-xs font-bold text-[#3F4A45]"
                  style={{ width: BOX[m.ratio].w, height: BOX[m.ratio].h }}
                >
                  {m.fmt} {m.ratio}
                </div>
              </div>
              <div className="break-all text-sm font-bold">{m.name}</div>
              <div className="flex flex-wrap gap-1.5">
                {country ? <Pill tone="t">{country}</Pill> : <Pill tone="a">Needs country tag</Pill>}
                <Pill>{m.place}</Pill>
                <Pill>{m.fmt}</Pill>
                {m.talent && <Pill>{m.talent}</Pill>}
              </div>
              {country ? (
                <div className="text-[13px] text-muted">{m.use || "Not used yet"}</div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                  Suggested: {m.suggest}
                  <Btn
                    small
                    kind="s"
                    onClick={() => {
                      setConfirmed((c) => [...c, m.name]);
                      act(`Tagged media ${m.name} as ${m.suggest}`, "Media", "Tag saved.");
                    }}
                  >
                    Confirm
                  </Btn>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="m-0 text-[13px] text-muted">
        Add media early and tag it by country. When a campaign is created, media for that country is loaded straight in. Cost per pax is shown once the
        media has run in a campaign.
      </p>
    </>
  );
}
