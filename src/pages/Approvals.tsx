import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, B, Btn, Card, PageHead, Pill, T } from "../components/ui";
import { ProposalActions } from "../components/ProposalActions";
import { type AdsAction, type Proposal, adam, confTone, fetchAdsActions, fetchProposals, proposalKind, when, agentOf, findCampaignId } from "../lib/live";
import { useStore } from "../lib/store";

/** Who looks after this page, and what each one does. The first three propose; Adam only acts after a person confirms. */
const TEAM = [
  { key: "analyst", who: "ana", name: "Luqman", role: "Results", does: "Studies every ad each night. Proposes what to turn off, raise or fix.", when: "Every night, 02:10" },
  { key: "budget", who: "bud", name: "Bakri", role: "Budget", does: "Plans the money each morning. Proposes moving budget to what sells.", when: "Every morning, 06:30" },
  { key: "creative", who: "cre", name: "Anis", role: "Creative", does: "Reviews the ads themselves. Proposes new ads to make.", when: "Monday and Thursday" },
  { key: "", who: "ads", name: "Adam", role: "Does it in Meta", does: "Makes the pause or budget change in Meta, only after you confirm.", when: "Only when you confirm" },
] as const;

/** Break a paragraph into short points, one sentence each. Decimals such as RM13.5 stay whole. */
function points(text?: string | null): string[] {
  return String(text ?? "")
    .split(/(?<=[.!?])\s+(?=[A-Z“"(])|;\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}
function Points({ text, strong }: { text?: string | null; strong?: boolean }) {
  const list = points(text);
  if (list.length <= 1) return <div className={strong ? "font-semibold" : ""}>{list[0] ?? ""}</div>;
  return (
    <ul className={`m-0 flex list-disc flex-col gap-1 pl-[18px] ${strong ? "font-semibold" : ""}`}>
      {list.map((x, i) => {
        const g = /^(My guess|Guess)\s*:/i.exec(x);
        return <li key={i}>{g ? <><span className="rounded bg-[#FBEFD5] px-1 text-[12px] font-bold text-[#5C3900]">A guess</span> {x.slice(g[0].length).trim()}</> : x}</li>;
      })}
    </ul>
  );
}
const Label = ({ children }: { children: string }) => <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">{children}</div>;

export default function Approvals() {
  const { act } = useStore();
  const navigate = useNavigate();
  const [who, setWho] = useState("");
  const [openId, setOpenId] = useState("");
  async function makeAd(p: Proposal) {
    const id = await findCampaignId(String(p.target ?? "").split(">")[0].trim());
    if (!id) return act(`Could not find the campaign for ${p.target}`, "Approvals", "The campaign named in this brief was not found. Open it from Campaigns and add the ad there.");
    navigate(`/campaigns/${id}?brief=${p.id}`);
  }
  const [list, setList] = useState<Proposal[]>([]);
  const [actions, setActions] = useState<AdsAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const [p, a] = await Promise.all([fetchProposals(), fetchAdsActions()]);
    setList(p);
    setActions(a);
    setLoading(false);
    window.dispatchEvent(new Event("mtb:proposals"));
  };
  useEffect(() => {
    void load();
  }, []);

  const pending = list.filter((p) => p.status === "pending");
  const decided = list.filter((p) => p.status !== "pending").slice(0, 40);
  const count = (k: string) => pending.filter((p) => (p.agent ?? "analyst") === k).length;
  const shown = who ? pending.filter((p) => (p.agent ?? "analyst") === who) : pending;

  async function undo(a: AdsAction, p: Proposal) {
    setBusy(true);
    const r = await adam({ action: "undo", action_id: a.id });
    setBusy(false);
    act(r.ok ? `Undid the pause for ${p.target}` : `Could not undo the pause for ${p.target}`, "Approvals", r.ok ? "Turned back on in Meta." : r.error ?? "Failed.");
    await load();
  }

  return (
    <>
      <PageHead title="Approvals" sub={loading ? "Loading…" : pending.length ? `${pending.length} proposal${pending.length === 1 ? "" : "s"} waiting for your decision.` : "Nothing waiting."} />

      <Card title="Who works on this page">
        <div className="text-sm">
          <B>4 AI staff.</B> Three of them propose, one carries out. Nothing changes in Meta until you confirm.
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {TEAM.map((t) => {
            const n = t.key ? count(t.key) : 0;
            const on = Boolean(t.key) && who === t.key;
            const inner = (
              <>
                <Avatar who={t.who} state={n ? "wait" : "idle"} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-[15px] font-bold text-ink">{t.name}</span>
                    <span className="text-[12px] font-semibold text-brand">{t.role}</span>
                    {t.key && <span className={`ml-auto rounded-full px-2 py-0.5 text-[12px] font-bold ${n ? "bg-[#FBEFD5] text-[#5C3900]" : "bg-ground text-muted"}`}>{n} waiting</span>}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-ink">{t.does}</span>
                  <span className="mt-0.5 block text-[12px] text-muted">{t.when}</span>
                </span>
              </>
            );
            const box = `flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left ${on ? "border-brand bg-[#E6F1EE]" : "border-line bg-white"}`;
            return t.key ? (
              <button key={t.name} type="button" aria-pressed={on} onClick={() => setWho(on ? "" : t.key)} className={box}>
                {inner}
              </button>
            ) : (
              <div key={t.name} className={`${box} bg-ground`}>
                {inner}
              </div>
            );
          })}
        </div>
        <div className="text-[12px] text-muted">{who ? <>Showing only {agentOf(who).name}'s proposals. <button type="button" onClick={() => setWho("")} className="border-0 bg-transparent p-0 text-[12px] font-semibold text-brand underline">Show all</button></> : "Tap a name to see only that person's proposals."}</div>
      </Card>

      {!loading && shown.length === 0 && (
        <Card title={who ? `Nothing waiting from ${agentOf(who).name}` : "No proposals waiting"}>
          <div className="text-sm">New proposals appear here after each of them finishes their next round.</div>
        </Card>
      )}

      {shown.length > 0 && (
        <Card title={`Waiting for you (${shown.length})`}>
          <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-lg border border-line p-0">
            {shown.map((p) => {
              const isOpen = openId === p.id;
              const a = agentOf(p.agent);
              const kind = proposalKind(p.action_type);
              return (
                <li key={p.id}>
                  <button type="button" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? "" : p.id)} className="flex w-full items-start gap-2.5 border-0 bg-transparent px-3 py-3 text-left">
                    <Avatar who={a.who} state="wait" size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] text-muted">
                        {a.name} · {when(p.created_at)}
                      </span>
                      <span className="block text-[13px] font-bold text-[#8A5300]">{p.action_type}</span>
                      <span className="block break-words text-[15px] font-bold leading-snug text-ink">{p.target}</span>
                      {!isOpen && <span className="mt-0.5 block text-[13px] text-muted">{points(p.reason)[0]}</span>}
                    </span>
                    <span className="flex flex-none flex-col items-end gap-1">
                      <Pill tone={confTone(p.confidence)}>{p.confidence ?? "?"}</Pill>
                      <span className="text-[12px] font-semibold text-brand">{isOpen ? "Close" : "Open"}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-3 px-3 pb-4 text-sm sm:pl-[54px]">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label>Why</Label>
                          <Points text={p.reason} />
                        </div>
                        {p.numbers && (
                          <div>
                            <Label>The numbers</Label>
                            <Points text={p.numbers} />
                          </div>
                        )}
                      </div>
                      {p.cause && (
                        <div>
                          <Label>{`${a.name}'s view`}</Label>
                          <Points text={p.cause} />
                        </div>
                      )}
                      <div className="rounded-lg bg-[#E6F1EE] px-3 py-2.5">
                        <Label>What to do</Label>
                        <Points text={p.how ?? p.action_type} strong />
                        {p.expected && (
                          <div className="mt-2 border-t border-[#C5DDD6] pt-2 text-[13px]">
                            <B>Expected:</B> {p.expected}
                          </div>
                        )}
                      </div>
                      <div className="text-[12px] text-muted">
                        Confidence {p.confidence ?? "not stated"} · {p.agent === "creative" ? "You create the ad" : kind === "manual" ? "You make this change yourself" : "Adam can do this in Meta"}
                      </div>
                      <ProposalActions p={p} onDone={load} onMake={p.agent === "creative" ? () => void makeAd(p) : undefined} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {decided.length > 0 && (
        <Card title="Decided earlier">
          <T
            minW={860}
            heads={["Proposed", "Action", "Target", "Decision", "By", ""]}
            rows={decided.map((p) => {
              const a = actions.find((x) => x.proposal_id === p.id);
              return [
                when(p.created_at),
                p.action_type,
                <span>
                  <B>{p.target}</B>
                  {p.apply_note && <span className="block text-[13px] text-muted">{p.apply_note}</span>}
                </span>,
                <Pill tone={p.status === "applied" || p.status === "approved" ? "g" : p.status === "rejected" ? "r" : "n"}>
                  {p.status === "applied" ? (a?.undone_at ? "Applied, then undone" : "Applied in Meta") : p.status === "approved" ? "Approved, record only" : p.status === "expired" ? "Not decided" : p.status}
                </Pill>,
                p.decided_by_email ?? "",
                a && a.kind === "pause" && !a.undone_at ? (
                  <Btn small kind="s" disabled={busy} onClick={() => void undo(a, p)}>
                    Undo pause
                  </Btn>
                ) : (
                  ""
                ),
              ];
            })}
          />
        </Card>
      )}
    </>
  );
}
