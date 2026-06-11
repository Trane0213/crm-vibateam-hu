import { useState } from "react";
import {
  Download, FileText, Image as ImageIcon, FileSpreadsheet, FileArchive,
  Paperclip, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

function fmtBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function pickIcon(mime: string | null | undefined, filename: string) {
  const m = (mime ?? "").toLowerCase();
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (m.startsWith("image/")) return { Icon: ImageIcon, tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" };
  if (m.includes("sheet") || m.includes("excel") || m.includes("csv") || ["xls","xlsx","csv","numbers"].includes(ext))
    return { Icon: FileSpreadsheet, tone: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30" };
  if (m.includes("zip") || m.includes("rar") || m.includes("compressed") || m.includes("tar") || ["zip","rar","7z","tar","gz"].includes(ext))
    return { Icon: FileArchive, tone: "text-amber-700 bg-amber-50 dark:bg-amber-950/30" };
  if (m.includes("pdf") || ext === "pdf")
    return { Icon: FileText, tone: "text-red-600 bg-red-50 dark:bg-red-950/30" };
  if (m.includes("word") || m.includes("document") || ["doc","docx","rtf","odt"].includes(ext))
    return { Icon: FileText, tone: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" };
  if (m.startsWith("text/"))
    return { Icon: FileText, tone: "text-slate-600 bg-slate-50 dark:bg-slate-900/40" };
  return { Icon: Paperclip, tone: "text-muted-foreground bg-muted/40" };
}

export function AttachmentGrid({
  attachments,
  urlByKey,
  onDownload,
}: {
  attachments: any[];
  urlByKey: Map<string, string>;
  onDownload: (key: string, filename: string) => void;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);

  if (attachments.length === 0) return null;

  // Lightbox csak képekre
  const images = attachments.filter((a) => (a.mime_type ?? "").toLowerCase().startsWith("image/"));
  const openLightbox = (att: any) => {
    const i = images.findIndex((x) => x.id === att.id);
    if (i >= 0) setLightbox(i);
  };
  const close = () => setLightbox(null);
  const next = () => setLightbox((i) => (i == null ? null : (i + 1) % images.length));
  const prev = () => setLightbox((i) => (i == null ? null : (i - 1 + images.length) % images.length));

  return (
    <div className="border-t bg-muted/10 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Paperclip className="h-3 w-3" />
        {attachments.length} csatolmány
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {attachments.map((a) => {
          const isImg = (a.mime_type ?? "").toLowerCase().startsWith("image/");
          const thumbUrl = a.r2_key ? urlByKey.get(a.r2_key) : undefined;
          const { Icon, tone } = pickIcon(a.mime_type, a.filename ?? "");
          return (
            <div
              key={a.id}
              className="group relative flex items-stretch gap-2 rounded-lg border bg-background hover:border-primary/40 hover:shadow-sm transition-all overflow-hidden"
            >
              <button
                type="button"
                onClick={() => (isImg && thumbUrl ? openLightbox(a) : onDownload(a.r2_key, a.filename))}
                className="flex items-stretch gap-2 flex-1 min-w-0 text-left"
                title={isImg ? "Megnyitás" : "Letöltés"}
              >
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center ${tone}`}>
                  {isImg && thumbUrl ? (
                    <img src={thumbUrl} alt={a.filename} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Icon className="h-6 w-6" />
                  )}
                </div>
                <div className="min-w-0 flex-1 py-1.5 pr-1">
                  <div className="truncate text-[13px] font-medium text-foreground">{a.filename}</div>
                  <div className="truncate text-[11px] text-muted-foreground tabular-nums">
                    {fmtBytes(a.size_bytes)}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onDownload(a.r2_key, a.filename)}
                className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-background shadow-sm transition-opacity"
                title="Letöltés"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <Dialog open={lightbox != null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-5xl bg-black/95 border-0 p-0" onKeyDown={(e) => {
          if (e.key === "ArrowRight") next();
          if (e.key === "ArrowLeft") prev();
        }}>
          {lightbox != null && images[lightbox] && (
            <div className="relative flex items-center justify-center min-h-[60vh]">
              <img
                src={urlByKey.get(images[lightbox].r2_key) ?? ""}
                alt={images[lightbox].filename}
                className="max-h-[85vh] max-w-full object-contain"
              />
              <button
                type="button"
                onClick={close}
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                title="Bezárás"
              >
                <X className="h-4 w-4" />
              </button>
              {images.length > 1 && (
                <>
                  <button type="button" onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1 text-xs text-white">
                {images[lightbox].filename}
                {images.length > 1 && <span className="ml-2 opacity-70">{lightbox + 1} / {images.length}</span>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}