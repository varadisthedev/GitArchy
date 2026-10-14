"use client";

import { Globe, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isApiError } from "@/lib/api/client";
import { useCreateRepo, useMe } from "@/lib/api/queries";
import type { Visibility } from "@/lib/api/types";
import { validBranch, validRepoName } from "@/lib/validation";
import { useToast } from "@/components/ui/toast";
import { InlineError, PageHeader, Spinner } from "@/components/ui/states";

export function NewRepo() {
  const create = useCreateRepo();
  const me = useMe();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [branch, setBranch] = useState("main");
  const [errors, setErrors] = useState<{ name?: string; branch?: string; description?: string }>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending) return;
    const errs: typeof errors = {};
    const n = validRepoName(name.trim());
    if (n) errs.name = n;
    const b = validBranch(branch.trim());
    if (b) errs.branch = b;
    if (description.length > 500) errs.description = "Use 500 characters or fewer.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      const repo = await create.mutateAsync({ name: name.trim(), description: description.trim(), visibility, default_branch: branch.trim() });
      toast({ tone: "ok", title: `Created ${repo.name}`, body: "Initial commit with a README is on " + repo.default_branch + "." });
      router.push(`/repositories/${repo.id}`);
    } catch (err) {
      if (isApiError(err) && err.code === "repo_name_taken") setErrors({ name: err.message });
      else if (isApiError(err) && err.status === 422)
        setErrors({ name: err.fieldError("name"), branch: err.fieldError("default_branch"), description: err.fieldError("description") });
    }
  }

  const serverErr = create.error && !(isApiError(create.error) && (create.error.code === "repo_name_taken" || create.error.status === 422)) ? create.error : null;

  return (
    <div className="mx-auto max-w-[40rem]">
      <PageHeader title="New repository" description="Gitarchy initialises a bare Git repository and commits a README you can edit right away." />
      <form onSubmit={submit} noValidate className="space-y-6">
        <div>
          <label htmlFor="repo-name" className="label">Repository name</label>
          <div className="flex items-center gap-2">
            <span className="max-w-[40%] truncate text-sm text-fg-2">{me.data?.display_name ?? "you"}</span>
            <span className="text-fg-3" aria-hidden>/</span>
            <input
              id="repo-name" autoFocus spellCheck={false} autoComplete="off" maxLength={64} className="input font-mono text-[0.8125rem]"
              value={name} onChange={(e) => setName(e.target.value)} placeholder="ledger-service"
              aria-invalid={!!errors.name} aria-describedby="name-msg"
            />
          </div>
          {errors.name ? (
            <p id="name-msg" className="field-error">{errors.name}</p>
          ) : (
            <p id="name-msg" className="hint">Letters, digits, “.”, “_” and “-”, up to 64. Names can&apos;t be changed later.</p>
          )}
        </div>

        <div>
          <label htmlFor="repo-desc" className="label">
            Description <span className="font-normal text-fg-3">(optional)</span>
          </label>
          <textarea
            id="repo-desc" rows={3} maxLength={500} className="textarea" value={description}
            onChange={(e) => setDescription(e.target.value)} aria-invalid={!!errors.description} aria-describedby="desc-msg"
          />
          <p id="desc-msg" className={errors.description ? "field-error" : "hint"}>
            {errors.description ?? `${description.length}/500. Also written into the initial README.`}
          </p>
        </div>

        <fieldset>
          <legend className="label">Visibility</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["private", Lock, "Private", "Only members you add can see it."],
                ["public", Globe, "Public", "Anyone signed in to this Gitarchy can read it."],
              ] as const
            ).map(([v, Icon, t, d]) => (
              <label key={v} className="radio-card">
                <input type="radio" name="visibility" value={v} checked={visibility === v} onChange={() => setVisibility(v)} className="mt-1" />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-bold">
                    <Icon className="size-3.5 text-fg-3" aria-hidden /> {t}
                  </span>
                  <span className="mt-0.5 block text-xs text-fg-2">{d}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="repo-branch" className="label">Default branch</label>
          <input
            id="repo-branch" spellCheck={false} autoComplete="off" maxLength={100} className="input max-w-[16rem] font-mono text-[0.8125rem]"
            value={branch} onChange={(e) => setBranch(e.target.value)} aria-invalid={!!errors.branch} aria-describedby="branch-msg"
          />
          {errors.branch ? <p id="branch-msg" className="field-error">{errors.branch}</p> : null}
        </div>

        {serverErr ? <InlineError error={serverErr} /> : null}

        <div className="flex items-center gap-2 border-t border-line pt-5">
          <button type="submit" className="btn btn-primary h-9" disabled={create.isPending}>
            {create.isPending ? <><Spinner /> Creating…</> : "Create repository"}
          </button>
          <Link href="/repositories" className="btn btn-ghost h-9">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
