import { z } from "zod";
export const ISSUE_STATUS = { new: "Új", investigating: "Vizsgálat alatt", awaiting_fix: "Javításra vár", checking: "Ellenőrzés alatt", closed: "Lezárt", usage_question: "Használati kérdés / más besorolás" } as const;
export const ISSUE_CATEGORY = { usage: "Használati kérdés", bug: "Működési hiba", ux: "UX / használhatósági probléma", feature: "Fejlesztési igény" } as const;
export type IssueCategory = keyof typeof ISSUE_CATEGORY;
// Only the already authorized legacy bug schema can persist today. Never hide
// new categories inside description/notes to bypass the schema approval gate.
export function canPersistIssueCategory(category: IssueCategory) { return category === "bug"; }
export const issueInput = z.object({ submissionKey: z.string().uuid(), pagePath: z.string().max(250).regex(/^\/[A-Za-z0-9/_-]*$/), description: z.string().trim().min(1).max(2000), expectedResult: z.string().trim().min(1).max(1000), actualResult: z.string().trim().min(1).max(1000), technicalCode: z.string().max(80).regex(/^[A-Za-z0-9_.:-]*$/).default("") }).strict();
export function issuePath(path: string) { return path.split(/[?#]/)[0].replace(/[^A-Za-z0-9/_-]/g, "").slice(0, 250) || "/"; }