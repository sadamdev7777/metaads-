import { useState } from "react";
import { B, Btn } from "./ui";
import { useAuth } from "../lib/auth";
import { type Proposal, REJECT_REASONS, adam, agentOf, decideProposal, proposalKind, rejectProposal } from "../lib/live";
import { useStore } from "../lib/store";

const INPUT = "min-h-[44px] w-full max-w-[220px] rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";

/**
 * Approve or reject one proposal, wherever it is shown. A pause or a budget change is made in Meta by Adam
 * after a confirm step; anything else is only recorded. A rejection can carry a reason the AI staff learn from.
 */
export function ProposalActions({ p, onDone }: { p: Proposal; onDone: () => void | Promise<void> }) {
  const { user } = useAuth();
  const { act } = useStore();
  const kind = proposalKind(p.action_type);
  const [mode, setMode] = useState<"" | "approve" | "reject">("");
  const [budget, setBudget] = useState("");
  const [hint, setHint] = useState("");
  const [manual, setManual] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const finish = async () => {
    setMode("");
    window.dispatchEvent(new Event("mtb:proposals"));
    await onDone();
  };

  async function recordOnly() {
    setBusy(true);
    const err = await decideProposal(p.id, "approved", user?.email ?? "");
    setBusy(false);
    if (err) return act(`Could not record a decision on: ${p.target}`, "Approvals", err);
    act(`Approved (record only): ${p.action_type} for ${p.target}`, "Approvals", "Approved and recorded. Nothing was changed in Meta: make this change yourself.");
    await finish();
  }
  async function apply() {
    setBusy(true);
    const r = await adam({ action: "apply", proposal_id: p.id, ...(kind === "budget" && budget ? { new_daily_budget: Number(budget) } : {}) });
    setBusy(false);
    if (r.need_budget) return setHint(`${r.error} Current daily budget of “${r.name}”: RM${r.current}. Most allowed in one step: RM${r.max}.`);
    if (!r.ok) {
      setManual(Boolean(r.manual));
      setHint(r.error ?? "Could not make the change.");
      if (!r.manual) act(`Could not apply: ${p.action_type} for ${p.target}`, "Approvals", r.error ?? "Failed.");
      return;
    }
    act(`Approved and applied: ${p.action_type} for ${p.target}`, "Approvals", r.note ?? "Done in Meta.");
    await finish();
  }
  async function reject() {
    setBusy(true);
    const err = await rejectProposal(p.id, reason.trim());
    setBusy(false);
    if (err) return act(`Could not reject: ${p.target}`, "Approvals", err);
    act(`Rejected: ${p.action_type} for ${p.target}${reason.trim() ? ` (${reason.trim()})` : ""}`, "Approvals", reason.trim() ? "Rejected. Your reason is in the AI staff's notebook, so they learn from it." : "Rejected.");
    await finish();
  }

  return (
    <div className="flex flex-col gap-2">
      {mode === "" && (
        <>
          <div className="flex flex-wrap gap-2">
            <Btn small disabled={busy} onClick={() => (kind === "manual" ? void recordOnly() : setMode("approve"))}>
              {kind === "manual" ? "Approve" : "Approve…"}
            </Btn>
            <Btn small kind="s" disabled={busy} onClick={() => setMode("reject")}>
              Reject…
            </Btn>
          </div>
          <div className="text-[12px] text-muted">{kind === "manual" ? "Approve only records your decision: make this change yourself." : "Adam makes this change in Meta after you confirm."}</div>
        </>
      )}

      {mode === "approve" && (
        <div className="flex flex-col gap-2 rounded-lg bg-[#FBEFD5] px-3 py-3 text-sm">
          <div>
            <B>{kind === "pause" ? "Pause this in Meta now?" : "Change this budget in Meta now?"}</B> {kind === "pause" ? "It stops spending at once. A pause can be undone in Approvals." : "Enter the new daily amount."}
          </div>
          {kind === "budget" && (
            <label className="flex flex-col gap-1 text-[13px] font-semibold" htmlFor={`pb-${p.id}`}>
              New daily budget in RM
              <input id={`pb-${p.id}`} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ""))} className={`${INPUT} font-normal`} />
            </label>
          )}
          {hint && <div className="text-[13px]">{hint}</div>}
          <div className="flex flex-wrap gap-2">
            {!manual && (
              <Btn small disabled={busy || (kind === "budget" && !(Number(budget) >= 5))} onClick={() => void apply()}>
                {busy ? "Working…" : kind === "pause" ? "Yes, pause it in Meta" : "Change it in Meta"}
              </Btn>
            )}
            <Btn small kind="s" disabled={busy} onClick={() => void recordOnly()}>
              Approve, I'll do it myself
            </Btn>
            <Btn small kind="s" disabled={busy} onClick={() => setMode("")}>
              Cancel
            </Btn>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="flex flex-col gap-2 rounded-lg bg-ground px-3 py-3">
          <label htmlFor={`pr-${p.id}`} className="text-[13px] font-semibold">
            Why? {agentOf(p.agent).name} reads this and learns from it. You can leave it empty.
          </label>
          <div className="flex flex-wrap gap-1.5">
            {REJECT_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className={`min-h-[36px] rounded-full border px-3 text-[13px] ${reason === r ? "border-brand bg-[#E6F1EE] font-semibold" : "border-line bg-white"}`}>
                {r}
              </button>
            ))}
          </div>
          <textarea id={`pr-${p.id}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or write your own reason" className="w-full rounded-lg border border-[#9AA39E] bg-white px-3 py-2 text-[15px]" />
          <div className="flex gap-2">
            <Btn small disabled={busy} onClick={() => void reject()}>
              {busy ? "Working…" : "Reject"}
            </Btn>
            <Btn small kind="s" disabled={busy} onClick={() => setMode("")}>
              Cancel
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
