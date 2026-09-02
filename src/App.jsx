import { useState, useEffect, useCallback, useRef } from "react";
import {
  Server, LogOut, Clock, User, Hand, CircleCheck,
  Radio, ArrowRightLeft, Loader2, Lock, AlertTriangle,
} from "lucide-react";
import { api, AuthError, ApiError } from "./api";

const POLL_MS = 5000;

function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtClock(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function App() {
  const [board, setBoard] = useState(null);
  const [booting, setBooting] = useState(true);
  const [nameInput, setNameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [now, setNow] = useState(Date.now());

  const signedIn = board !== null;
  const busyRef = useRef(false);
  busyRef.current = busyId !== null;

  /* Restore an existing session on first paint. */
  useEffect(() => {
    const ac = new AbortController();
    api
      .board(ac.signal)
      .then(setBoard)
      .catch(() => {
        /* AuthError just means "not signed in yet" */
      })
      .finally(() => setBooting(false));
    return () => ac.abort();
  }, []);

  /* Poll so teammates' changes show up. Skipped while a write is in flight
     so a stale poll response can't clobber the result we just applied. */
  useEffect(() => {
    if (!signedIn) return;

    const refresh = async () => {
      if (busyRef.current || document.hidden) return;
      try {
        setBoard(await api.board());
      } catch (err) {
        if (err instanceof AuthError) setBoard(null);
      }
    };

    const t = setInterval(refresh, POLL_MS);
    // Coming back to the tab shouldn't mean staring at stale state for 5s.
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [signedIn]);

  /* Live clock so the "held for 4m" durations tick. */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /* Auto-dismiss the conflict banner. */
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const signIn = async (e) => {
    e?.preventDefault();
    const name = nameInput.trim();
    if (!name || !passwordInput || signingIn) return;
    setSigningIn(true);
    setAuthError("");
    try {
      setBoard(await api.login(name, passwordInput));
      setPasswordInput("");
    } catch (err) {
      setAuthError(err.message || "Could not sign in.");
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      /* signing out locally matters more than the round trip succeeding */
    }
    setBoard(null);
    setNameInput("");
    setPasswordInput("");
  };

  /** Returns true if the write landed, so callers can avoid discarding input. */
  const act = useCallback(async (serverId, fn) => {
    setBusyId(serverId);
    try {
      setBoard(await fn());
      return true;
    } catch (err) {
      if (err instanceof AuthError) {
        setBoard(null);
        return false;
      }
      // A 409 still carries the current board — show the truth, then explain.
      if (err instanceof ApiError && err.payload?.servers) setBoard(err.payload);
      setNotice(err.message);
      return false;
    } finally {
      setBusyId(null);
    }
  }, []);

  const claim = async (serverId, expect) => {
    const note = (drafts[serverId] || "").trim();
    const ok = await act(serverId, () => api.claim(serverId, note, expect));
    if (ok) setDrafts((d) => ({ ...d, [serverId]: "" }));
  };

  const release = (serverId) => act(serverId, () => api.release(serverId));

  /* ── boot ──────────────────────────────────────────────────────────────── */
  if (booting) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-neutral-700" />
      </div>
    );
  }

  /* ── sign-in ───────────────────────────────────────────────────────────── */
  if (!signedIn) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 flex items-center justify-center p-6 font-sans">
        <form onSubmit={signIn} className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 text-emerald-400">
            <Radio size={20} />
            <span className="font-mono text-sm tracking-tight text-neutral-400">
              staging<span className="text-neutral-600">/</span>board
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-neutral-100 mb-1">Who&rsquo;s on staging?</h1>
          <p className="text-sm text-neutral-500 mb-8 leading-relaxed">
            Sign in so teammates can see when you&rsquo;re using a server.
          </p>

          <label htmlFor="name" className="block text-xs text-neutral-500 mb-2">
            Your name
          </label>
          <input
            id="name"
            autoFocus
            autoComplete="username"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="e.g. Agus"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-100 placeholder-neutral-600 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition"
          />

          <label htmlFor="password" className="block text-xs text-neutral-500 mb-2 mt-4">
            Team password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-100 placeholder-neutral-600 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition"
          />

          {authError && (
            <p className="mt-3 text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle size={13} /> {authError}
            </p>
          )}

          <button
            type="submit"
            disabled={!nameInput.trim() || !passwordInput || signingIn}
            className="mt-5 w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-800 disabled:text-neutral-600 text-neutral-950 font-medium rounded-lg py-2.5 transition"
          >
            {signingIn ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
            Sign in
          </button>
        </form>
      </div>
    );
  }

  /* ── board ─────────────────────────────────────────────────────────────── */
  const servers = board.servers ?? [];
  const inUseCount = servers.filter((s) => s.status === "in-use").length;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2 text-emerald-400">
            <Radio size={18} />
            <span className="font-mono text-sm text-neutral-400">
              staging<span className="text-neutral-600">/</span>board
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-neutral-400">
              <User size={14} className="text-neutral-500" />
              {board.me}
            </span>
            <button
              onClick={signOut}
              className="text-neutral-500 hover:text-neutral-300 transition p-1"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-5xl font-semibold text-neutral-100 tabular-nums">
              {inUseCount}
              <span className="text-neutral-600">/{servers.length}</span>
            </span>
            <span className="text-neutral-500 text-sm">
              {inUseCount === 0
                ? "all servers free"
                : inUseCount === servers.length
                ? "everything's taken"
                : `${servers.length - inUseCount} free right now`}
            </span>
          </div>
        </div>

        {notice && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            <AlertTriangle size={15} className="shrink-0" />
            {notice}
          </div>
        )}

        <div className="space-y-3">
          {servers.map((s) => {
            const inUse = s.status === "in-use";
            const mine = inUse && s.heldBy === board.me;
            const busy = busyId === s.id;
            return (
              <div
                key={s.id}
                className={`rounded-xl border overflow-hidden ${
                  inUse
                    ? "border-amber-500/30 bg-amber-500/[0.04]"
                    : "border-emerald-500/25 bg-emerald-500/[0.03]"
                }`}
              >
                <div className="flex items-stretch">
                  <div className={`w-1 ${inUse ? "bg-amber-500" : "bg-emerald-500"}`} />
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Server size={15} className="text-neutral-500 shrink-0" />
                          <span className="font-mono text-neutral-100 font-medium truncate">
                            {s.label}
                          </span>
                          <span
                            className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                              inUse
                                ? "bg-amber-500/15 text-amber-400"
                                : "bg-emerald-500/15 text-emerald-400"
                            }`}
                          >
                            {inUse ? "in use" : "available"}
                          </span>
                        </div>

                        {inUse ? (
                          <div className="mt-2 text-sm text-neutral-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="flex items-center gap-1">
                              <User size={13} className="text-neutral-600" />
                              {mine ? "you" : s.heldBy}
                            </span>
                            <span className="flex items-center gap-1 text-neutral-500">
                              <Clock size={13} className="text-neutral-600" />
                              {fmtDuration(now - s.since)}
                            </span>
                            {s.note && (
                              <span className="text-neutral-500 italic truncate">
                                &ldquo;{s.note}&rdquo;
                              </span>
                            )}
                          </div>
                        ) : (
                          <input
                            value={drafts[s.id] || ""}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [s.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") claim(s.id, "available");
                            }}
                            maxLength={120}
                            placeholder="what for? (optional)"
                            className="mt-2 w-full max-w-xs bg-neutral-900/60 border border-neutral-800 rounded-md px-2 py-1 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-emerald-500/50 transition"
                          />
                        )}
                      </div>

                      <div className="shrink-0">
                        {busy ? (
                          <div className="p-2 text-neutral-500">
                            <Loader2 size={16} className="animate-spin" />
                          </div>
                        ) : !inUse ? (
                          <button
                            onClick={() => claim(s.id, "available")}
                            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-sm font-medium rounded-lg px-3 py-1.5 transition"
                          >
                            <Hand size={14} /> Claim
                          </button>
                        ) : mine ? (
                          <button
                            onClick={() => release(s.id)}
                            className="flex items-center gap-1.5 bg-neutral-100 hover:bg-white text-neutral-900 text-sm font-medium rounded-lg px-3 py-1.5 transition"
                          >
                            <CircleCheck size={14} /> Release
                          </button>
                        ) : (
                          <button
                            onClick={() => claim(s.id, "takeover")}
                            className="flex items-center gap-1.5 border border-neutral-700 hover:border-amber-500/60 hover:text-amber-400 text-neutral-400 text-sm font-medium rounded-lg px-3 py-1.5 transition"
                          >
                            <ArrowRightLeft size={14} /> Take over
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {board.log?.length > 0 && (
          <div className="mt-10">
            <div className="text-xs text-neutral-600 mb-3 font-mono">recent activity</div>
            <div className="space-y-1.5">
              {board.log.slice(0, 8).map((e, i) => (
                <div key={`${e.ts}-${i}`} className="flex items-center gap-2 text-sm text-neutral-500">
                  <span className="font-mono text-xs text-neutral-700 tabular-nums w-12 shrink-0">
                    {fmtClock(e.ts)}
                  </span>
                  <span className="text-neutral-300">{e.user}</span>
                  <span>{e.action}</span>
                  <span className="font-mono text-neutral-400">{e.server}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-10 text-xs text-neutral-700 leading-relaxed">
          Status is shared live with everyone who opens this page. One shared password guards
          access &mdash; names are labels, not real accounts.
        </p>
      </div>
    </div>
  );
}
