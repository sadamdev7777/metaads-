import { useEffect, useState } from "react";
import { Avatar, B, Card, PageHead, Pill, T } from "../components/ui";
import { STAFF } from "../lib/data";
import { when } from "../lib/live";
import { supabase } from "../lib/supabase";

type Run = { id: number; started_at: string; finished_at: string | null; ok: boolean | null; error: string | null; triggered_by: string | null; summary: Record<string, number> };

export default function AIOffice() {
  const [runs, setRuns] = useState<Run[]>([]);
  useEffect(() => {
    if (!supabase) return;
    void supabase.from("sync_runs").select("*").order("id", { ascending: false }).limit(24).then(({ data }) => setRuns((data ?? []) as Run[]));
  }, []);
  const lastGood = runs.find((r) => r.ok);

  return (
    <>
      <PageHead title="AI Office" sub="4 AI staff. Data Keeper is running. The other three start in later phases and do nothing yet." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STAFF.map((s) => {
          const on = s.who === "data";
          return (
            <Card key={s.who}>
              <div className="flex items-center gap-3.5">
                <Avatar who={s.who} state={on ? "work" : "idle"} size={64} />
                <div className="min-w-0">
                  <h2 className="m-0 text-lg font-bold">{s.name}</h2>
                  <div className="mt-1">
                    <Pill tone={on ? "g" : "n"}>{on ? "Running" : "Not started"}</Pill>
                  </div>
                </div>
              </div>
              <div className="text-[13px] text-muted">{s.job}</div>
              <div className="rounded-lg bg-ground px-3 py-2.5 text-sm">
                {on ? (
                  <>
                    <span className="font-semibold">Last sync:</span> {when(lastGood?.finished_at)}. Next: every hour, 7 minutes past.
                  </>
                ) : (
                  s.starts
                )}
              </div>
              <div className="mt-auto">
                <Pill>{on ? "Read only" : "Mode: Approval"}</Pill>
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="Data Keeper log" sub="Every sync with Meta, newest first.">
        <T
          minW={760}
          heads={["Started", "Started by", "Result", "Details"]}
          rows={runs.map((r) => [
            when(r.started_at),
            r.triggered_by === "schedule" ? "Hourly schedule" : r.triggered_by ?? "",
            r.ok === null ? <Pill tone="a">Running</Pill> : r.ok ? <Pill tone="g">Done</Pill> : <Pill tone="r">Failed</Pill>,
            r.ok === false ? (
              r.error
            ) : r.summary?.campaigns ? (
              <span>
                <B>{r.summary.campaigns}</B> campaigns, <B>{r.summary.ad_sets}</B> ad sets, <B>{r.summary.ads}</B> ads, {r.summary.spend_rows} spend rows
              </span>
            ) : (
              `${r.summary?.spend_rows ?? 0} spend rows (history)`
            ),
          ])}
        />
        {runs.length === 0 && <div className="text-sm text-muted">No sync has run yet.</div>}
      </Card>
    </>
  );
}
