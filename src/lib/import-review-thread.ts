const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only explicit thread identifiers; names and subjects are never identifiers. */
export function importReviewThreadId(review: { kind: string; title: string; details: Record<string, unknown> | null }) {
  if (review.kind !== 'email_thread') return null;
  for (const value of [review.details?.szal_id, review.details?.szal, review.title]) {
    if (typeof value === 'string' && UUID.test(value)) return value;
  }
  return null;
}