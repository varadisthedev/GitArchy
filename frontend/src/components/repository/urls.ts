import {
  File, FileArchive, FileCode2, FileCog, FileImage, FileJson, FileSymlink, FileText, Folder, FolderGit2, type LucideIcon,
} from "lucide-react";
import type { EntryType } from "@/lib/api/types";

const q = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const treeHref = (id: string, ref: string, path = "") => `/repositories/${id}${q({ ref, path })}`;
export const blobHref = (id: string, ref: string, path: string) => `/repositories/${id}/blob${q({ ref, path })}`;
export const editHref = (id: string, ref: string, path: string) => `/repositories/${id}/edit${q({ ref, path })}`;
export const newFileHref = (id: string, ref: string, dir = "") => `/repositories/${id}/edit${q({ ref, dir, new: "1" })}`;
export const commitsHref = (id: string, ref: string, path = "") => `/repositories/${id}/commits${q({ ref, path })}`;
export const commitHref = (id: string, sha: string) => `/repositories/${id}/commits/${sha}`;

const CODE = new Set("ts tsx js jsx mjs cjs py go rs java kt swift c h cpp cc hpp cs rb php sh bash zsh ps1 lua r dart ex exs scala sql vue svelte astro html css scss sass less graphql zig".split(" "));
const IMAGE = new Set("png jpg jpeg gif webp svg ico bmp avif".split(" "));
const ARCHIVE = new Set("zip gz tgz tar bz2 xz 7z rar jar".split(" "));
const CONFIG = new Set("yml yaml toml ini cfg conf env lock editorconfig".split(" "));

export function entryIcon(name: string, type: EntryType): LucideIcon {
  if (type === "dir") return Folder;
  if (type === "submodule") return FolderGit2;
  if (type === "symlink") return FileSymlink;
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.split(".").pop()! : "";
  if (ext === "json" || ext === "jsonc") return FileJson;
  if (ext === "md" || ext === "mdx" || ext === "txt" || ext === "rst" || lower === "license") return FileText;
  if (IMAGE.has(ext)) return FileImage;
  if (ARCHIVE.has(ext)) return FileArchive;
  if (CONFIG.has(ext) || lower.startsWith(".") || lower === "dockerfile" || lower === "makefile") return FileCog;
  if (CODE.has(ext)) return FileCode2;
  return File;
}
