/** Never send a cut JSON fragment to the model or imply complete oversized data. */
export function modelToolPayload(payload: unknown, limit = 24000): string {
  const serialized = JSON.stringify(payload);
  if (serialized.length <= limit) return serialized;
  return JSON.stringify({ ok: false, incomplete: true, reason: "tool_payload_too_large", message: "A lekérdezés eredménye túl nagy; ebből nem állítható teljes helyzetkép. Kérj kisebb oldalt vagy szűkebb rekordot.", returned_records: 0 });
}