import { Branches } from "./branches";

export default async function Page({ params }: PageProps<"/repositories/[id]/branches">) {
  const { id } = await params;
  return <Branches id={id} />;
}
