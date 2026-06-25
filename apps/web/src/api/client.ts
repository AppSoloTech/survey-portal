interface CsrfResponse {
  csrfToken: string;
}

let csrfToken: string | null = null;

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return sendApiRequest<T>(path, init, true);
}

export function resetCsrfTokenCache(): void {
  csrfToken = null;
}

async function sendApiRequest<T>(
  path: string,
  init: RequestInit,
  allowCsrfRetry: boolean
): Promise<T> {
  const headers = new Headers(init.headers);

  headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");

  if (needsCsrfToken(path, init.method)) {
    headers.set("X-CSRF-Token", await getCsrfToken());
  }

  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers
  });

  if (!response.ok) {
    const errorMessage = await readErrorMessage(response);

    if (allowCsrfRetry && isInvalidCsrfResponse(response, errorMessage)) {
      resetCsrfTokenCache();
      return sendApiRequest<T>(path, init, false);
    }

    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function getCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  const response = await fetch("/api/auth/csrf", {
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const body = (await response.json()) as CsrfResponse;
  csrfToken = body.csrfToken;

  return csrfToken;
}

function needsCsrfToken(path: string, method = "GET"): boolean {
  const normalizedMethod = method.toUpperCase();

  return (
    !["GET", "HEAD", "OPTIONS"].includes(normalizedMethod) &&
    !path.startsWith("/api/anonymous-surveys/")
  );
}

function isInvalidCsrfResponse(response: Response, errorMessage: string): boolean {
  return response.status === 403 && errorMessage === "CSRF token is invalid or missing";
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : "Request failed";
  } catch {
    return "Request failed";
  }
}
