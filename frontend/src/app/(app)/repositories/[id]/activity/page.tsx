import { RepoActivity } from "./repo-activity";

export default async function Page({ params }: PageProps<"/repositories/[id]/activity">) {
  const { id } = await params;
  return <RepoActivity id={id} />;
}
