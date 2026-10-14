import { CommitDetail } from "./commit-detail";

export default async function Page({ params }: PageProps<"/repositories/[id]/commits/[sha]">) {
  const { id, sha } = await params;
  return <CommitDetail id={id} sha={sha.toLowerCase()} />;
}
