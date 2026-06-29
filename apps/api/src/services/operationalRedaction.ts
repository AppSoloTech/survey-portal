export function sanitizeOperationalRecord(value: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeOperationalValue(value);

  return isPlainRecord(sanitized) ? sanitized : {};
}

export function sanitizeOperationalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeOperationalValue(item));
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        isSensitiveOperationalKey(key) ? "[redacted]" : sanitizeOperationalValue(nestedValue)
      ])
    );
  }

  if (typeof value === "string") {
    return sanitizeOperationalString(value);
  }

  return value;
}

export function sanitizeOperationalMarkdown(value: string | null): string | null {
  return value === null ? null : sanitizeOperationalString(value);
}

export function sanitizeOperationalString(value: string): string {
  return value
    .replace(/(https?:\/\/)[^/\s:@]+:[^@\s/]+@/gi, "$1[redacted]@")
    .replace(/postgres(?:ql)?:\/\/[^\s)]+/gi, "[redacted-postgres-url]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /"?\b(password|token|secret|cookie|csrf|authorization|connection_string|connectionString|database_url|databaseUrl|db_url|dbUrl|api_key|apiKey|apikey|accessToken|access_token|bearer)"?\s*[:=]\s*"?[^"\s,;)\]}]+"?/gi,
      "$1=[redacted]"
    );
}

function isSensitiveOperationalKey(key: string): boolean {
  return /(password|token|secret|cookie|csrf|authorization|connectionstring|databaseurl|dburl|connection_string|database_url|db_url|apikey|api_key|accesskey|bearer)/i.test(
    key
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
