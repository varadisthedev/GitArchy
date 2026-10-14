"use client";

import { Globe, Lock, LogOut, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { isApiError } from "@/lib/api/client";
import { useDeleteRepo, useMe, useMembers, useRemoveMember, useRepo, useSetMember, useUpdateRepo } from "@/lib/api/queries";
import { atLeast, RANK, type Member, type Visibility } from "@/lib/api/types";
import { Avatar, RoleChip } from "@/components/ui/bits";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { ErrorState, InlineError, Skeleton, SkeletonRows, Spinner } from "@/components/ui/states";

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-x-10 gap-y-4 border-t border-line py-8 first:border-t-0 first:pt-0 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div>
        <h2 id={id} className="text-base font-bold">{title}</h2>
        {description ? <p className="mt-1 text-xs text-fg-2">{description}</p> : null}
      </div>
      <div className="min-w-0 max-w-[42rem]">{children}</div>
    </section>
  );
}

export function RepoSettings({ id }: { id: string }) {
  const repo = useRepo(id);
  if (!repo.data) return <Skeleton className="h-64" />;
  const role = repo.data.role;
  return (
    <div>
      <Section id="gen-h" title="General" description={atLeast(role, "admin") ? "Description and visibility. Names can't be changed." : "Only admins can change these."}>
        <General id={id} />
      </Section>
      <Section id="mem-h" title="Collaborators" description="Readers browse, writers commit and branch, admins manage collaborators. Only the owner can grant admin or delete.">
        <Collaborators id={id} />
      </Section>
      {role === "owner" ? (
        <Section id="dz-h" title="Delete repository" description="Removes the metadata and the Git repository from the server. It can't be undone.">
          <DangerZone id={id} name={repo.data.name} />
        </Section>
      ) : null}
    </div>
  );
}

function General({ id }: { id: string }) {
  const repo = useRepo(id);
  const update = useUpdateRepo(id);
  const r = repo.data!;
  const [description, setDescription] = useState(r.description);
  const [visibility, setVisibility] = useState<Visibility>(r.visibility);
  const [saved, setSaved] = useState(false);
  const isAdmin = atLeast(r.role, "admin");
  const isOwner = r.role === "owner";
  const dirty = description !== r.description || visibility !== r.visibility;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || update.isPending) return;
    setSaved(false);
    try {
      await update.mutateAsync({
        ...(description !== r.description ? { description } : {}),
        ...(visibility !== r.visibility ? { visibility } : {}),
      });
      setSaved(true);
    } catch {}
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="rs-desc" className="label">Description</label>
        <textarea id="rs-desc" rows={3} maxLength={500} className="textarea" value={description} disabled={!isAdmin} onChange={(e) => { setDescription(e.target.value); setSaved(false); }} />
        <p className="hint">{description.length}/500</p>
      </div>
      <fieldset disabled={!isOwner}>
        <legend className="label">Visibility {!isOwner ? <span className="font-normal text-fg-3">(owner only)</span> : null}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["private", Lock, "Private", "Only members can see it."], ["public", Globe, "Public", "Every signed-in user can read it."]] as const).map(([v, Icon, t, d]) => (
            <label key={v} className={`radio-card ${!isOwner ? "cursor-not-allowed opacity-60" : ""}`}>
              <input type="radio" name="rs-vis" checked={visibility === v} onChange={() => { setVisibility(v); setSaved(false); }} className="mt-1" />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-bold"><Icon className="size-3.5 text-fg-3" aria-hidden /> {t}</span>
                <span className="mt-0.5 block text-xs text-fg-2">{d}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {update.error ? <InlineError error={update.error} /> : null}
      {isAdmin ? (
        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={!dirty || update.isPending}>
            {update.isPending ? <><Spinner /> Saving…</> : "Save changes"}
          </button>
          {saved ? <span role="status" className="text-xs text-ok">Saved.</span> : null}
        </div>
      ) : null}
    </form>
  );
}

