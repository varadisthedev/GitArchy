import { CodeBrowser } from "./code-browser";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ params, searchParams }: PageProps<"/repositories/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <CodeBrowser id={id} refParam={one(sp.ref)} path={(one(sp.path) ?? "").replace(/^\/+|\/+$/g, "")} />;
}
