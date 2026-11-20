import { Link } from "react-router-dom";
import { Avatar, Card, PageHead, Pill } from "../components/ui";

export default function Products() {
  return (
    <>
      <PageHead title="Products" sub="Step 1. Packages, dates and seats come from TravelCRM." />
      <Card title="No products loaded" right={<Pill tone="a">TravelCRM on hold</Pill>}>
        <div className="flex items-center gap-3.5">
          <Avatar who="data" state="idle" size={44} />
          <div className="text-sm">
            Products appear here when TravelCRM is connected: each package with its dates, open seats and deposit per pax. A campaign is then tied to a
            product, and cost per pax deposit can be worked out.
          </div>
        </div>
        <div className="text-[13px] text-muted">
          Until then, campaigns are tagged by country in{" "}
          <Link to="/campaigns" className="font-semibold">
            Campaigns
          </Link>
          .
        </div>
      </Card>
    </>
  );
}
