import type { Metadata } from "next";
import { Repositories } from "./repositories";

export const metadata: Metadata = { title: "Repositories" };

export default async function Page({ searchParams }: PageProps<"/repositories">) {
  const { q } = await searchParams;
  return <Repositories key={String(q ?? "")} initialQ={typeof q === "string" ? q : ""} />;
}
