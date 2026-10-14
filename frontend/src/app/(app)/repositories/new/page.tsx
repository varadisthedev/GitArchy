import type { Metadata } from "next";
import { NewRepo } from "./new-repo";

export const metadata: Metadata = { title: "New repository" };

export default function Page() {
  return <NewRepo />;
}
