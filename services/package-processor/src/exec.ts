import { execFile } from "node:child_process";

/** Külső eszköz futtatása időkorláttal és kimeneti korláttal (shell nélkül). */
export function run(cmd: string, args: string[], opts: { timeoutMs?: number; maxBuffer?: number; encoding?: "utf8" | "buffer" } = {}): Promise<{ stdout: any; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: opts.timeoutMs ?? 120_000, maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024, encoding: (opts.encoding ?? "utf8") as any }, (err, stdout, stderr) => {
      if (err) { (err as any).stderr = String(stderr ?? ""); reject(err); } else resolve({ stdout, stderr: String(stderr ?? "") });
    });
  });
}
