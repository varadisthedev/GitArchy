import type { Metadata } from "next";
import { ImportGithub } from "./import-github";

export const metadata: Metadata = { title: "Import from GitHub" };

export default function Page() {
  return <ImportGithub />;
}
