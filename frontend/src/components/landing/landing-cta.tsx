"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/lib/auth/session";

/** Signed-in visitors get a way back to work instead of sign-up prompts. */
export function LandingCta({ size = "lg", variant = "pair" }: { size?: "lg" | "sm"; variant?: "pair" | "nav" }) {
  const { status } = useSession();
  const h = size === "lg" ? "h-10 px-4 text-sm" : "";
  if (status === "authed")
    return (
      <Link href="/dashboard" className={`btn btn-primary ${h}`}>
        Open your workspace <ArrowRight aria-hidden />
      </Link>
    );
  if (variant === "nav")
    return (
      <div className="flex items-center gap-1">
        <Link href="/login" className="btn btn-ghost">Sign in</Link>
        <Link href="/register" className="btn btn-primary">Create account</Link>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/register" className={`btn btn-primary ${h}`}>
        Create an account <ArrowRight aria-hidden />
      </Link>
      <Link href="/login" className={`btn ${h}`}>Sign in</Link>
    </div>
  );
}
