import { RepoFrame } from "@/components/repository/repo-frame";

export default async function RepoLayout({ children, params }: LayoutProps<"/repositories/[id]">) {
  const { id } = await params;
  return <RepoFrame id={id}>{children}</RepoFrame>;
}
