import { z } from 'zod';

/** Only user-reference filters accept me; entity IDs never do. */
export function userReference(value: unknown, userId: string): string | undefined {
  if (value === undefined) return undefined;
  if (value === 'me') return z.string().uuid().parse(userId);
  return z.string().uuid().parse(value);
}

export function readTimestamp(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return z.string().datetime({ offset: true }).parse(value);
}