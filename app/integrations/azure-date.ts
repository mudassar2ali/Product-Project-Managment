export function formatAzureDate(value: string | null): string {
  if (!value) return "Not yet synced";
  const normalized = value.replace(" ", "T");
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}
