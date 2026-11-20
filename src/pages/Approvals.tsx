import { useEffect, useState } from "react";
import { Avatar, B, Btn, Card, PageHead, Pill, T } from "../components/ui";
import { useAuth } from "../lib/auth";
import { type AdsAction, type Proposal, adam, confTone, decideProposal, fetchAdsActions, fetchProposals, proposalKind, when } from "../lib/live";
import { useStore } from "../lib/store";

const INPUT = "min-h-[44px] w-[140px] rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";
type Confirm = { id: string; budget: string; hint?: string };

export default function Approvals() {
  const { user } = useAuth();
  const { act } = useStore();
  const [list, setList] = useState<Proposal[]>([]);
  const [actions, setActions] = useState<AdsAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
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

  async function record(p: Proposal, status: "approved" | "rejected") {
    setBusy(true);
    const err = await decideProposal(p.id, status, user?.email ?? "");
    setBusy(false);
    setConfirm(null);
    if (err) return act(`Could not record a decision on: ${p.target}`, "Approvals", err);
    act(`${status === "approved" ? "Approved (record only)" : "Rejected"}: ${p.action_type} for ${p.target}`, "Approvals", status === "approved" ? "Approved and recorded. Nothing was changed in Meta." : "Rejected.");
    await load();
  }

  async function apply(p: Proposal) {
    setBusy(true);
    const kind = proposalKind(p.action_type);
    const r = await adam({ action: "apply", proposal_id: p.id, ...(kind === "budget" && confirm?.budget ? { new_daily_budget: Number(confirm.budget) } : {}) });
    setBusy(false);
    if (r.need_budget) {
      setConfirm({ id: p.id, budget: confirm?.budget ?? "", hint: `${r.error} Current daily budget of “${r.name}”: RM${r.current}. Most allowed in one step: RM${r.max}.` });
      return;
    }
    if (!r.ok) {
      act(`Adam could not apply: ${p.action_type} for ${p.target}`, "Approvals", r.error ?? "Failed.");
      if (r.manual) setConfirm({ id: p.id, budget: "", hint: r.error });
      return;
    }
    setConfirm(null);
    act(`Applied in Meta: ${p.action_type} for ${p.target}`, "Approvals", r.note ?? "Done in Meta.");
    await load();
  }

  async function undo(a: AdsAction, p: Proposal) {
    setBusy(true);
    const r = await adam({ action: "undo", action_id: a.id });
    setBusy(false);
    act(r.ok ? `Undid the pause for ${p.target}` : `Could not undo the pause for ${p.target}`, "Approvals", r.ok ? "Turned back on in Meta." : r.error ?? "Failed.");
    await load();
  }

  return (
    <>
      <PageHead title="Approvals" sub={loading ? "Loading…" : pending.length ? `${pending.length} proposal${pending.length === 1 ? "" : "s"} from Luqman's night study.` : "Nothing pending."} />

      <div className="rounded-xl bg-[#E6F1EE] px-5 py-4 text-sm">
        <B>Nothing changes in Meta until you say so.</B> For a pause or a budget change, Adam can make the change in Meta the moment you confirm. For
        anything else, approving only records your decision. Luqman checks the result the next night and learns from it.
      </div>

      {!loading && pending.length === 0 && (
        <Card title="No proposals waiting">
          <div className="text-sm">Luqman studies the ads every night at 02:10 and leaves his proposals here for the morning.</div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {pending.map((p) => {
          const kind = proposalKind(p.action_type);
          const open = confirm?.id === p.id;
          return (
            <Card key={p.id}>
              <div className="flex items-center justify-between gap-2">
                <Pill tone="a">{p.action_type}</Pill>
                <div className="flex items-center gap-2 text-[13px] text-muted">
                  <Avatar who="ana" state="wait" size={28} />
                  Luqman, {when(p.created_at)}
                </div>
              </div>
              <div className="text-base font-bold">{p.target}</div>
              <div className="text-sm">{p.reason}</div>
              {p.numbers && (
                <div className="text-[13px]">
                  <B>{p.numbers}</B>
                </div>
              )}
              {p.expected && <div className="text-[13px] text-muted">Expected: {p.expected}</div>}
              <div>
                <Pill tone={confTone(p.confidence)}>Confidence: {p.confidence ?? "not stated"}</Pill>
              </div>

              {open ? (
                <div className="flex flex-col gap-3 rounded-lg bg-[#FBEFD5] px-3 py-3">
                  <div className="text-sm font-bold text-[#5C3900]">
                    {kind === "pause" ? "Adam will turn this off in Meta now." : kind === "budget" ? "Adam will change this daily budget in Meta now." : "This one cannot be done automatically."}
                  </div>
                  {kind === "budget" && (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`b-${p.id}`} className="text-[13px] font-semibold">
                        New daily budget (RM)
                      </label>
                      <input id={`b-${p.id}`} inputMode="decimal" value={confirm.budget} onChange={(e) => setConfirm({ ...confirm, budget: e.target.value.replace(/[^0-9.]/g, "") })} className={INPUT} />
                    </div>
                  )}
                  {confirm.hint && <div className="text-[13px]">{confirm.hint}</div>}
                  <div className="text-[13px]">A pause can be undone from this page. Both are recorded under your name.</div>
                  <div className="flex flex-wrap gap-2">
                    {kind !== "manual" && (
                      <Btn disabled={busy || (kind === "budget" && !confirm.budget)} onClick={() => void apply(p)}>
                        {busy ? "Working…" : "Yes, change it in Meta"}
                      </Btn>
                    )}
                    <Btn kind="s" disabled={busy} onClick={() => void record(p, "approved")}>
                      Approve, I'll do it myself
                    </Btn>
                    <Btn kind="s" disabled={busy} onClick={() => setConfirm(null)}>
                      Cancel
                    </Btn>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Btn className="flex-1" disabled={busy} onClick={() => (kind === "manual" ? void record(p, "approved") : setConfirm({ id: p.id, budget: "" }))}>
                    {kind === "manual" ? "Approve" : "Approve…"}
                  </Btn>
                  <Btn className="flex-1" kind="s" disabled={busy} onClick={() => void record(p, "rejected")}>
                    Reject
                  </Btn>
                </div>
              )}
              <div className="text-xs text-muted">
                {kind === "manual" ? "Record only: make this change yourself in Ads Manager." : "Adam can make this change in Meta after you confirm."}
              </div>
            </Card>
          );
        })}
      </div>

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
