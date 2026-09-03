import { notFound } from "next/navigation";
import { allPatterns } from "@/lib/patterns";
import { getOutcome } from "@/lib/outcomes";
import OutcomeClient from "./OutcomeClient";

// Pre-render all 32 outcome pages at build time.
export function generateStaticParams() {
  return allPatterns().map((pattern) => ({ pattern }));
}

export const dynamicParams = false;

export default async function OutcomePage({
  params,
}: {
  params: Promise<{ pattern: string }>;
}) {
  const { pattern } = await params;
  const outcome = getOutcome(pattern);

  if (!outcome) notFound();

  return <OutcomeClient pattern={pattern} outcome={outcome} />;
}
