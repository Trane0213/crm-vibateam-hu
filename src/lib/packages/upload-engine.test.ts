import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { planParts, partRange, MiB, type RegisterResult } from "./package-policy";
import { DirectBlocked, uploadFiles, type LocalFile, type Transport } from "./upload-engine";

/** Memóriabeli „szerver + R2”: darab-ETag = MD5, regisztráció ujjlenyomat+SHA szerint, lezáráskor összevetés. */
function fakeServer(opts: { directBlocked?: boolean; failPutsAfter?: number; corruptPart?: number } = {}) {
  const files = new Map<string, { path: string; size: number; sha: string; fp: string; partSize: number; partCount: number; parts: Map<number, { md5: string; size: number; etag: string }>; verified: boolean }>();
  let puts = 0, relays = 0, completes = 0; let seq = 0;
  const md5 = (b: Uint8Array) => createHash("md5").update(b).digest("hex");
  const store = async (fileId: string, n: number, body: Blob) => {
    puts++;
    if (opts.failPutsAfter !== undefined && puts > opts.failPutsAfter) throw new TypeError("Failed to fetch");
    const bytes = new Uint8Array(await body.arrayBuffer());
    const f = files.get(fileId)!;
    const etag = opts.corruptPart === n && !f.parts.has(-n) ? (f.parts.set(-n, { md5: "", size: 0, etag: "" }), "0".repeat(32)) : md5(bytes);
    f.parts.set(n, { ...(f.parts.get(n) ?? { md5: "", size: 0 }), etag, size: bytes.length });
  };
  const t: Transport = {
    async register(list) {
      return list.map((x): RegisterResult => {
        const fp = `${x.relativePath}|${x.size}|${x.lastModified}`;
        const same = [...files.entries()].find(([, f]) => f.fp === fp && f.sha === x.sha256);
        if (same) {
          const [id, f] = same;
          if (f.verified) return { relativePath: x.relativePath, action: "verified", fileId: id };
          const done = [...f.parts.entries()].filter(([n, p]) => n > 0 && p.md5 && p.md5 === p.etag).map(([n]) => n);
          return { relativePath: x.relativePath, action: "resume", fileId: id, partSize: f.partSize, partCount: f.partCount, doneParts: done };
        }
        const dup = [...files.entries()].find(([, f]) => f.sha === x.sha256);
        if (dup) return { relativePath: x.relativePath, action: "duplicate", fileId: `dup-${++seq}`, ofPath: dup[1].path };
        const { partSize, partCount } = planParts(x.size);
        const id = `f${++seq}`;
        files.set(id, { path: x.relativePath, size: x.size, sha: x.sha256, fp, partSize, partCount, parts: new Map(), verified: false });
        return { relativePath: x.relativePath, action: "upload", fileId: id, partSize, partCount, doneParts: [] };
      });
    },
    async sign(fileId, parts) { return parts.map((n) => ({ partNumber: n, url: `${fileId}#${n}` })); },
    async putDirect(url, body) { if (opts.directBlocked) throw new DirectBlocked(); const [id, n] = url.split("#"); await store(id, Number(n), body); },
    async relay(fileId, n, m, body) { relays++; await store(fileId, n, body); const p = files.get(fileId)!.parts.get(n)!; if (p.etag !== m && opts.corruptPart !== n) throw new Error("integrity"); },
    async record(fileId, parts) { const f = files.get(fileId)!; for (const p of parts) f.parts.set(p.partNumber, { ...(f.parts.get(p.partNumber) ?? { etag: "", size: 0 }), md5: p.md5, size: p.size }); },
    async complete(fileId) {
      completes++;
      const f = files.get(fileId)!; const bad: number[] = [];
      for (let n = 1; n <= f.partCount; n++) { const p = f.parts.get(n); const r = partRange(f.size, f.partSize, n); if (!p || p.md5 !== p.etag || p.size !== r.end - r.start) bad.push(n); }
      if (bad.length) { for (const n of bad) f.parts.delete(n); return { ok: false, badParts: bad }; }
      f.verified = true; return { ok: true };
    },
  };
  return { t, files, stats: () => ({ puts, relays, completes }) };
}

