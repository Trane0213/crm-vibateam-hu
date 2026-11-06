import { describe, it, expect } from "vitest";
import { classifyCandidates, type CampaignCandidate } from "./campaign-eligibility";

const C = (id: string, email: string | null, company_id: string | null = "A", extra: Partial<CampaignCandidate> = {}): CampaignCandidate =>
  ({ contact_id: id, company_id, company_name: "Acme", name: id, email, email_invalid: false, ...extra });
const run = (cs: CampaignCandidate[], hits = [] as Parameters<typeof classifyCandidates>[1], hist = [] as Parameters<typeof classifyCandidates>[2], complete = true) =>
  classifyCandidates(cs, hits, hist, { historyComplete: complete });

describe("kampány előtti alkalmasság", () => {
  it("érintetlen, céghez kötött személyes cím → kész", () => {
    expect(run([C("1", "Anna@Acme.hu")])[0]!.status).toBe("ready");
  });
  it("másik céges postafiók kimenő levele is számít", () => {
    const r = run([C("1", "anna@acme.hu")], [{ email: "ANNA@acme.hu", direction: "out", at: "2026-09-01", mailbox: "pretor.laszlo@vibateam.hu" }])[0]!;
    expect(r.status).toBe("contacted");
    expect(r.mailboxes).toEqual(["pretor.laszlo@vibateam.hu"]);
  });
  it("bejövő levél → válasz érkezett", () => {
    expect(run([C("1", "anna@acme.hu")], [{ email: "anna@acme.hu", direction: "out", at: "1", mailbox: "info@vibateam.hu" }, { email: "anna@acme.hu", direction: "in", at: "2", mailbox: "info@vibateam.hu" }])[0]!.status).toBe("replied");
  });
  it("bizonytalan előzmény soha nem kész: hiányos vizsgálat, céghez nem kötött, cégszintű szál", () => {
    expect(run([C("1", "anna@acme.hu")], [], [], false)[0]!.status).toBe("uncertain");
    expect(run([C("1", "anna@acme.hu", null)])[0]!.status).toBe("uncertain");
    expect(run([C("1", "anna@acme.hu")], [], [{ company_id: "A", threads: 3, last_at: null }])[0]!.status).toBe("uncertain");
  });
  it("több kontaktos cég: a megkeresett kolléga miatt a másik is blokkolt", () => {
    const r = run([C("1", "anna@acme.hu"), C("2", "bela@acme.hu")], [{ email: "anna@acme.hu", direction: "out", at: "1", mailbox: "info@vibateam.hu" }]);
    expect(r.map(x => x.status)).toEqual(["contacted", "uncertain"]);
  });
  it("gyűjtőcím → bizonytalan", () => {
    expect(run([C("1", "info@acme.hu")])[0]!.status).toBe("uncertain");
  });
  it("hibás, jelölt-hibás, hiányzó, belső/teszt és duplikált cím → hibás/tiltott", () => {
    const r = run([C("1", "nem-email"), C("2", "x@acme.hu", "A", { email_invalid: true }), C("3", null), C("4", "ramon.dencsi@vibateam.hu"), C("5", "viktor.csotai@gmail.com"), C("6", "z@b.hu", "B"), C("7", "Z@B.hu", "B")]);
    expect(r.map(x => x.status)).toEqual(["invalid", "invalid", "invalid", "invalid", "invalid", "ready", "invalid"]);
  });
});
