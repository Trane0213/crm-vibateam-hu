/**
 * Page summary — egy `website_page_versions` sorhoz készít `website_page_summaries`
 * rekordot (unique key: page_version_id).
 */

import { getAdminClient } from "@/integrations/supabase/server";
import { callWkAi, safeParseJson, WK_MODEL } from "./client.server";
import { SUMMARY_SYSTEM_PROMPT, buildSummaryUserPrompt } from "./prompts";

interface SummaryJson {
  summary?: string;
  topic?: string;
  audience?: string;
  key_points?: string[];
  tone?: string;
}

export interface SummarizeInput {
  run_id: string;
  page_id: string;
  page_version_id: string;
  url: string;
  title: string | null;
  rendered_text: string;
}

export interface SummarizeResult {
  status: "success" | "failed" | "skipped";
  ai_job_id?: string;
  summary_id?: string;
  error?: string;
}

export async function summarizePageVersion(
  input: SummarizeInput,
): Promise<SummarizeResult> {
  if (!input.rendered_text || input.rendered_text.trim().length < 40) {
    return { status: "skipped", error: "text too short" };
  }
  const admin = getAdminClient();

  const { data: existing } = await admin
    .from("website_page_summaries")
    .select("id")
    .eq("page_version_id", input.page_version_id)
    .maybeSingle();
  if (existing) {
    return { status: "skipped", summary_id: existing.id as string };
  }

  const call = await callWkAi({
    kind: "summary",
    run_id: input.run_id,
    page_id: input.page_id,
    page_version_id: input.page_version_id,
    system: SUMMARY_SYSTEM_PROMPT,
    user: buildSummaryUserPrompt({
      url: input.url,
      title: input.title,
      text: input.rendered_text,
    }),
  });

  if (call.status === "failed") {
    return {
      status: "failed",
      ai_job_id: call.ai_job_id,
      error: call.error_message ?? "ai call failed",
    };
  }

  const parsed = safeParseJson<SummaryJson>(call.text) ?? {};
  const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 4_000) : null;

  const { data: inserted, error: insErr } = await admin
    .from("website_page_summaries")
    .insert({
      page_id: input.page_id,
      page_version_id: input.page_version_id,
      summary,
      summary_json: {
        topic: parsed.topic ?? null,
        audience: parsed.audience ?? null,
        key_points: Array.isArray(parsed.key_points) ? parsed.key_points.slice(0, 10) : [],
        tone: parsed.tone ?? null,
        raw_length: call.text.length,
      },
      model: WK_MODEL,
      ai_job_id: call.ai_job_id,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return {
      status: "failed",
      ai_job_id: call.ai_job_id,
      error: `summaries insert: ${insErr?.message ?? "no row"}`,
    };
  }
  return {
    status: "success",
    ai_job_id: call.ai_job_id,
    summary_id: inserted.id as string,
  };
}