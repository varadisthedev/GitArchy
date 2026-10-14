import type { Metadata } from "next";
import { JobDetail } from "./job-detail";

export const metadata: Metadata = { title: "Analytics job" };

export default async function Page({ params }: PageProps<"/analytics/jobs/[id]">) {
  const { id } = await params;
  return <JobDetail key={id} id={id} />;
}
