import { createServerFn } from "@tanstack/react-start";

export const r2PresignUpload = createServerFn({ method: "POST" })
  .inputValidator((input: { key: string; contentType?: string }) => input)
  .handler(async ({ data }) => {
    const { presignR2Url } = await import("./r2.server");
    const url = presignR2Url({
      method: "PUT",
      key: data.key,
      expiresIn: 900,
      contentType: data.contentType,
    });
    return { url, expiresIn: 900 };
  });

export const r2PresignDownload = createServerFn({ method: "POST" })
  .inputValidator((input: { key: string }) => input)
  .handler(async ({ data }) => {
    const { presignR2Url } = await import("./r2.server");
    const url = presignR2Url({ method: "GET", key: data.key, expiresIn: 900 });
    return { url, expiresIn: 900 };
  });

export const r2DeleteObject = createServerFn({ method: "POST" })
  .inputValidator((input: { key: string }) => input)
  .handler(async ({ data }) => {
    const { presignR2Url } = await import("./r2.server");
    const url = presignR2Url({ method: "DELETE", key: data.key, expiresIn: 60 });
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      throw new Error(`R2 törlés sikertelen (${res.status})`);
    }
    return { ok: true };
  });

export const r2GetStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { r2Status } = await import("./r2.server");
  return r2Status();
});