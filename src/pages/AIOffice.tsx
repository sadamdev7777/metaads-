import { useState } from "react";
import { AGENT_STATE, Avatar, B, Btn, Card, PageHead, Pill, SampleTag, T, Typing } from "../components/ui";
import { AGENT_LOG, STAFF } from "../lib/data";
import { useStore } from "../lib/store";

export default function AIOffice() {
  const { act } = useStore();
  const [paused, setPaused] = useState<string[]>([]);
  const allPaused = paused.length === STAFF.length;

  function toggle(name: string) {
    const on = paused.includes(name);
    setPaused((p) => (on ? p.filter((x) => x !== name) : [...p, name]));
    act(`${on ? "Resumed" : "Paused"} AI staff ${name}`, "AI Office", `${name} ${on ? "resumed" : "paused"}. In this phase AI staff do not run yet.`);
  }

  return (
    <>
      <PageHead
        title="AI Office"
        sub="4 AI staff. Every action is logged with its reason. In this phase they are shown with sample activity and do not run yet."
        right={
          <div className="flex items-center gap-3">
            <SampleTag />
            <Btn
              kind="x"
              onClick={() => {
                setPaused(allPaused ? [] : STAFF.map((s) => s.name));
                act(allPaused ? "Resumed all AI staff" : "Paused all AI staff", "AI Office");
              }}
            >
              {allPaused ? "Resume all" : "Pause all"}
            </Btn>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STAFF.map((s) => {
          const isPaused = paused.includes(s.name);
          const state = isPaused ? "idle" : s.state;
          return (
            <Card key={s.who}>
              <div className="flex items-center gap-3.5">
                <Avatar who={s.who} state={state} size={64} />
                <div className="min-w-0">
                  <h2 className="m-0 text-lg font-bold">{s.name}</h2>
                  <div className="mt-1">
                    <Pill tone={AGENT_STATE[state].tone}>{isPaused ? "Paused" : AGENT_STATE[state].label}</Pill>
                  </div>
                </div>
              </div>
              <div className="text-[13px] text-muted">{s.job}</div>
              <div className="rounded-lg bg-ground px-3 py-2.5 text-sm">
                <span className="font-semibold">Now:</span> {isPaused ? "Paused" : s.now}
                {!isPaused && s.state === "work" && <Typing />}
              </div>
              <div className="text-sm">
                <span className="font-semibold">Last action:</span> {s.last}
              </div>
              <div className="text-[13px] text-muted">Next run: {isPaused ? "when resumed" : s.next}</div>
              <div className="mt-auto flex items-center justify-between gap-2">
                <Pill>{s.mode}</Pill>
                <Btn kind="s" onClick={() => toggle(s.name)}>
                  {isPaused ? "Resume" : "Pause"}
                </Btn>
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="Today's log">
        <T
          minW={820}
          heads={["Time", "AI staff", "Action", "Reason"]}
          rows={AGENT_LOG.map((l) => [
            l.time,
            <span className="inline-flex items-center gap-2">
              <Avatar who={l.who} state="idle" size={28} />
              <B>{l.name}</B>
            </span>,
            l.action,
            l.reason,
          ])}
        />
      </Card>
    </>
  );
}
