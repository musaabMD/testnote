import { FeatureSnapshotClient } from "./snapshot-client";

type FeatureSnapshotPageProps = {
  searchParams: Promise<{
    slide?: string | string[] | undefined;
  }>;
};

export default async function FeatureSnapshotPage({
  searchParams,
}: FeatureSnapshotPageProps) {
  const params = await searchParams;
  const slide = Array.isArray(params.slide) ? params.slide[0] : params.slide;

  return <FeatureSnapshotClient slideId={slide ?? "upload"} />;
}
