"use client";

import { CircleCheck, Eye, EyeOff, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { COLD_START_TIMEOUT_MS, api, isApiError } from "@/lib/api/client";
import type { User } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { InlineError, Spinner } from "@/components/ui/states";
import { GithubButton } from "@/components/auth/github-button";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// only same-site absolute paths: never "//evil.com" or "https://…"
// Same-origin paths only. Resolving against a throwaway origin catches "//host", "/\host" and control-char tricks.
const safeNext = (n?: string) => {
  if (!n?.startsWith("/")) return "/dashboard";
  try {
    const u = new URL(n, "http://same.invalid");
    return u.origin === "http://same.invalid" ? u.pathname + u.search + u.hash : "/dashboard";
  } catch {
    return "/dashboard";
  }
};

// A cold backend can leave a submit pending for most of a minute. Say so instead of spinning silently.
function useSlowRequest(pending: boolean, afterMs = 6_000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setSlow(true), afterMs);
    return () => {
      window.clearTimeout(t);
      setSlow(false);
    };
  }, [pending, afterMs]);
  return slow;
}

/** "or" rule between the GitHub button and the email form. */
function Divider() {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-line" />
      <span className="text-2xs text-fg-3">or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}


function WakingNotice() {
  return (
    <p role="status" className="hint">
      Still waiting on the server. It sleeps when unused and can take up to a minute to boot — this stays open until it answers.
    </p>
  );
}

function useRedirectIfAuthed(next: string) {
  const { status } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === "authed") router.replace(next);
  }, [status, next, router]);
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className="input pr-10" />
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-icon absolute top-1/2 right-1 -translate-y-1/2"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
      >
        {show ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}

function Notice({ tone, children }: { tone: "info" | "ok"; children: React.ReactNode }) {
  return (
    <p role="status" className="mb-6 flex items-start gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-xs text-fg-2">
      {tone === "ok" ? <CircleCheck className="mt-0.5 size-3.5 flex-none text-ok" aria-hidden /> : <Info className="mt-0.5 size-3.5 flex-none text-info" aria-hidden />}
      <span>{children}</span>
    </p>
  );
}

export function LoginForm({ next, expired, signedOut, registered }: { next?: string; expired?: boolean; signedOut?: boolean; registered?: boolean }) {
  const { login } = useSession();
  const router = useRouter();
  const dest = safeNext(next);
  useRedirectIfAuthed(dest);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const slow = useSlowRequest(pending);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const errs: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) errs.email = "Enter a valid email address.";
    if (!password) errs.password = "Enter your password.";
    setErrors(errs);
    setServerError(null);
    if (Object.keys(errs).length) return;
    setPending(true);
    try {
      await login(email.trim(), password);
      router.replace(dest);
    } catch (err) {
      setServerError(
        isApiError(err) && err.status === 401
          ? new Error("That email and password don't match an account.")
          : err,
      );
      setPending(false);
    }
  }

  return (
    <>
      {expired ? <Notice tone="info">Your session ended after 30 minutes or was signed out elsewhere. Sign in again to pick up where you left off.</Notice> : null}
      {signedOut ? <Notice tone="ok">You&apos;re signed out. Your token was revoked on the server.</Notice> : null}
      {registered ? <Notice tone="ok">Account created. Sign in to continue.</Notice> : null}
      <h1 className="text-2xl font-bold tracking-[-0.02em]">Sign in</h1>
      <p className="mt-1 text-sm text-fg-2">
        New here?{" "}
        <Link href="/register" className="link">
          Create an account
        </Link>
      </p>
      <div className="mt-7">
        <GithubButton mode="signin" next={dest} />
      </div>
      <Divider />
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input
            id="email" name="email" type="email" autoComplete="email" inputMode="email" autoFocus spellCheck={false}
            className="input" value={email} onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-err" : undefined}
          />
          {errors.email ? <p id="email-err" className="field-error">{errors.email}</p> : null}
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <PasswordInput
            id="password" name="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password} aria-describedby={errors.password ? "pw-err" : undefined}
          />
          {errors.password ? <p id="pw-err" className="field-error">{errors.password}</p> : null}
        </div>
        {serverError ? (
          isApiError(serverError) ? <InlineError error={serverError} /> : (
            <p role="alert" className="text-xs text-err">{(serverError as Error).message}</p>
          )
        ) : null}
        <button type="submit" className="btn btn-primary h-9 w-full" disabled={pending}>
          {pending ? <><Spinner /> Signing in…</> : "Sign in"}
        </button>
        {slow ? <WakingNotice /> : null}
      </form>
      <p className="mt-6 text-2xs text-fg-3">There&apos;s no password reset yet. The server doesn&apos;t offer one.</p>
    </>
  );
}

