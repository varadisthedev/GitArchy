import { one } from "@/lib/format";
import { Commits } from "./commits";

export default async function Page({ params, searchParams }: PageProps<"/repositories/[id]/commits">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const page = Math.max(0, Math.min(3000, Number(one(sp.page)) || 0));
  return <Commits id={id} refParam={one(sp.ref)} path={(one(sp.path) ?? "").replace(/^\/+|\/+$/g, "")} page={page} />;
}
