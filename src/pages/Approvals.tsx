import { Card, PageHead } from "../components/ui";

export default function Approvals() {
  return (
    <>
      <PageHead title="Approvals" sub="Nothing pending." />
      <Card title="No proposals yet">
        <div className="text-sm">
          Ads Manager and Campaign Planner send their proposals here once Phase 2 starts: turn off an ad over RM80 per pax, raise a budget under RM50, or
          launch a new campaign. Nothing is changed in Meta without an approval on this page.
        </div>
        <div className="text-[13px] text-muted">Proposals need deposit data from TravelCRM first, so the system can work out cost per pax.</div>
      </Card>
    </>
  );
}
