import { EditFile } from "./edit-file";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const clean = (p?: string) => (p ?? "").replace(/^\/+|\/+$/g, "");

export default async function Page({ params, searchParams }: PageProps<"/repositories/[id]/edit">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const path = clean(one(sp.path));
  const mode = one(sp.upload) === "1" ? "upload" : one(sp.new) === "1" || !path ? "new" : "edit";
  return (
    <EditFile
      key={`${mode}:${one(sp.ref)}:${path}:${one(sp.dir)}`}
      id={id}
      refParam={one(sp.ref)}
      path={path}
      dir={clean(one(sp.dir))}
      mode={mode}
    />
  );
}
