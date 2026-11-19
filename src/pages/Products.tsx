import { useNavigate } from "react-router-dom";
import { Avatar, B, Btn, Card, CostStatus, PageHead, Pill, RunBy, SampleTag, Seat, Sel, T } from "../components/ui";
import { KOREA_WINTER_DATES, PRODUCTS } from "../lib/data";
import { useStore } from "../lib/store";

const Mono = ({ children }: { children: string }) => <span className="font-mono text-[13px]">{children}</span>;

export default function Products() {
  const { act } = useStore();
  const nav = useNavigate();

  return (
    <>
      <PageHead
        title="Products"
        sub="Step 1. Packages and dates come from TravelCRM. Each product needs a landing page before a campaign can run."
        right={<SampleTag />}
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <Avatar who="data" state="work" size={44} />
            <div>
              <div className="text-[15px] font-bold">8 products and 32 dates in the sample set</div>
              <div className="text-[13px] text-muted">TravelCRM is not connected yet. When it is, this loads live and refreshes every day at 06:00.</div>
            </div>
          </div>
          <Btn onClick={() => act("Pressed Load from TravelCRM", "Products", "TravelCRM is not connected yet. Showing sample products.")}>Load from TravelCRM</Btn>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3.5 rounded-xl bg-[#E3F2E9] px-5 py-4">
        <Avatar who="plan" state="wait" size={44} />
        <div className="min-w-0 flex-[1_1_320px]">
          <div className="text-sm font-bold text-[#17663F]">Suggestion from Campaign Planner</div>
          <div className="text-sm">Korea Autumn (44 open seats) and Bandung (60 open seats) have no campaign. A draft for Korea Autumn is waiting for approval.</div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Sel id="pc" label="Country" options={["All countries", "Korea", "Malaysia", "Japan", "Turkiye", "Vietnam", "Indonesia"]} />
        <Sel id="ps" label="Show" options={["All products", "No campaign", "Dates close to D-50", "Over RM80 per pax"]} />
        <div className="hidden flex-[2_1_220px] md:block" />
      </div>

      <Card className="!p-2">
        <T
          minW={980}
          right={[3, 4, 6, 7]}
          heads={["Product", "Country", "Landing page", "Dates", "Open seats", "Nearest D-50", "Campaigns", "Cost per pax", "Status", ""]}
          rows={PRODUCTS.map((p) => [
            <B>{p.name}</B>,
            p.country,
            p.lp ? <Mono>{p.lp}</Mono> : <Pill tone="a">No landing page</Pill>,
            p.dates,
            p.open,
            p.nearest ? <Pill tone={p.nearest.tone}>{p.nearest.text}</Pill> : "",
            p.campaigns,
            p.cpp ? <B>{p.cpp}</B> : "",
            p.st ? <CostStatus st={p.st} /> : <Pill tone="a">No campaign</Pill>,
            p.lp ? (
              <Btn small kind={p.campaigns === "0" ? "p" : "s"} onClick={() => nav("/campaigns/new")}>
                Run campaign
              </Btn>
            ) : (
              <Btn small kind="s" onClick={() => act(`Opened landing page setup for ${p.name}`, "Products", "Landing page editing arrives with Phase 1.")}>
                Add landing page
              </Btn>
            ),
          ])}
        />
      </Card>

      <Card
        title="Korea Winter"
        right={
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
            <span>
              Deposit RM500 per pax. 4 dates, 160 seats, 39 open. Landing page <Mono>/korea-winter</Mono>
            </span>
          </div>
        }
      >
        <div className="text-[13px] font-semibold text-muted">Departure dates</div>
        <T
          right={[4]}
          heads={["Date", "Days", "Seats", "D-50 KPI", "Open seats"]}
          rows={KOREA_WINTER_DATES.map((d) => [<B>{d.name}</B>, d.days, <Seat n={d.filled} />, <Pill tone={d.tone}>{d.kpi}</Pill>, d.open])}
        />
        <div className="text-[13px] font-semibold text-muted">Campaigns for this product</div>
        <T
          right={[3, 4, 5, 6]}
          heads={["Campaign", "Run by", "Delivery", "Budget a day", "Spend", "Pax", "Cost per pax", "Status"]}
          rows={[[<B>Korea Winter 5/10 - Staff A</B>, <RunBy k="Staff A" />, "Delivering", "RM850", "RM16,800", "198", <B>RM84.85</B>, <CostStatus st="r" />]]}
        />
      </Card>
    </>
  );
}
