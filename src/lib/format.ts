const HUF = new Intl.NumberFormat("hu-HU", {
  style: "currency",
  currency: "HUF",
  maximumFractionDigits: 0,
});

const DATE = new Intl.DateTimeFormat("hu-HU", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DATETIME = new Intl.DateTimeFormat("hu-HU", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatHuf = (n: number | null | undefined) =>
  n == null ? "—" : HUF.format(n);

export const formatDate = (d: string | Date | null | undefined) =>
  d == null ? "—" : DATE.format(typeof d === "string" ? new Date(d) : d);

export const formatDateTime = (d: string | Date | null | undefined) =>
  d == null ? "—" : DATETIME.format(typeof d === "string" ? new Date(d) : d);