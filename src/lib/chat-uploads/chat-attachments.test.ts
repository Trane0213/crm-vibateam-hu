import { describe, expect, it } from "vitest";
import { agentAcceptsAttachments, attachmentModelText, canDeleteChatUpload, chatLinkTarget, composeModelContent, ownChatFolder, visibleChatFolders } from "./chat-attachments";
import { buildKey, chatFolderOf, checkFile } from "@/lib/r2-policy";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
describe("AI chat-feltöltések — tulajdonosi döntés 2026-11-14", () => {
  it("szerepkörönként külön mappa: Sales, Marketing, Projektvezető, Tulajdonos", () => {
    expect(ownChatFolder("sales")).toBe("sales"); expect(ownChatFolder("marketing")).toBe("marketing");
    expect(ownChatFolder("project_manager")).toBe("pm"); expect(ownChatFolder("owner")).toBe("owner");
    expect(chatFolderOf("pm", false)).toBe("pm"); expect(chatFolderOf("project_manager", false)).toBe("pm");
    expect(chatFolderOf("sales", true)).toBe("owner"); expect(chatFolderOf("user", false)).toBeNull();
  });
  it("az egész szerepkör látja a saját mappáját, a Tulajdonos mindet; más szerepkör mappáját senki más", () => {
    expect(visibleChatFolders("owner")).toEqual(["sales", "marketing", "pm", "owner"]);
    expect(visibleChatFolders("sales")).toEqual(["sales"]); expect(visibleChatFolders("marketing")).toEqual(["marketing"]);
    expect(visibleChatFolders("project_manager")).toEqual(["pm"]); expect(visibleChatFolders(null)).toEqual([]);
  });
  it("törölni a feltöltő vagy a Tulajdonos tud, szerepkörtárs nem", () => {
    const row = { uploaded_by: "U1", folder: "sales" };
    expect(canDeleteChatUpload("sales", "U1", row)).toBe(true); expect(canDeleteChatUpload("sales", "U2", row)).toBe(false);
    expect(canDeleteChatUpload("owner", "X", row)).toBe(true); expect(canDeleteChatUpload("project_manager", "U1", row)).toBe(false);
  });
  it("a tárolási kulcs a szerepkör mappájába és a feltöltő saját útvonalára kerül", () => {
    const key = buildKey({ purpose: "chat", targetId: null, category: "pm", userId: "U1", fileName: "../TESZT fotó.jpg", unique: "abc" });
    expect(key.startsWith("ai-chat-uploads/pm/U1/")).toBe(true); expect(key).not.toContain("..");
    expect(() => buildKey({ purpose: "chat", targetId: null, category: "masik", userId: "U1", fileName: "a.jpg", unique: "x" })).toThrow();
  });
  it("minden ma engedélyezett típus feltölthető, tiltott/álcázott nem", () => {
    for (const n of ["a.jpg", "a.png", "a.pdf", "a.docx", "a.xlsx", "a.heic", "a.dwg"]) expect(checkFile("chat", n, "", 1000)).toBeNull();
    expect(checkFile("chat", "a.exe", "", 1000)).not.toBeNull(); expect(checkFile("chat", "a.pdf", "image/png", 1000)).not.toBeNull();
    expect(checkFile("chat", "a.pdf", "", 51 * 1024 * 1024)).not.toBeNull();
  });
  it("ügyhöz mentés csak projekt/ügyfél/ajánlat oldalon és csak ha a szerepkör oda egyébként is feltölthet", () => {
    expect(chatLinkTarget({ kind: "project", id, label: "Projekt" }, "project_manager")).toEqual({ kind: "project", id });
    expect(chatLinkTarget({ kind: "company", id, label: "Ügyfél" }, "marketing")).toEqual({ kind: "company", id });
    expect(chatLinkTarget({ kind: "project", id, label: "Projekt" }, "marketing")).toBeNull();
    expect(chatLinkTarget({ kind: "quote", id, label: "Ajánlat" }, "marketing")).toBeNull();
    expect(chatLinkTarget({ kind: "lead", id, label: "Lead" }, "owner")).toBeNull(); expect(chatLinkTarget(null, "owner")).toBeNull();
  });
  it("a modell csak azonosítót kap, kulcsot/URL-t nem; Michaelnél nincs csatolás", () => {
    const t = attachmentModelText([{ id, name: "TESZT [x].jpg", folder: "sales", fileKey: "ai-chat-uploads/sales/U1/k.jpg", mime: "image/jpeg", size: 10 }]);
    expect(t).toContain(`document_id=${id}`); expect(t).toContain("ocr=true"); expect(t).not.toContain("ai-chat-uploads/");
    expect(composeModelContent("", "Kérdés", [])).toBeUndefined();
    expect(composeModelContent("[Kontextus]", "Kérdés", [])).toBe("[Kontextus]\n\nKérdés");
    expect(agentAcceptsAttachments("ads")).toBe(false); for (const a of ["crm", "sales", "pm", "marketing"]) expect(agentAcceptsAttachments(a)).toBe(true);
  });
});
