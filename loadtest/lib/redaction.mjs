const sensitiveKeyPattern =
  /(password|token|secret|cookie|csrf|authorization|connectionstring|connection_string|databaseurl|database_url|dburl|db_url|apikey|api_key|accesskey|accesstoken|access_token|bearer)/i;

export function sanitizeOperationalValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeOperationalValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        isSensitiveOperationalKey(key) ? "[redacted]" : sanitizeOperationalValue(nested)
      ])
    );
  }

  if (typeof value === "string") {
    return sanitizeOperationalString(value);
  }

  return value;
}

export function sanitizeOperationalString(value) {
  return value
    .replace(/(https?:\/\/)[^/\s:@]+:[^@\s/]+@/gi, "$1[redacted]@")
    .replace(/postgres(?:ql)?:\/\/[^\s)]+/gi, "[redacted-postgres-url]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /"?\b(password|token|secret|cookie|csrf|authorization|connection_string|connectionString|database_url|databaseUrl|db_url|dbUrl|api_key|apiKey|apikey|accessToken|access_token|bearer)"?\s*[:=]\s*"?[^"\s,;)\]}]+"?/gi,
      "$1=[redacted]"
    )
    .replace(/asl\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-anonymous-token]");
}

export function assertNoOperationalSecrets(value, label = "value") {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);

  if (containsOperationalSecret(serialized)) {
    throw new Error(`${label} contains a secret-like value and will not be persisted.`);
  }
}

export function containsOperationalSecret(value) {
  return (
    /postgres(?:ql)?:\/\/[^\s)]+/i.test(value) ||
    /\bBearer\s+[A-Za-z0-9._~+/=-]+/i.test(value) ||
    /asl\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value) ||
    /"?\b(password|token|secret|cookie|csrf|authorization|connection_string|connectionString|database_url|databaseUrl|db_url|dbUrl|api_key|apiKey|apikey|accessToken|access_token|bearer)"?\s*[:=]\s*"?(?!\[redacted\])[^"\s,;)\]}]+"?/i.test(
      value
    )
  );
}

export function pickSafeConfig(config) {
  return {
    baseUrl: config.baseUrl,
    devMode: config.devMode,
    profile: config.profile,
    vus: config.vus,
    duration: config.duration,
    appDbPoolMax: config.appDbPoolMax,
    appInstanceCount: config.appInstanceCount,
    sampleIntervalMs: config.sampleIntervalMs,
    persistenceSmoke: config.persistenceSmoke
  };
}

function isSensitiveOperationalKey(key) {
  return sensitiveKeyPattern.test(key);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
