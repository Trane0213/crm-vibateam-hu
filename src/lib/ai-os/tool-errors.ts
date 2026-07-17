/**
 * AI OS — egységes tool-hibakezelési szabvány.
 *
 * Minden AI OS tool ezt a formátumot adja vissza hiba esetén:
 *   { ok: false, error: ToolError }
 *
 * A runtime a `retriable` flag alapján dönt automatikus újrapróbálásról.
 * Az LLM kontextusába csak a `user_safe_message`, `error_type`, `hint`
 * kerül — a `technical_reason` audit-only.
 *
 * Kulcsszabály: a `user_safe_message` szövegében TILOS olyan mondat,
 * amely az egész integráció állapotára vonatkozó végkövetkeztetést
 * sugall (pl. "nincs Google Ads kapcsolat"). Ilyen állítást csak az
 * explicit `list_ads_accounts` sikeres üres eredménye alapoz meg.
 */

export type ErrorType =
  | "CONNECTION_MISSING"
  | "CONNECTION_READ_FAILED"
  | "AUTH_EXPIRED"
  | "CONFIG_MISSING"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_RATE_LIMIT"
  | "UPSTREAM_FORBIDDEN"
  | "UPSTREAM_ERROR"
  | "INTERNAL";

export type ToolError = {
  error_type: ErrorType;
  retriable: boolean;
  user_safe_message: string;
  technical_reason: string;
  http_status?: number;
  hint?: string;
};

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ToolError };

/** Retriable flag a taxonómiából. Nincs adapter-szintű döntés. */
const RETRIABLE: Record<ErrorType, boolean> = {
  CONNECTION_MISSING: false,
  CONNECTION_READ_FAILED: true,
  AUTH_EXPIRED: false,
  CONFIG_MISSING: false,
  INVALID_INPUT: false,
  NOT_FOUND: false,
  UPSTREAM_UNAVAILABLE: true,
  UPSTREAM_RATE_LIMIT: true,
  UPSTREAM_FORBIDDEN: false,
  UPSTREAM_ERROR: false,
  INTERNAL: false,
};

/** Alapértelmezett magyar user-safe üzenetek. */
const DEFAULT_USER_MSG: Record<ErrorType, string> = {
  CONNECTION_MISSING:
    "Ehhez a művelethez még nincs csatlakoztatva a kért integráció.",
  CONNECTION_READ_FAILED:
    "Az integráció adatainak olvasása most sikertelen volt.",
  AUTH_EXPIRED:
    "A hozzáférési token lejárt vagy hiányzik — újra kell csatlakoztatni a fiókot.",
  CONFIG_MISSING:
    "Egy szükséges konfigurációs érték hiányzik.",
  INVALID_INPUT:
    "A megadott paraméterek nem felelnek meg a tool követelményeinek.",
  NOT_FOUND:
    "A kért elem nem található.",
  UPSTREAM_UNAVAILABLE:
    "A külső szolgáltatás jelenleg nem elérhető.",
  UPSTREAM_RATE_LIMIT:
    "A külső szolgáltatás rate-limitet ért el — várni kell néhány másodpercet.",
  UPSTREAM_FORBIDDEN:
    "A külső szolgáltatás elutasította a kérést jogosultsági okból.",
  UPSTREAM_ERROR:
    "A külső szolgáltatás hibaüzenettel válaszolt.",
  INTERNAL:
    "Váratlan belső hiba történt a tool végrehajtása közben.",
};

/**
 * Speciális Error alosztály — a `client.server.ts`-ből dobjuk, és a
 * `fromException` felismeri, 1:1-ben átemeli az `error_type` mezőt.
 */
export class ToolFailure extends Error {
  readonly error_type: ErrorType;
  readonly http_status?: number;
  readonly user_safe_message?: string;
  readonly hint?: string;
  constructor(opts: {
    error_type: ErrorType;
    technical_reason: string;
    http_status?: number;
    user_safe_message?: string;
    hint?: string;
  }) {
    super(opts.technical_reason);
    this.name = "ToolFailure";
    this.error_type = opts.error_type;
    this.http_status = opts.http_status;
    this.user_safe_message = opts.user_safe_message;
    this.hint = opts.hint;
  }
}

function make(
  error_type: ErrorType,
  technical_reason: string,
  extra?: { user_safe_message?: string; http_status?: number; hint?: string },
): { ok: false; error: ToolError } {
  return {
    ok: false,
    error: {
      error_type,
      retriable: RETRIABLE[error_type],
      user_safe_message: extra?.user_safe_message ?? DEFAULT_USER_MSG[error_type],
      technical_reason,
      http_status: extra?.http_status,
      hint: extra?.hint,
    },
  };
}

/** Postgrest/Supabase error shape felismerés (duck-typed). */
function isSupabaseError(v: unknown): v is { message?: string; code?: string; details?: string } {
  return typeof v === "object" && v !== null &&
    ("code" in v || "details" in v || "hint" in v) &&
    "message" in v;
}

/**
 * HTTP status parsolása szöveges hibaüzenetből (pl. "googleAds:search HTTP 429: quota").
 */
function parseHttpStatus(msg: string): number | undefined {
  const m = msg.match(/HTTP\s+(\d{3})/i);
  return m ? Number(m[1]) : undefined;
}

