export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ---------------------------------------------------------------------------
// CSRF token cache
// ---------------------------------------------------------------------------
// Mirrors the cache in lib/api-client-react/src/custom-fetch.ts for raw
// fetch() call-sites that don't go through the generated Orval hooks.
// Both caches are session-scoped and reset on logout (see resetCsrf below).

let _csrfToken: string | null = null;
let _csrfInflight: Promise<string> | null = null;

async function getCsrf(): Promise<string> {
  if (_csrfToken) return _csrfToken;
  if (_csrfInflight) return _csrfInflight;
  _csrfInflight = fetch(`${BASE}/api/csrf-token`, { credentials: "include" })
    .then((r) => r.json())
    .then((d: { token: string }) => {
      _csrfToken = d.token;
      _csrfInflight = null;
      return _csrfToken!;
    })
    .catch((err) => {
      _csrfInflight = null;
      throw err;
    });
  return _csrfInflight;
}

/** Clear the cached token — call on logout or after a 403. */
export function resetCsrf(): void {
  _csrfToken = null;
  _csrfInflight = null;
}

// ---------------------------------------------------------------------------
// apiFetch — drop-in fetch() wrapper that injects x-csrf-token on mutations
// ---------------------------------------------------------------------------
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Wrapper around fetch() that automatically attaches the x-csrf-token header
 * on state-changing requests (POST / PUT / PATCH / DELETE).
 *
 * Use this instead of bare fetch() for any call that modifies server state.
 * Read-only requests (GET, HEAD) can use plain fetch() unchanged.
 */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const isMutating = MUTATING.has(method);
  const headers = new Headers(init.headers);
  if (isMutating) {
    try {
      headers.set("x-csrf-token", await getCsrf());
    } catch {
      // Token fetch failed — request will proceed without it and the server
      // will return 403. resetCsrf() is called so the next attempt re-fetches.
      resetCsrf();
    }
  }
  const response = await fetch(url, { ...init, headers, credentials: "include" });

  // A stale/mismatched CSRF token (e.g. a cached token from a rotated
  // session, or a server restart) surfaces as a 403. Self-heal by fetching
  // a fresh token and retrying once, transparently, instead of surfacing
  // the error to the user.
  if (isMutating && response.status === 403) {
    resetCsrf();
    const retryHeaders = new Headers(init.headers);
    try {
      retryHeaders.set("x-csrf-token", await getCsrf());
      return fetch(url, { ...init, headers: retryHeaders, credentials: "include" });
    } catch {
      return response;
    }
  }

  return response;
}
