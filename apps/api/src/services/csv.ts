export type CsvFieldValue = string | number | boolean | null;

// RFC 4180-style escaping: fields containing commas, quotes, or line breaks
// are wrapped in double quotes with embedded quotes doubled.
export function escapeCsvField(value: CsvFieldValue): string {
  if (value === null) {
    return "";
  }

  const text = typeof value === "string" ? value : String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function buildCsv(header: string[], rows: CsvFieldValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCsvField).join(","));

  return `${lines.join("\r\n")}\r\n`;
}
