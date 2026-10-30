import { createFileRoute } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen } from "lucide-react";
// A súgó maga a teljes marketinges kézikönyv — egyetlen forrás, nincs rövidített másolat.
import manual from "../../../docs/manuals/marketing-kezikonyv-v1.0-2026-10-30.md?raw";

export const Route = createFileRoute("/_authenticated/help/marketing")({
  head: () => ({ meta: [{ title: "Marketing súgó – VIBA CRM" }] }),
  component: MarketingHelpPage,
});

function MarketingHelpPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" /> Marketing súgó — teljes munkatársi kézikönyv
      </div>
      <article
        className="space-y-3 text-sm leading-relaxed text-foreground
          [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-1 [&_h2]:text-xl [&_h2]:font-semibold
          [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:mt-4 [&_h4]:font-semibold
          [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1
          [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-xs
          [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left
          [&_td]:border [&_td]:border-border [&_td]:p-2 [&_td]:align-top [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
          [&_hr]:my-6 [&_hr]:border-border"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{manual}</ReactMarkdown>
      </article>
    </div>
  );
}
