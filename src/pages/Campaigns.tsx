import { Link } from "react-router-dom";
import { B, Btn, Card, CostStatus, PageHead, Pill, RunBy, SampleTag, Sel, T } from "../components/ui";
import { CAMPAIGNS } from "../lib/data";
import { useStore } from "../lib/store";

export default function Campaigns() {
  const { untagged, tag, paused, togglePause, act } = useStore();
  const spend = untagged.reduce((n, u) => n + Number(u.spend.replace(/[^\d]/g, "")), 0);

  return (
    <>
      <PageHead
        title="Campaigns"
        sub="Step 3. One campaign is for one product. Run it by hand or let AI draft it."
        right={
          <div className="flex items-center gap-3">
            <SampleTag />
            <Link to="/campaigns/new" className="flex min-h-[44px] items-center rounded-lg bg-brand px-4 text-sm font-bold text-white no-underline">
              New campaign
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3.5 rounded-xl bg-[#FBE6E3] px-5 py-4">
        <div className="min-w-0 flex-[1_1_360px]">
          <div className="text-sm font-bold text-[#A3231B]">1 ad rejected by Meta</div>
          <div className="text-sm">Turkiye 12/10 - AI › Broad MP4 › MP4 1. Reason from Meta: [Meta's reason is shown here]</div>
        </div>
        <div className="flex gap-2">
          <Btn onClick={() => act("Opened Replace media for Turkiye 12/10 - AI › MP4 1", "Campaigns", "Replacing media arrives with Phase 3.")}>Replace media</Btn>
          <Btn kind="s" onClick={() => act("Opened Turkiye 12/10 - AI in Ads Manager", "Campaigns", "The Ads Manager link arrives with Phase 1.")}>
            Open in Ads Manager
          </Btn>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Sel id="cc" label="Country" options={["All countries", "Korea", "Malaysia", "Japan", "Turkiye", "Vietnam"]} />
        <Sel id="cr" label="Run by" options={["Everyone", "Staff A", "Staff B", "AI"]} />
        <Sel id="cs" label="Delivery" options={["All", "Delivering", "Learning", "Has issues", "Paused", "Draft"]} />
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label htmlFor="cq" className="text-[13px] font-semibold">
            Search name
          </label>
          <input id="cq" type="search" placeholder="e.g. Korea" className="min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px]" />
        </div>
      </div>

      <Card className="!p-2">
        <T
          minW={1040}
          right={[5, 6]}
          heads={["Campaign", "Product", "Run by", "Source", "Delivery", "Budget a day", "Cost per pax", "Status", ""]}
          rows={CAMPAIGNS.map((c) => {
            const isPaused = paused.includes(c.id);
            return [
              <B>{c.name}</B>,
              c.product,
              <RunBy k={c.runBy} />,
              <Pill tone={c.system ? "g" : "n"}>{c.system ? "Launched here" : "Loaded from Meta"}</Pill>,
              isPaused ? <Pill>Paused</Pill> : <Pill tone={c.delivery.tone}>{c.delivery.text}</Pill>,
              c.budget,
              c.cpp ? <B>{c.cpp}</B> : "",
              <CostStatus st={c.st} />,
              c.draft ? (
                <Link to="/campaigns/new" className="flex min-h-[44px] items-center rounded-lg border border-[#9AA39E] px-2.5 text-[13px] font-semibold text-ink no-underline">
                  Open draft
                </Link>
              ) : (
                <span className="inline-flex gap-1.5">
                  <Btn small kind="s" onClick={() => togglePause(c.id, c.name)}>
                    {isPaused ? "Resume" : "Pause"}
                  </Btn>
                  <Btn small kind="s" onClick={() => act(`Opened Edit budget for ${c.name}`, "Campaigns", "Budget editing arrives with Phase 2.")}>
                    Edit budget
                  </Btn>
                </span>
              ),
            ];
          })}
        />
      </Card>

      <Card
        title="Found in Meta, not in the system"
        right={untagged.length ? <Pill tone="a">{`${untagged.length} campaign${untagged.length === 1 ? "" : "s"}, RM${spend.toLocaleString()} not counted yet`}</Pill> : <Pill tone="g">All tagged</Pill>}
        sub="Data Keeper checks Meta every hour. A campaign made in Ads Manager shows up here with a notification. Tag it with its product and who ran it. Until it is tagged, AI staff only watch it. A campaign with no UTM cannot be matched to leads until one is added."
      >
        {untagged.length > 0 && (
          <T
            minW={860}
            right={[2]}
            heads={["Campaign", "Found", "Spend", "Suggested tag", "UTM", ""]}
            rows={untagged.map((u) => [
              <B>{u.name}</B>,
              u.found,
              u.spend,
              u.product ? (
                <span>
                  Product: <B>{u.product}</B>
                  <br />
                  Run by: <B>{u.runBy}</B>
                </span>
              ) : (
                u.note
              ),
              u.utm ? <Pill tone="g">UTM found</Pill> : <Pill tone="r">No UTM</Pill>,
              u.product ? (
                <Btn small onClick={() => tag(u)}>
                  Confirm
                </Btn>
              ) : (
                <Btn small kind="s" onClick={() => act(`Opened tagging for ${u.name}`, "Campaigns", "Choosing a product by hand arrives with Phase 1.")}>
                  {u.action}
                </Btn>
              ),
            ])}
          />
        )}
      </Card>

      <p className="m-0 text-[13px] text-muted">
        Changes made in Ads Manager, such as a new budget or a pause, are picked up the same way and written to the log as changed outside the system.
      </p>
    </>
  );
}
