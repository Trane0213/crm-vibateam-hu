/**
 * Egyszerű soralapú diff a WK verzió-összehasonlításhoz.
 * Közös prefix/suffix vágás után remove → add szekvencia.
 */

export type DiffOp = "add" | "remove" | "equal";

export interface DiffLine {
  op: DiffOp;
  text: string;
}

export interface DiffResult {
  lines: DiffLine[];
  added_lines: number;
  removed_lines: number;
}

function splitLines(s: string): string[] {
  return s.replace(/\r\n/g, "\n").split("\n");
}

export function simpleLineDiff(before: string, after: string): DiffResult {
  const a = splitLines(before);
  const b = splitLines(after);

  let start = 0;
  const minLen = Math.min(a.length, b.length);
  while (start < minLen && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const lines: DiffLine[] = [];
  for (let i = 0; i < start; i++) lines.push({ op: "equal", text: a[i] });
  let removed = 0;
  let added = 0;
  for (let i = start; i <= endA; i++) {
    lines.push({ op: "remove", text: a[i] });
    removed++;
  }
  for (let i = start; i <= endB; i++) {
    lines.push({ op: "add", text: b[i] });
    added++;
  }
  for (let i = endA + 1; i < a.length; i++) lines.push({ op: "equal", text: a[i] });

  return { lines, added_lines: added, removed_lines: removed };
}

export function summarizeDiff(diff: DiffResult): string {
  if (diff.added_lines === 0 && diff.removed_lines === 0) return "no textual change";
  return `+${diff.added_lines} / -${diff.removed_lines} lines`;
}