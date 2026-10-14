import type { Metadata } from "next";
import { AccountSettings } from "./account-settings";

export const metadata: Metadata = { title: "Profile & settings" };

export default function Page() {
  return <AccountSettings />;
}
