import type { Metadata } from "next";
import { MyActivity } from "./my-activity";

export const metadata: Metadata = { title: "Activity" };

export default function Page() {
  return <MyActivity />;
}
