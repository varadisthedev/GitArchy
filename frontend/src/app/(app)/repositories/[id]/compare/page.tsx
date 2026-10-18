import { one } from "@/lib/format";
import { Compare } from "./compare";

export default async function Page({ params, searchParams }: PageProps<"/repositories/[id]/compare">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <Compare id={id} base={one(sp.base)} head={one(sp.head)} />;
}
