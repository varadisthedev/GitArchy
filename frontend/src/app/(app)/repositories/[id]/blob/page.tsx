import { one } from "@/lib/format";
import { FileView } from "./file-view";

export default async function Page({ params, searchParams }: PageProps<"/repositories/[id]/blob">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const path = (one(sp.path) ?? "").replace(/^\/+|\/+$/g, "");
  return <FileView key={`${one(sp.ref)}:${path}`} id={id} refParam={one(sp.ref)} path={path} />;
}
