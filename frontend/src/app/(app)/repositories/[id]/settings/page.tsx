import { RepoSettings } from "./repo-settings";

export default async function Page({ params }: PageProps<"/repositories/[id]/settings">) {
  const { id } = await params;
  return <RepoSettings id={id} />;
}
