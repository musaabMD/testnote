import type { ReactNode } from "react";
import { PaidFeatureGate } from "@/components/paid-feature-gate";

export default function AnalysisLayout({ children }: { children: ReactNode }) {
  return (
    <PaidFeatureGate
      feature="advancedStudy"
      title="Analysis is a paid feature"
      message="Upgrade to Pro or higher to view session analysis and performance breakdowns."
    >
      {children}
    </PaidFeatureGate>
  );
}
