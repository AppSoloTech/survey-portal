import { afterEach, describe, expect, it, vi } from "vitest";

import { loginUser, logoutUser } from "./auth.js";
import { apiRequest, resetCsrfTokenCache } from "./client.js";

describe("apiRequest CSRF handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCsrfTokenCache();
  });

  it("clears cached CSRF state on logout so the next login fetches a fresh token", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "first-token" }))
      .mockResolvedValueOnce(noContentResponse())
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "second-token" }))
      .mockResolvedValueOnce(jsonResponse({ user: { id: 1, email: "pat@example.com" } }));

    vi.stubGlobal("fetch", fetchMock);

    await logoutUser();
    await loginUser({ email: "pat@example.com", password: "test-password-123" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/auth/csrf", expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/logout",
      expect.objectContaining({
        headers: expect.any(Headers),
        method: "POST"
      })
    );
    expect(headerValue(fetchMock.mock.calls[1]?.[1], "X-CSRF-Token")).toBe("first-token");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/auth/csrf", expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/auth/login",
      expect.objectContaining({
        headers: expect.any(Headers),
        method: "POST"
      })
    );
    expect(headerValue(fetchMock.mock.calls[3]?.[1], "X-CSRF-Token")).toBe("second-token");
  });

  it("refreshes CSRF once and retries when the cached token is rejected", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "stale-token" }))
      .mockResolvedValueOnce(errorResponse(403, "CSRF token is invalid or missing"))
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest<{ ok: boolean }>("/api/profile", {
        body: JSON.stringify({ firstName: "Pat" }),
        method: "PUT"
      })
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(headerValue(fetchMock.mock.calls[1]?.[1], "X-CSRF-Token")).toBe("stale-token");
    expect(headerValue(fetchMock.mock.calls[3]?.[1], "X-CSRF-Token")).toBe("fresh-token");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200
  });
}

function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

function errorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    headers: { "Content-Type": "application/json" },
    status
  });
}

function headerValue(init: RequestInit | undefined, name: string): string | null {
  return init?.headers instanceof Headers ? init.headers.get(name) : null;
}
