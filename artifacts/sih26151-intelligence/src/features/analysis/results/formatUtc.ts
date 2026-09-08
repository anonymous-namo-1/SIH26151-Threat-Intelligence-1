export function formatUtc(value: unknown, dateOnly = false): string {
  if (typeof value !== "string" || !value) return "Not supplied";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Invalid timestamp";
  const iso = date.toISOString();
  return dateOnly ? iso.slice(0, 10) : `${iso.slice(0, 19).replace("T", " ")} UTC`;
}