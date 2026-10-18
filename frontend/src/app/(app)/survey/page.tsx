import type { Metadata } from "next";
import { PlatformSurvey } from "./platform-survey";

export const metadata: Metadata = { title: "Survey" };

export default function Page() {
  return <PlatformSurvey />;
}
