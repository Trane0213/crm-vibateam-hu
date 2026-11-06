/** Preserve acknowledged identity and stop after ambiguous writes; no durable concurrency claim. */
export type IntakeProgress = { companyId: string | null; started: boolean };
export async function saveIntakeOnce(progress: IntakeProgress, createCompany: () => Promise<string>, createContact: (id: string) => Promise<void>, audit: (id: string) => Promise<void>) {
  if (progress.started) throw new Error('A korábbi felvétel eredményét ellenőrizd; automatikus ismétlés nem engedélyezett.');
  progress.started = true;
  const id = await createCompany();
  progress.companyId = id;
  await createContact(id);
  await audit(id);
  return id;
}