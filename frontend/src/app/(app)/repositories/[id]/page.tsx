import { one } from "@/lib/format";
import { CodeBrowser } from "./code-browser";

export default async function Page({ params, searchParams }: PageProps<"/repositories/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <CodeBrowser id={id} refParam={one(sp.ref)} path={(one(sp.path) ?? "").replace(/^\/+|\/+$/g, "")} />;
}
