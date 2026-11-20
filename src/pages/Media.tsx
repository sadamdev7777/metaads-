import { Card, PageHead, Pill } from "../components/ui";

export default function MediaPage() {
  return (
    <>
      <PageHead title="Media" sub="Step 2. Reels, Feed and Story creatives, tagged by country and ready to load into a campaign." />
      <Card title="No media yet" right={<Pill>Phase 3</Pill>}>
        <div className="text-sm">
          Uploading and tagging media starts in Phase 3, together with launching campaigns from this system. Creatives already running in Meta can be
          seen under each campaign in Analysis.
        </div>
      </Card>
    </>
  );
}
