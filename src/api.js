const BASE = "/api";

/** Session is gone or was never established — the UI should show the sign-in screen. */
export class AuthError extends Error {}

/** Any other non-2xx. `payload` may still carry a fresh board (409 conflicts do). */
export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, { method = "GET", body, signal, treat401AsAuth = true } = {}) {
  const res = await fetch(`${BASE}/${path}`, {
    method,
    signal,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response — fall through to the status-based error below */
  }

  if (res.status === 401 && treat401AsAuth) {
    throw new AuthError(data?.error ?? "unauthorized");
  }
  if (!res.ok) {
    const message = data?.message ?? data?.error ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }
  return data;
}

export const api = {
  board: (signal) => request("board.php", { signal }),

  // 401 here means "wrong password", not "session expired", so it must not
  // bounce the user back to a sign-in screen they are already looking at.
  login: (name, password) =>
    request("login.php", {
      method: "POST",
      body: { name, password },
      treat401AsAuth: false,
    }),

  logout: () => request("logout.php", { method: "POST" }),

  claim: (serverId, note, expect) =>
    request("claim.php", { method: "POST", body: { serverId, note, expect } }),

  release: (serverId) =>
    request("release.php", { method: "POST", body: { serverId } }),
};
