import { useState } from "react";
import { Link } from "react-router-dom";
import { B, Card, CostStatus, PageHead, Pill, RunBy, SampleTag, Sel, T } from "../components/ui";
import { BY_COUNTRY, BY_WHO, TREE } from "../lib/data";
import { useStore } from "../lib/store";

const LEVEL = ["Product", "Campaign", "Ad set", "Ad"] as const;
const ROW_BG = ["#DDE9E4", "#F1F4F1", "#FFFFFF", "#FFFFFF"];

export default function Analysis() {
  const { untagged } = useStore();
  const [closed, setClosed] = useState<string[]>([]);
  const spend = untagged.reduce((n, u) => n + Number(u.spend.replace(/[^\d]/g, "")), 0);

  // A row is hidden when the product above it is collapsed.
  let product = "";
  const visible = TREE.filter((r) => {
    if (r.lv === 0) {
      product = r.name;
      return true;
    }
    return !closed.includes(product);
  });
  const hasChildren = (name: string) => {
    const i = TREE.findIndex((r) => r.lv === 0 && r.name === name);
    return TREE[i + 1] !== undefined && TREE[i + 1].lv > 0;
  };
  const num = "px-3 py-[11px] text-right text-sm";
  const txt = "px-3 py-[11px] text-left text-sm";

  return (
    <>
      <PageHead
        title="Analysis"
        sub="Step 4. Performance by country and by who ran the campaign, then every product, campaign, ad set and ad."
        right={<SampleTag />}
      />

      <Card title="By country">
        <T
          minW={860}
          right={[2, 3, 4, 5, 6, 7]}
          heads={["Country", "Products", "Campaigns", "Spend", "Leads", "CPL", "Pax", "Cost per pax", "Status"]}
          rows={BY_COUNTRY.map((r) => [<B>{r.country}</B>, r.products, r.campaigns, r.spend, r.leads, r.cpl, r.pax, <B>{r.cpp}</B>, <CostStatus st={r.st} />])}
        />
      </Card>

      <Card title="By who ran the campaign" sub="Manual campaigns carry the staff name from the sign-in. Campaigns drafted by Campaign Planner are marked AI.">
        <T
          minW={760}
          right={[1, 2, 3, 4, 5, 6]}
          heads={["Run by", "Campaigns", "Spend", "Leads", "CPL", "Pax", "Cost per pax", "Status"]}
          rows={BY_WHO.map((r) => [r.who === "Total" ? <B>Total</B> : <RunBy k={r.who} />, r.campaigns, r.spend, r.leads, r.cpl, r.pax, <B>{r.cpp}</B>, <CostStatus st={r.st} />])}
        />
        <p className="m-0 text-[13px] text-muted">Staff and AI ran different products, so this is not a like-for-like comparison yet.</p>
      </Card>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-white p-4">
        <Sel id="xc" label="Country" options={["All countries", "Korea", "Malaysia", "Japan", "Turkiye", "Vietnam"]} />
        <Sel id="xr" label="Run by" options={["Everyone", "Staff A", "Staff B", "AI"]} />
        <Sel id="xf" label="Format" options={["PNG and MP4", "PNG only", "MP4 only"]} />
        <Sel id="xt" label="Talent in video" options={["All talent", "Talent A", "Talent B"]} />
      </div>

      <Card className="!p-2">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 1240 }}>
            <thead>
              <tr>
                {["Name", "Run by", "Format", "Spend", "Leads", "CPL", "Pax", "Cost per pax", "Status", "Agent action"].map((hd, i) => (
                  <th key={hd} className={`whitespace-nowrap border-b border-line px-3 py-2.5 text-xs font-semibold text-muted ${i >= 3 && i <= 7 ? "text-right" : "text-left"}`}>
                    {hd}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => {
                const isClosed = closed.includes(r.name);
                return (
                  <tr key={i} style={{ background: ROW_BG[r.lv] }} className="border-b border-line">
                    <td className={txt}>
                      <span className="inline-flex items-center gap-2 whitespace-nowrap" style={{ paddingLeft: r.lv * 22 }}>
                        <span className="min-w-[66px] text-[11px] font-bold uppercase text-muted">{LEVEL[r.lv]}</span>
                        <span className={r.lv < 2 ? "font-bold" : r.lv === 2 ? "font-semibold" : ""}>{r.name}</span>
                      </span>
                    </td>
                    <td className={txt}>
                      <span className="inline-flex gap-1">{r.runBy?.map((k) => <RunBy key={k} k={k} />)}</span>
                    </td>
                    <td className={txt}>{r.fmt}</td>
                    <td className={num}>{r.spend}</td>
                    <td className={num}>{r.leads}</td>
                    <td className={num}>{r.cpl}</td>
                    <td className={num}>{r.pax}</td>
                    <td className={num}>
                      <B>{r.cpp}</B>
                    </td>
                    <td className={txt}>
                      <CostStatus st={r.st} />
                    </td>
                    <td className={`${txt} whitespace-nowrap`}>
                      {r.lv === 0 && hasChildren(r.name) ? (
                        <button
                          type="button"
                          aria-expanded={!isClosed}
                          onClick={() => setClosed((c) => (isClosed ? c.filter((x) => x !== r.name) : [...c, r.name]))}
                          className="min-h-[44px] rounded-lg border border-[#9AA39E] bg-white px-3 text-[13px] font-semibold"
                        >
                          {isClosed ? "Show" : "Hide"}
                        </button>
                      ) : (
                        r.action
                      )}
                    </td>
                  </tr>
                );
              })}
              {untagged.length > 0 && (
                <tr style={{ background: ROW_BG[0] }} className="border-b border-line">
                  <td className={txt}>
                    <span className="inline-flex items-center gap-2">
                      <span className="min-w-[66px] text-[11px] font-bold uppercase text-muted">Product</span>
                      <span className="font-bold">Not tagged yet</span>
                    </span>
                  </td>
                  <td className={txt} />
                  <td className={txt} />
                  <td className={num}>RM{spend.toLocaleString()}</td>
                  <td className={num} />
                  <td className={num} />
                  <td className={num} />
                  <td className={num} />
                  <td className={txt}>
                    <Pill tone="a">Needs tagging</Pill>
                  </td>
                  <td className={txt}>
                    Watch only.{" "}
                    <Link to="/campaigns" className="text-[13px] font-semibold">
                      Tag {untagged.length} campaign{untagged.length === 1 ? "" : "s"}
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="m-0 text-[13px] text-muted">
        Figures are for leads from 13 Oct to 12 Nov, past the 7-day close window. Pax count only when the deposit matches an ad lead. Ads Manager judges
        ad sets. A single ad is judged alone only with 30 pax or more, or when its CPL is far over the limit.
      </p>
    </>
  );
}