function classifyByMessage(message: string): ErrorType | null {
  const s = message.toLowerCase();
  // Ismert magyar szentinel üzenetek a client.server-ből (legacy path — új kód dobjon ToolFailure-t).
  if (s.includes("nincs mentett") && s.includes("google ads")) return "CONNECTION_MISSING";
  if (s.includes("refresh token hiányzik")) return "AUTH_EXPIRED";
  if (s.includes("developer_token") && s.includes("hiányzik")) return "CONFIG_MISSING";
  if (s.includes("nincs aktív") && s.includes("customer")) return "CONFIG_MISSING";
  // Fetch / hálózat.
  if (s.includes("fetch failed") || s.includes("network") || s.includes("timeout") || s.includes("aborted")) {
    return "UPSTREAM_UNAVAILABLE";
  }
  // HTTP status.
  const st = parseHttpStatus(message);
  if (st !== undefined) {
    if (st === 401 || st === 407) return "AUTH_EXPIRED";
    if (st === 403) return "UPSTREAM_FORBIDDEN";
    if (st === 404) return "NOT_FOUND";
    if (st === 429) return "UPSTREAM_RATE_LIMIT";
    if (st >= 500) return "UPSTREAM_UNAVAILABLE";
    if (st >= 400) return "UPSTREAM_ERROR";
  }
  return null;
}

/**
 * Központi konstruktorok — az adapterek ezt hívják.
 */
export const toolError = {
  connectionMissing: (technical: string, extra?: { user_safe_message?: string; hint?: string }) =>
    make("CONNECTION_MISSING", technical, extra),
  connectionReadFailed: (technical: string) => make("CONNECTION_READ_FAILED", technical),
  authExpired: (technical: string) => make("AUTH_EXPIRED", technical),
  configMissing: (technical: string) => make("CONFIG_MISSING", technical),
  invalidInput: (technical: string, extra?: { user_safe_message?: string; hint?: string }) =>
    make("INVALID_INPUT", technical, {
      user_safe_message: extra?.user_safe_message ?? technical,
      hint: extra?.hint,
    }),
  notFound: (technical: string) => make("NOT_FOUND", technical),
  upstream: (status: number, technical: string) => {
    const t: ErrorType =
      status === 401 || status === 407 ? "AUTH_EXPIRED" :
      status === 403 ? "UPSTREAM_FORBIDDEN" :
      status === 404 ? "NOT_FOUND" :
      status === 429 ? "UPSTREAM_RATE_LIMIT" :
      status >= 500 ? "UPSTREAM_UNAVAILABLE" :
      status >= 400 ? "UPSTREAM_ERROR" : "UPSTREAM_ERROR";
    return make(t, technical, { http_status: status });
  },
  internal: (technical: string) => make("INTERNAL", technical),

  /**
   * Ismeretlen hiba osztályozása. Az adapter `catch (e) { return toolError.fromException(e); }`
   * mintában használja. Passthrough:
   *  - ToolFailure  → megőrizzük az `error_type`-ot
   *  - string       → INVALID_INPUT (feltételezés: adapter validation)
   *  - Supabase err → CONNECTION_READ_FAILED
   *  - Error/HTTP   → message alapján osztályozzuk
   *  - egyéb        → INTERNAL
   */
  fromException: (err: unknown): { ok: false; error: ToolError } => {
    if (err instanceof ToolFailure) {
      return make(err.error_type, err.message, {
        user_safe_message: err.user_safe_message,
        http_status: err.http_status,
        hint: err.hint,
      });
    }
    if (typeof err === "string") {
      // A régi `fail("Add meg...")` mintázat — validációs üzenet.
      return make("INVALID_INPUT", err, { user_safe_message: err });
    }
    if (isSupabaseError(err)) {
      const detail = [err.message, err.details].filter(Boolean).join(" — ");
      return make("CONNECTION_READ_FAILED", detail || "supabase hiba");
    }
    if (err instanceof Error) {
      const cls = classifyByMessage(err.message);
      if (cls) {
        return make(cls, err.message, { http_status: parseHttpStatus(err.message) });
      }
      return make("INTERNAL", err.message);
    }
    return make("INTERNAL", String(err));
  },
};

/**
 * A runtime ezt hívja, mielőtt a hibát átadja az LLM-nek. A
 * `technical_reason` NEM megy át — így a modell nem tud upstream nyers
 * szövegeket "megtanulni" és idézni.
 */
export function sanitizeErrorForLlm(err: ToolError): {
  error_type: ErrorType;
  user_safe_message: string;
  retriable: boolean;
  hint?: string;
} {
  return {
    error_type: err.error_type,
    user_safe_message: err.user_safe_message,
    retriable: err.retriable,
    ...(err.hint ? { hint: err.hint } : {}),
  };
}

/** Duck-check: adapter válasz-e strukturált hiba. */
export function isToolErrorEnvelope(
  v: unknown,
): v is { ok: false; error: ToolError } {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.ok !== false) return false;
  const e = o.error as Record<string, unknown> | undefined;
  return !!e && typeof e === "object" && typeof e.error_type === "string" &&
    typeof e.retriable === "boolean" && typeof e.user_safe_message === "string";
}
