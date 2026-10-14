import { Compare } from "./compare";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ params, searchParams }: PageProps<"/repositories/[id]/compare">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <Compare id={id} base={one(sp.base)} head={one(sp.head)} />;
}