const blob = (size: number, seed: number) => { const b = new Uint8Array(size); for (let i = 0; i < size; i += 4096) b[i] = (i / 4096 + seed) & 255; return new Blob([b]); };
const local = (path: string, size: number, seed = 1): LocalFile => ({ blob: blob(size, seed), relativePath: path, lastModified: 1000 + seed, mime: null });

describe("feltöltőmotor", () => {
  it("mappás csomag: minden fájl ellenőrzötten feltöltve, útvonalak megmaradnak", async () => {
    const s = fakeServer();
    const out = await uploadFiles([local("Terv/E/EL-01.pdf", 40 * MiB, 1), local("Terv/költségvetés.xlsx", 3 * MiB, 2)], { transport: s.t, backoffMs: 1 });
    expect(out.map((o) => [o.relativePath, o.state])).toEqual([["Terv/E/EL-01.pdf", "verified"], ["Terv/költségvetés.xlsx", "verified"]]);
    expect([...s.files.values()].map((f) => f.path)).toEqual(["Terv/E/EL-01.pdf", "Terv/költségvetés.xlsx"]);
  });

  it("megszakítás után új munkamenetből csak a hiányzó darabok mennek fel", async () => {
    const s = fakeServer({ failPutsAfter: 2 });
    const f = local("nagy.pdf", 80 * MiB, 3); // 5 darab
    const first = await uploadFiles([f], { transport: s.t, maxAttempts: 1, concurrency: 1, backoffMs: 1 });
    expect(first[0].state).toBe("failed");
    const s2 = { ...s.t, putDirect: async (url: string, body: Blob) => { const [id, n] = url.split("#"); const p = s.files.get(id)!; p.parts.set(Number(n), { ...(p.parts.get(Number(n)) ?? { md5: "", size: 0 }), etag: createHash("md5").update(new Uint8Array(await body.arrayBuffer())).digest("hex"), size: body.size }); } };
    let sentParts = 0;
    const again = await uploadFiles([{ ...f }], { transport: { ...s2, record: async (id, parts) => { sentParts += parts.length; await s.t.record(id, parts); } }, backoffMs: 1 });
    expect(again[0]).toMatchObject({ state: "verified", resumedParts: 2 });
    expect(sentParts).toBe(3);
  });

  it("már kész fájl folytatáskor nem töltődik fel újra; azonos tartalom más útvonalon duplikátum", async () => {
    const s = fakeServer();
    const f = local("a.pdf", 6 * MiB, 4);
    await uploadFiles([f], { transport: s.t });
    const putsBefore = s.stats().puts;
    const out = await uploadFiles([f, { ...f, relativePath: "másolat/a.pdf" }], { transport: s.t });
    expect(out.map((o) => o.state)).toEqual(["already", "duplicate"]);
    expect(s.stats().puts).toBe(putsBefore);
  });

  it("ha a tárhely a közvetlen írást nem engedi, a szerveres tartalék úton megy tovább", async () => {
    const s = fakeServer({ directBlocked: true });
    const modes: string[] = [];
    const out = await uploadFiles([local("x.pdf", 20 * MiB, 5)], { transport: s.t, onEvent: (e) => { if (e.type === "mode") modes.push(e.mode); } });
    expect(out[0].state).toBe("verified");
    expect(modes).toEqual(["relay"]);
    expect(s.stats().relays).toBe(2);
  });

  it("eltérő darab-ellenőrzőösszeg esetén csak az a darab megy újra, utána ellenőrzött", async () => {
    const s = fakeServer({ corruptPart: 2 });
    const out = await uploadFiles([local("y.pdf", 40 * MiB, 6)], { transport: s.t });
    expect(out[0].state).toBe("verified");
    expect(s.stats().completes).toBe(2);
  });

  it("megszakítás (Mégse) azonnal leállít", async () => {
    const s = fakeServer();
    const ac = new AbortController(); ac.abort();
    await expect(uploadFiles([local("z.pdf", 5 * MiB, 7)], { transport: s.t, signal: ac.signal })).rejects.toThrow("aborted");
  });
});
