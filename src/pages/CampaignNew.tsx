import { Link } from "react-router-dom";
import { Card, PageHead, Pill } from "../components/ui";

export default function CampaignNew() {
  return (
    <>
      <PageHead title="New campaign" sub="Step 3. Copy a previous campaign, or let AI draft one." />
      <Card title="Not available yet" right={<Pill>Phase 3</Pill>}>
        <div className="text-sm">
          Launching a campaign from here needs products from TravelCRM and media in the Media page, and it needs permission to create ads in Meta. For
          now the system only reads from Meta, so new campaigns are still made in Ads Manager. They show up in Campaigns within the hour.
        </div>
        <div>
          <Link to="/campaigns" className="inline-flex min-h-[44px] items-center rounded-lg border border-[#9AA39E] px-4 text-sm font-semibold text-ink no-underline">
            Back to Campaigns
          </Link>
        </div>
      </Card>
    </>
  );
}
