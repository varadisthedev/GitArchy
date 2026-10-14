import Link from "next/link";
import { Fragment } from "react";
import { treeHref } from "./urls";

/** repo-name / dir / dir / file, every segment but the last navigable. */
export function PathCrumbs({ repoId, repoName, gitRef, path, trailing }: { repoId: string; repoName: string; gitRef: string; path: string; trailing?: string }) {
  const parts = path ? path.split("/") : [];
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-x-1 font-mono text-[0.8125rem]">
      {parts.length || trailing ? (
        <Link href={treeHref(repoId, gitRef)} className="font-semibold text-fg-2 hover:text-fg hover:underline">
          {repoName}
        </Link>
      ) : (
        <span className="font-semibold text-fg" aria-current="page">{repoName}</span>
      )}
      {parts.map((p, i) => {
        const last = i === parts.length - 1 && !trailing;
        return (
          <Fragment key={i}>
            <span className="text-fg-3" aria-hidden>/</span>
            {last ? (
              <span className="font-semibold break-all text-fg" aria-current="page">{p}</span>
            ) : (
              <Link href={treeHref(repoId, gitRef, parts.slice(0, i + 1).join("/"))} className="text-fg-2 hover:text-fg hover:underline">
                {p}
              </Link>
            )}
          </Fragment>
        );
      })}
      {trailing ? (
        <>
          <span className="text-fg-3" aria-hidden>/</span>
          <span className="font-semibold text-fg">{trailing}</span>
        </>
      ) : null}
    </nav>
  );
}
