"use client";

import { ImageUp, LogOut, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { isApiError } from "@/lib/api/client";
import {
  useDeleteAvatar, useDisconnectGithub, useGithubStatus, useMe, useReady, useRepos, useUploadAvatar,
  useUpdateMe,
} from "@/lib/api/queries";
import { useSession } from "@/lib/auth/session";
import { fullDate } from "@/lib/format";
import { Avatar } from "@/components/ui/bits";
import { GithubButton, GithubMark } from "@/components/auth/github-button";
import { ErrorState, InlineError, PageHeader, Skeleton, Spinner } from "@/components/ui/states";
import { StorageStatus } from "@/components/ui/storage-status";

const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];
const AVATAR_MAX = 2 * 1024 * 1024;

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-x-10 gap-y-4 border-t border-line py-8 first:border-t-0 first:pt-0 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div>
        <h2 id={id} className="text-base font-bold">{title}</h2>
        {description ? <p className="mt-1 text-xs text-fg-2">{description}</p> : null}
      </div>
      <div className="min-w-0 max-w-[36rem]">{children}</div>
    </section>
  );
}

export function AccountSettings() {
  const me = useMe();
  if (me.isError) return <ErrorState error={me.error} retry={() => me.refetch()} />;
  if (!me.data) return <Skeleton className="h-96" />;
  return (
    <div className="mx-auto max-w-[78rem]">
      <PageHeader title="Profile & settings" description="How you appear to collaborators, and your account." />
      <Section id="pf-h" title="Profile" description="Your display name is shown to collaborators and written as the author of commits you make in the browser.">
        <ProfileForm />
      </Section>
      <Section id="av-h" title="Avatar" description="PNG, JPEG or WebP up to 2 MB. Gitarchy uploads it on the server; your browser never handles storage credentials.">
        <AvatarForm />
      </Section>
      <Section id="acc-h" title="Account" description="Email can't be changed yet, and there's no password reset or account deletion on this server.">
        <AccountInfo />
      </Section>
      <Section id="gh-h" title="GitHub" description="Connect GitHub to import repositories with their full history. Gitarchy stores the token on the server and only ever reads.">
        <GithubConnection />
      </Section>
      <Section id="st-h" title="Storage" description="Repository bundle downloads are built on the server and stored in object storage. Checked against the bucket itself, not just the configuration.">
        <StorageStatus />
      </Section>
      <Section id="ses-h" title="Session" description="Sessions last 30 minutes and aren't refreshed. Signing out revokes this session's token on the server.">
        <SessionInfo />
      </Section>
    </div>
  );
}

function ProfileForm() {
  const me = useMe();
  const update = useUpdateMe();
  const [name, setName] = useState(me.data!.display_name);
  const [err, setErr] = useState<string>();
  const [saved, setSaved] = useState(false);
  const dirty = name.trim() !== me.data!.display_name;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || update.isPending) return;
    const n = name.trim();
    const v = !n ? "Enter a display name." : n.length > 50 ? "Use 50 characters or fewer." : /[<>]/.test(n) ? "Display names can't contain < or >." : undefined;
    setErr(v);
    setSaved(false);
    if (v) return;
    try {
      await update.mutateAsync({ display_name: n });
      setSaved(true);
    } catch (e) {
      if (isApiError(e) && e.status === 422) setErr(e.fieldError("display_name") ?? e.message);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div>
        <label htmlFor="pf-name" className="label">Display name</label>
        <input id="pf-name" className="input" maxLength={50} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} aria-invalid={!!err} aria-describedby={err ? "pf-err" : undefined} />
        {err ? <p id="pf-err" className="field-error">{err}</p> : null}
      </div>
      {update.error && !(isApiError(update.error) && update.error.status === 422) ? <InlineError error={update.error} /> : null}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={!dirty || update.isPending}>
          {update.isPending ? <><Spinner /> Saving…</> : "Save"}
        </button>
        {saved ? <span role="status" className="text-xs text-ok">Saved. New commits use this name.</span> : null}
      </div>
    </form>
  );
}