export function RegisterForm() {
  const { login } = useSession();
  const router = useRouter();
  useRedirectIfAuthed("/dashboard");
  const [f, setF] = useState({ display_name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof f, string>>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const slow = useSlowRequest(pending);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    // mirrors backend RegisterRequest; backend stays authoritative
    const errs: typeof errors = {};
    const name = f.display_name.trim();
    if (!name) errs.display_name = "Enter a display name.";
    else if (name.length > 50) errs.display_name = "Use 50 characters or fewer.";
    else if (/[<>]/.test(name)) errs.display_name = "Display names can't contain < or >.";
    if (!EMAIL_RE.test(f.email.trim())) errs.email = "Enter a valid email address.";
    if (f.password.length < 10) errs.password = "Use at least 10 characters.";
    else if (f.password.length > 128) errs.password = "Use 128 characters or fewer.";
    setErrors(errs);
    setServerError(null);
    if (Object.keys(errs).length) return;
    setPending(true);
    try {
      await api<User>("/auth/register", { body: { display_name: name, email: f.email.trim(), password: f.password }, timeoutMs: COLD_START_TIMEOUT_MS });
    } catch (err) {
      if (isApiError(err) && err.status === 422) {
        setErrors({
          display_name: err.fieldError("display_name"),
          email: err.fieldError("email"),
          password: err.fieldError("password"),
        });
      }
      setServerError(err);
      setPending(false);
      return;
    }
    try {
      await login(f.email.trim(), f.password);
      router.replace("/dashboard");
    } catch {
      router.replace("/login?registered=1"); // account exists; sign-in was rate limited or failed
    }
  }

  const pwLen = f.password.length;
  return (
    <>
      <h1 className="text-2xl font-bold tracking-[-0.02em]">Create your account</h1>
      <p className="mt-1 text-sm text-fg-2">
        Already have one?{" "}
        <Link href="/login" className="link">
          Sign in
        </Link>
      </p>
      <div className="mt-7">
        <GithubButton mode="signin" next="/dashboard" label="Sign up with GitHub" />
      </div>
      <Divider />
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="display_name" className="label">Display name</label>
          <input
            id="display_name" autoComplete="name" autoFocus maxLength={50} className="input"
            value={f.display_name} onChange={set("display_name")}
            aria-invalid={!!errors.display_name} aria-describedby="name-hint"
          />
          {errors.display_name ? (
            <p id="name-hint" className="field-error">{errors.display_name}</p>
          ) : (
            <p id="name-hint" className="hint">Shown on your commits and to collaborators.</p>
          )}
        </div>
        <div>
          <label htmlFor="r-email" className="label">Email</label>
          <input
            id="r-email" type="email" autoComplete="email" inputMode="email" spellCheck={false} className="input"
            value={f.email} onChange={set("email")}
            aria-invalid={!!errors.email} aria-describedby={errors.email ? "r-email-err" : undefined}
          />
          {errors.email ? <p id="r-email-err" className="field-error">{errors.email}</p> : null}
        </div>
        <div>
          <label htmlFor="r-password" className="label">Password</label>
          <PasswordInput
            id="r-password" autoComplete="new-password" value={f.password} onChange={set("password")}
            aria-invalid={!!errors.password} aria-describedby="pw-hint"
          />
          {errors.password ? (
            <p id="pw-hint" className="field-error">{errors.password}</p>
          ) : (
            <p id="pw-hint" className={`hint ${pwLen >= 10 ? "text-ok" : ""}`}>
              {pwLen >= 10 ? "Long enough." : `At least 10 characters${pwLen ? ` (${10 - pwLen} to go)` : ""}.`}
            </p>
          )}
        </div>
        {serverError && !(isApiError(serverError) && serverError.status === 422) ? <InlineError error={serverError} /> : null}
        <button type="submit" className="btn btn-primary h-9 w-full" disabled={pending}>
          {pending ? <><Spinner /> Creating account…</> : "Create account"}
        </button>
        {slow ? <WakingNotice /> : null}
      </form>
    </>
  );
}
