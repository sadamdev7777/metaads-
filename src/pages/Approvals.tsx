import { useEffect, useState } from "react";
import { Avatar, B, Btn, Card, PageHead, Pill, T } from "../components/ui";
import { useAuth } from "../lib/auth";
import { type Proposal, confTone, decideProposal, fetchProposals, when } from "../lib/live";
import { useStore } from "../lib/store";

export default function Approvals() {
  const { user } = useAuth();
  const { act } = useStore();
  const [list, setList] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = () => fetchProposals().then((p) => { setList(p); setLoading(false); });
  useEffect(() => { void load(); }, []);

  const pending = list.filter((p) => p.status === "pending");
  const decided = list.filter((p) => p.status !== "pending").slice(0, 30);

  async function decide(p: Proposal, status: "approved" | "rejected") {
    setBusy(true);
    const err = await decideProposal(p.id, status, user?.email ?? "");
    setBusy(false);
    if (err) return act(`Could not record a decision on: ${p.target}`, "Approvals", err);
    act(`${status === "approved" ? "Approved" : "Rejected"}: ${p.action_type} for ${p.target}`, "Approvals", status === "approved" ? "Approved. Make the change in Ads Manager: the system does not change Meta yet." : "Rejected.");
    await load();
    window.dispatchEvent(new Event("mtb:proposals"));
  }

  return (
    <>
      <PageHead title="Approvals" sub={loading ? "Loading…" : pending.length ? `${pending.length} proposal${pending.length === 1 ? "" : "s"} from Luqman's night study.` : "Nothing pending."} />

      <div className="rounded-xl bg-[#FBEFD5] px-5 py-4 text-sm">
        <B>Approving records your decision. It does not change Meta yet.</B> After you approve, make the change in Ads Manager. Luqman checks the result
        the next night and learns from it. Proposals are judged on Meta leads only, because deposits are not connected.
      </div>

      {!loading && pending.length === 0 && (
        <Card title="No proposals waiting">
          <div className="text-sm">Luqman studies the ads every night at 02:10 and leaves his proposals here for the morning.</div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {pending.map((p) => (
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
            <div className="flex gap-2">
              <Btn className="flex-1" disabled={busy} onClick={() => void decide(p, "approved")}>
                Approve
              </Btn>
              <Btn className="flex-1" kind="s" disabled={busy} onClick={() => void decide(p, "rejected")}>
                Reject
              </Btn>
            </div>
          </Card>
        ))}
      </div>

      {decided.length > 0 && (
        <Card title="Decided earlier">
          <T
            minW={760}
            heads={["Proposed", "Action", "Target", "Decision", "By"]}
            rows={decided.map((p) => [
              when(p.created_at),
              p.action_type,
              <B>{p.target}</B>,
              <Pill tone={p.status === "approved" ? "g" : p.status === "rejected" ? "r" : "n"}>{p.status === "expired" ? "Not decided" : p.status}</Pill>,
              p.decided_by_email ?? "",
            ])}
          />
        </Card>
      )}
    </>
  );
}