function Collaborators({ id }: { id: string }) {
  const repo = useRepo(id);
  const me = useMe();
  const members = useMembers(id);
  const remove = useRemoveMember(id);
  const router = useRouter();
  const toast = useToast();
  const [pendingRemove, setPendingRemove] = useState<Member | null>(null);
  const myRole = repo.data!.role;

  const canRemove = (m: Member) =>
    m.role !== "owner" && (m.user_id === me.data?.id || (RANK[myRole] >= RANK.admin && RANK[myRole] > RANK[m.role]));
  const sorted = (members.data ?? []).toSorted((a, b) => RANK[b.role] - RANK[a.role] || (a.display_name ?? "").localeCompare(b.display_name ?? ""));

  async function confirmRemove() {
    const m = pendingRemove!;
    const self = m.user_id === me.data?.id;
    try {
      await remove.mutateAsync(m.user_id);
      setPendingRemove(null);
      if (self) {
        toast({ tone: "ok", title: `You left ${repo.data!.name}` });
        router.push("/repositories");
      }
    } catch {}
  }

  return (
    <div className="space-y-6">
      {members.isPending ? <SkeletonRows rows={3} label="Loading collaborators" /> : null}
      {members.isError ? <ErrorState error={members.error} retry={() => members.refetch()} compact /> : null}
      {sorted.length ? (
        <ul className="divide-y divide-line-soft rounded-md border border-line">
          {sorted.map((m) => {
            const self = m.user_id === me.data?.id;
            return (
              <li key={m.user_id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={m.display_name ?? "?"} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {m.display_name ?? "Unknown user"} {self ? <span className="font-normal text-fg-3">(you)</span> : null}
                </span>
                <RoleChip role={m.role} />
                {canRemove(m) ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => { remove.reset(); setPendingRemove(m); }}>
                    {self ? <><LogOut aria-hidden /> Leave</> : <><UserMinus aria-hidden /> Remove</>}
                  </button>
                ) : (
                  <span className="w-[4.75rem]" />
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {atLeast(myRole, "admin") ? <AddMember id={id} isOwner={myRole === "owner"} /> : null}

      <Dialog
        open={!!pendingRemove}
        onClose={() => setPendingRemove(null)}
        title={pendingRemove?.user_id === me.data?.id ? "Leave this repository?" : `Remove ${pendingRemove?.display_name ?? "member"}?`}
        description={pendingRemove?.user_id === me.data?.id ? "You'll lose access. If it's private, it disappears from your list." : "They lose access immediately. You can add them again later."}
      >
        {remove.error ? <div className="mb-3"><InlineError error={remove.error} /></div> : null}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setPendingRemove(null)}>Cancel</button>
          <button className="btn btn-danger-solid" disabled={remove.isPending} onClick={confirmRemove}>
            {remove.isPending ? <><Spinner /> Working…</> : pendingRemove?.user_id === me.data?.id ? "Leave" : "Remove"}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function AddMember({ id, isOwner }: { id: string; isOwner: boolean }) {
  const set = useSetMember(id);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"reader" | "writer" | "admin">("writer");
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (set.isPending) return;
    setDone(null);
    const v = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? undefined : "Enter the email of a Gitarchy account.";
    setErr(v);
    if (v) return;
    try {
      const m = await set.mutateAsync({ email: email.trim(), role });
      setDone(`${m.display_name ?? "They"} now ${m.role === "admin" ? "is an admin" : `has ${m.role} access`}.`);
      setEmail("");
    } catch (e) {
      if (isApiError(e) && e.status === 422) setErr(e.fieldError("email") ?? e.message);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby="add-h">
      <h3 id="add-h" className="mb-2 flex items-center gap-2 text-sm font-bold">
        <UserPlus className="size-4 text-fg-3" aria-hidden /> Add or change a collaborator
      </h3>
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="am-email" className="sr-only">Email</label>
          <input id="am-email" type="email" className="input" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "am-err" : "am-hint"} />
        </div>
        <label htmlFor="am-role" className="sr-only">Role</label>
        <select id="am-role" className="select w-auto" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="reader">Reader</option>
          <option value="writer">Writer</option>
          {isOwner ? <option value="admin">Admin</option> : null}
        </select>
        <button type="submit" className="btn btn-primary h-9" disabled={set.isPending}>
          {set.isPending ? <><Spinner /> Adding…</> : "Add"}
        </button>
      </div>
      {err ? <p id="am-err" className="field-error">{err}</p> : <p id="am-hint" className="hint">They need an existing Gitarchy account. Adding someone already here changes their role.</p>}
      {set.error && !(isApiError(set.error) && set.error.status === 422) ? <div className="mt-2"><InlineError error={set.error} /></div> : null}
      {done ? <p role="status" className="mt-2 text-xs text-ok">{done}</p> : null}
    </form>
  );
}

function DangerZone({ id, name }: { id: string; name: string }) {
  const del = useDeleteRepo();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  return (
    <>
      <button className="btn btn-danger" onClick={() => { setTyped(""); del.reset(); setOpen(true); }}>
        <Trash2 aria-hidden /> Delete this repository
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete ${name}?`} description="Every branch, commit and file is removed from the server, along with collaborators and activity. Bundles you exported earlier still work.">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (typed !== name || del.isPending) return;
            try {
              await del.mutateAsync(id);
              setOpen(false);
              toast({ tone: "ok", title: `Deleted ${name}` });
              router.replace("/repositories");
            } catch {}
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="del-name" className="label">
              Type <code className="rounded-sm bg-surface px-1 font-mono">{name}</code> to confirm
            </label>
            <input id="del-name" className="input font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} autoFocus />
          </div>
          {del.error ? <InlineError error={del.error} /> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-danger-solid" disabled={typed !== name || del.isPending}>
              {del.isPending ? <><Spinner /> Deleting…</> : "Delete repository"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