function AvatarForm() {
  const me = useMe();
  const ready = useReady();
  const upload = useUploadAvatar();
  const remove = useDeleteAvatar();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const configured = ready.data?.optional.cloudinary;
  const user = me.data!;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setErr(null);
    upload.reset();
    if (!AVATAR_TYPES.includes(file.type)) return setErr("Use a PNG, JPEG or WebP image.");
    if (file.size > AVATAR_MAX) return setErr("That image is over 2 MB.");
    setPreview(URL.createObjectURL(file));
    try {
      await upload.mutateAsync(file);
    } catch {}
    setPreview(null);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          <img src={preview} alt="" className="size-20 rounded-full object-cover opacity-60" />
        ) : (
          <Avatar name={user.display_name} url={user.avatar_url} size={80} />
        )}
        {upload.isPending ? <span className="absolute inset-0 grid place-items-center"><Spinner className="size-5" /></span> : null}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <input ref={input} id="av-file" type="file" accept={AVATAR_TYPES.join(",")} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} disabled={configured === false || upload.isPending} />
          <label htmlFor="av-file" className={`btn ${configured === false || upload.isPending ? "pointer-events-none text-fg-4" : "cursor-pointer"}`} aria-disabled={configured === false}>
            <ImageUp aria-hidden /> {user.avatar_url ? "Replace" : "Upload"}
          </label>
          {user.avatar_url ? (
            <button className="btn btn-ghost" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? <Spinner /> : <Trash2 aria-hidden />} Remove
            </button>
          ) : null}
        </div>
        {configured === false ? <p className="text-xs text-fg-3">Avatar uploads aren&apos;t configured on this server.</p> : null}
        {err ? <p role="alert" className="text-xs text-err">{err}</p> : null}
        {upload.error ? <InlineError error={upload.error} /> : null}
        {remove.error ? <InlineError error={remove.error} /> : null}
        {upload.isSuccess ? <p role="status" className="text-xs text-ok">Avatar updated.</p> : null}
      </div>
    </div>
  );
}

function AccountInfo() {
  const me = useMe();
  const repos = useRepos();
  const u = me.data!;
  const owned = repos.data?.filter((r) => r.owner_id === u.id).length;
  return (
    <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-y-2.5 text-sm">
      <dt className="text-fg-3">Email</dt>
      <dd className="truncate">{u.email}</dd>
      <dt className="text-fg-3">Member since</dt>
      <dd>{fullDate(u.created_at)}</dd>
      <dt className="text-fg-3">Repositories</dt>
      <dd>{repos.data ? `${owned} owned · ${repos.data.length - (owned ?? 0)} shared with you` : "…"}</dd>
      <dt className="text-fg-3">User ID</dt>
      <dd className="truncate font-mono text-xs leading-6 text-fg-2">{u.id}</dd>
    </dl>
  );
}

function SessionInfo() {
  const { expiresAt, logout } = useSession();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const mins = expiresAt ? Math.max(0, Math.round((expiresAt - now) / 60_000)) : null;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <p className="text-sm text-fg-2">{mins == null ? "" : mins < 1 ? "Ends in under a minute." : `Ends in about ${mins} minute${mins === 1 ? "" : "s"}.`}</p>
      <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await logout(); }}>
        {busy ? <Spinner /> : <LogOut aria-hidden />} Sign out
      </button>
    </div>
  );
}

function GithubConnection() {
  const status = useGithubStatus();
  const disconnect = useDisconnectGithub();
  if (status.isPending) return <Skeleton className="h-16" />;
  if (status.data && !status.data.configured) {
    return <p className="text-sm text-fg-2">GitHub isn&apos;t configured on this server.</p>;
  }
  if (!status.data?.connected) {
    return (
      <div className="max-w-xs">
        <GithubButton mode="connect" next="/import/github" label="Connect GitHub account" />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-4">
      <p className="flex items-center gap-2 text-sm text-fg-2">
        <GithubMark />
        <span className="font-bold text-fg">{status.data.login}</span>
        <span className="text-2xs text-fg-3">{status.data.can_import_private ? "public + private" : "public only"}</span>
      </p>
      <Link href="/import/github" className="btn btn-sm">
        Import repositories
      </Link>
      <button
        className="btn btn-sm"
        disabled={disconnect.isPending}
        onClick={() => disconnect.mutate(undefined)}
        // imported repositories are Gitarchy's own copies and are not touched by disconnecting
        title="Forget the stored GitHub token. Imported repositories stay."
      >
        {disconnect.isPending ? <Spinner /> : null} Disconnect
      </button>
      {disconnect.error ? <InlineError error={disconnect.error} /> : null}
    </div>
  );
}
