import { Analytics } from "@/app/(app)/analytics/analytics";

export default async function Page({ params }: PageProps<"/repositories/[id]/analytics">) {
  const { id } = await params;
  return <Analytics repoId={id} />;
}
