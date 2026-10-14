import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return (
    <LoginForm
      next={one(sp.next)}
      expired={one(sp.expired) === "1"}
      signedOut={one(sp.signed_out) === "1"}
      registered={one(sp.registered) === "1"}
    />
  );
}
