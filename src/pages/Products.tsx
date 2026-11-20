import { Link } from "react-router-dom";
import { Avatar, Card, PageHead, Pill } from "../components/ui";

export default function Products() {
  return (
    <>
      <PageHead title="Products" sub="Step 1. Packages, dates and seats come from TravelCRM." />
      <Card title="No products loaded" right={<Pill tone="a">Deposits only for now</Pill>}>
        <div className="flex items-center gap-3.5">
          <Avatar who="data" state="idle" size={44} />
          <div className="text-sm">
            Deposits are now loaded from TravelCRM each night and counted by country. The full product list, with dates and open seats, comes in a
            later step.
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
