// Helyi fájlok összegyűjtése fájl-, mappa- és ZIP-választásból, illetve húzással (mappastruktúrával).
import { isSystemJunk } from "@/lib/packages/package-policy";
import type { LocalFile } from "@/lib/packages/upload-engine";

export function fromInput(list: FileList | null): LocalFile[] {
  return Array.from(list ?? []).map((f) => ({
    blob: f, relativePath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    lastModified: f.lastModified, mime: f.type || null,
  })).filter((f) => !isSystemJunk(f.relativePath));
}

type Entry = { isFile: boolean; isDirectory: boolean; name: string; fullPath: string; file?: (cb: (f: File) => void, err: (e: unknown) => void) => void; createReader?: () => { readEntries: (cb: (e: Entry[]) => void, err: (e: unknown) => void) => void } };

async function walk(entry: Entry, out: LocalFile[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const f = await new Promise<File>((res, rej) => entry.file!(res, rej));
    const rel = entry.fullPath.replace(/^\/+/, "") || f.name;
    if (!isSystemJunk(rel)) out.push({ blob: f, relativePath: rel, lastModified: f.lastModified, mime: f.type || null });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise<Entry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walk(e, out);
    }
  }
}

/** Húzott elemek (fájlok és teljes mappák) – a böngésző mappabejáró felületével. */
export async function fromDrop(dt: DataTransfer): Promise<LocalFile[]> {
  const items = Array.from(dt.items ?? []);
  const entries = items.map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.() ?? null);
  if (!entries.some(Boolean)) return fromInput(dt.files);
  const out: LocalFile[] = [];
  for (const e of entries) if (e) await walk(e, out);
  return out;
}

export function supportsFolderPicker(): boolean {
  if (typeof document === "undefined") return false;
  const i = document.createElement("input");
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return !ios && "webkitdirectory" in i;
}
