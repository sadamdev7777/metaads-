import { Avatar, B, Btn, Card, PageHead, Pill, SampleTag } from "../components/ui";
import { useStore } from "../lib/store";

export default function Approvals() {
  const { approvals, decide, decideAll, reset } = useStore();

  return (
    <>
      <PageHead
        title="Approvals"
        sub={approvals.length ? `${approvals.length} pending, from Campaign Planner and Ads Manager.` : "Nothing pending."}
        right={
          <div className="flex items-center gap-3">
            <SampleTag />
            {approvals.length > 0 && (
              <Btn kind="d" onClick={decideAll}>
                Approve all ({approvals.length})
              </Btn>
            )}
          </div>
        }
      />

      {approvals.length === 0 && (
        <Card>
          <div className="text-sm">All items have been decided. This is sample data, so you can bring the list back to try again.</div>
          <div>
            <Btn kind="s" onClick={reset}>
              Reset sample list
            </Btn>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {approvals.map((a) => (
          <Card key={a.id}>
            <div className="flex items-center justify-between gap-2">
              <Pill tone={a.tone}>{a.tag}</Pill>
              <div className="flex items-center gap-2 text-[13px] text-muted">
                <Avatar who={a.from} state="wait" size={28} />
                {a.from === "plan" ? "Campaign Planner" : "Ads Manager"}
              </div>
            </div>
            <div className="text-base font-bold">{a.target}</div>
            <div className="text-[13px] text-muted">{a.reason}</div>
            <div className="text-[13px]">
              <B>{a.numbers}</B>
            </div>
            <div className="flex gap-2">
              <Btn className="flex-1" onClick={() => decide(a, "Approved")}>
                Approve
              </Btn>
              <Btn className="flex-1" kind="s" onClick={() => decide(a, "Rejected")}>
                Reject
              </Btn>
            </div>
          </Card>
        ))}
      </div>

      <p className="m-0 text-[13px] text-muted">
        Any staff member can approve. The system records who approved each item, and when. In this phase nothing is sent to Meta.
      </p>
    </>
  );
}
