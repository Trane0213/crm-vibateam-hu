import { z } from "zod";
export const ISSUE_STATUS = { new: "Új", investigating: "Vizsgálat alatt", awaiting_fix: "Javításra vár", checking: "Ellenőrzés alatt", closed: "Lezárt", usage_question: "Használati kérdés / más besorolás" } as const;
export const ISSUE_CATEGORY = { usage: "Használati kérdés", bug: "Működési hiba", ux: "UX / használhatósági probléma", feature: "Fejlesztési igény" } as const;
export type IssueCategory = keyof typeof ISSUE_CATEGORY;
export const ISSUE_SPECIALIST = { george: "George (koordinátor)", scarlet: "Scarlet (Marketing)", timothy: "Timothy (Sales)", boss: "Boss (Projektek)" } as const;
export type IssueSpecialist = keyof typeof ISSUE_SPECIALIST;
export const ISSUE_EVIDENCE = { proven: "Igazolt", assumed: "Feltételezés (nem igazolt)", not_examinable: "Nem vizsgálható" } as const;
/** All four categories are persisted on the single issue_reports table (category column). */
export function canPersistIssueCategory(category: IssueCategory) { return category in ISSUE_CATEGORY; }
export const AI_REVIEW_LIMIT = 3;
export const issueInput = z.object({ submissionKey: z.string().uuid(), category: z.enum(["usage", "bug", "ux", "feature"]).default("bug"), pagePath: z.string().max(250).regex(/^\/[A-Za-z0-9/_-]*$/), description: z.string().trim().min(1).max(2000), expectedResult: z.string().trim().min(1).max(1000), actualResult: z.string().trim().min(1).max(1000), technicalCode: z.string().max(80).regex(/^[A-Za-z0-9_.:-]*$/).default("") }).strict();
export function issuePath(path: string) { return path.split(/[?#]/)[0].replace(/[^A-Za-z0-9/_-]/g, "").slice(0, 250) || "/"; }

/** George routes each report deterministically to the specialist owning the affected screen. */
export function routeSpecialist(pagePath: string, reporterRole: string): IssueSpecialist {
  const p = pagePath.toLowerCase();
  if (/^\/(campaign|emails|marketing|calls|web-requests|contacts|customers)/.test(p)) return reporterRole === "sales" && /^\/(emails|contacts|customers)/.test(p) ? "timothy" : "scarlet";
  if (/^\/(leads|pipeline|quotes|followups|sales|workspace)/.test(p)) return "timothy";
  if (/^\/(projects|pm|attendance|tasks)/.test(p)) return "boss";
  if (reporterRole === "marketing") return "scarlet";
  if (reporterRole === "sales") return "timothy";
  if (reporterRole === "project_manager" || reporterRole === "pm") return "boss";
  return "george";
}

/** AI text alone is never proof: a model can only claim "assumed" or "not_examinable". */
export function clampAiEvidence(value: unknown): "assumed" | "not_examinable" {
  return value === "not_examinable" ? "not_examinable" : "assumed";
}
