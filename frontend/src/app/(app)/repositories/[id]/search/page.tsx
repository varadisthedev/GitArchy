import { one } from "@/lib/format";
import { CodeSearch } from "./code-search";

export default async function Page({ params, searchParams }: PageProps<"/repositories/[id]/search">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return (
    <CodeSearch
      id={id}
      refParam={one(sp.ref)}
      query={(one(sp.q) ?? "").slice(0, 200)}
      path={(one(sp.path) ?? "").replace(/^\/+|\/+$/g, "")}
    />
  );
}
