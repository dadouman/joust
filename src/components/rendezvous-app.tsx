"use client";

import { Chess, type Square } from "chess.js";
import { ArrowLeft, Bell, Check, Copy, LogOut, QrCode, Share2, Swords, UserPlus, X, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChessPiece } from "./chess-pieces";
import { WEEKDAYS, computeNextOccurrence, describeRecurrence, formatDays, parseDays } from "@/lib/recurrence";
import { TIME_CONTROLS, TIME_CONTROL_IDS, formatClock, tcInfo, type TimeControlId } from "@/lib/time-control";

/* ── types ── */
type Match = {
  id: string;
  creatorName: string;
  guestName: string;
  inviteCode: string;
  scheduledAt: string;
  timeZone: string;
  timeOfDay: string;
  recurrenceDays: string;
  inviteStatus: string;
  timeControl: string;
  timeControlBy: string;
  timeControlConfirmed: boolean;
  clockWhiteSeconds: number;
  clockBlackSeconds: number;
  lastMoveAt: string | null;
  readyWhite: string | null;
  readyBlack: string | null;
  status: string;
  whitePlayer: string;
  blackPlayer: string;
  lastFen: string | null;
  /* New fields for review 3 */
  result: string | null;
  winnerName: string | null;
  endedAt: string | null;
  drawStatus: string;
  drawProposedBy: string | null;
  ratingWhiteBefore: number;
  ratingBlackBefore: number;
  ratingWhiteAfter: number | null;
  ratingBlackAfter: number | null;
};
type Move = { id: string; fromSquare: string; toSquare: string; san: string; ply: number };
type AuthUser = { id: string; pseudo: string; email: string } | null;
type Screen = "auth" | "home" | "create" | "join" | "match";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const MATCH_KEY = "joust-match-id";

/* ── atoms ── */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-white/[0.06] bg-[#13151d] shadow-xl shadow-black/20 ${className}`}>{children}</div>;
}

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" | "warn" | "danger" | "ok" }) {
  const t = {
    muted: "bg-white/[0.04] text-[#6b6882] ring-white/[0.06]",
    accent: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
    warn: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    danger: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    ok: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] ring-1 ${t[tone]}`}>{children}</span>;
}

function Btn({ children, onClick, disabled, type = "button", variant = "primary", className = "" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; variant?: "primary" | "secondary" | "ghost" | "danger" | "giant"; className?: string }) {
  const base = "w-full rounded-2xl font-extrabold transition-all duration-200 active:scale-[0.97] disabled:opacity-40";
  const s: Record<string, string> = {
    primary: `${base} bg-violet-600 text-white hover:bg-violet-500 shadow-lg shadow-violet-600/25 py-3.5 text-sm`,
    secondary: `${base} border border-white/[0.08] bg-white/[0.03] text-[#c4c0d4] hover:bg-white/[0.06] py-3.5 text-sm`,
    ghost: `${base} text-[#6b6882] hover:text-[#c4c0d4] py-2 text-sm`,
    danger: `${base} border border-rose-500/25 bg-rose-500/[0.08] text-rose-300 hover:bg-rose-500/[0.14] py-3.5 text-sm`,
    giant: `${base} bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-2xl shadow-violet-700/30 py-5 text-lg hover:brightness-110`,
  };
  return <button type={type} onClick={onClick} disabled={disabled} className={`${s[variant]} ${className}`}>{children}</button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">{label}</span>{children}</label>;
}

const inputCls = "w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-[#3a3851] focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/15 [color-scheme:dark]";

function Dot({ on = false }: { on?: boolean }) {
  return <span className="relative flex h-2 w-2">{on && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-60" />}<span className={`relative inline-flex h-2 w-2 rounded-full ${on ? "bg-violet-400" : "bg-[#3a3851]"}`} /></span>;
}

function Avatar({ name, tone = "a", size = "md" }: { name: string; tone?: "a" | "b"; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "h-14 w-14 text-sm rounded-[18px]" : "h-10 w-10 text-xs rounded-2xl";
  return <div className={`grid shrink-0 place-items-center font-black ring-1 ring-white/[0.08] ${dim} ${tone === "a" ? "bg-violet-600/25 text-violet-200" : "bg-[#2a243a] text-[#c4c0d4]"}`}>{(name || "?").slice(0, 2).toUpperCase()}</div>;
}

function TcPicker({ value, onChange, compact = false }: { value: TimeControlId; onChange: (v: TimeControlId) => void; compact?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {TIME_CONTROL_IDS.map((id) => {
        const tc = TIME_CONTROLS[id]; const on = value === id;
        return <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={on} className={`rounded-2xl border px-2 py-3 text-center transition-all active:scale-95 ${on ? "border-violet-500/60 bg-violet-600/15 shadow-lg shadow-violet-600/10" : "border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]"}`}><p className={`text-sm font-black ${on ? "text-white" : "text-[#c4c0d4]"}`}>{tc.label}</p><p className={`mt-0.5 font-mono text-[11px] font-bold ${on ? "text-violet-300" : "text-[#6b6882]"}`}>{tc.tag}</p>{!compact && <p className={`mt-1 text-[9px] font-semibold ${on ? "text-violet-300/80" : "text-[#6b6882]"}`}>{tc.hint}</p>}</button>;
      })}
    </div>
  );
}

function DayPicker({ days, toggle, setDays }: { days: number[]; toggle: (d: number) => void; setDays: (d: number[]) => void }) {
  return (
    <div>
      <div className="flex gap-1.5">{WEEKDAYS.map((d) => { const on = days.includes(d.value); return <button key={d.value} type="button" onClick={() => toggle(d.value)} aria-label={d.label} aria-pressed={on} className={`h-10 flex-1 rounded-xl text-xs font-black transition-all active:scale-90 ${on ? "bg-violet-600 text-white shadow-md shadow-violet-600/30" : "bg-white/[0.03] text-[#6b6882] ring-1 ring-white/[0.06] hover:text-white"}`}>{d.short}</button>; })}</div>
      <div className="mt-2 flex gap-1.5">{[{ label: "Semaine", val: [1, 2, 3, 4, 5] }, { label: "Week-end", val: [6, 0] }].map((p) => <button key={p.label} type="button" onClick={() => setDays(p.val)} className="flex-1 rounded-lg bg-white/[0.02] px-1 py-1.5 text-[9px] font-bold text-[#6b6882] ring-1 ring-white/[0.04] transition hover:text-violet-300">{p.label}</button>)}</div>
    </div>
  );
}

/* ── push helpers ── */
function urlBase64ToUint8Array(b64: string) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const r = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = atob(r); const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return arr;
}
function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
function detectPlatform() {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

/* ═══════════════════════════════════════ */
export function RendezVousApp() {
  const [screen, setScreen] = useState<Screen>("auth");
  const [pseudo, setPseudo] = useState("");
  const [pseudoInput, setPseudoInput] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [match, setMatch] = useState<Match | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: string; to: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [editing, setEditing] = useState(false);
  const deferredPrompt = useRef<{ prompt: () => Promise<void> } | null>(null);
  const platform = detectPlatform();
  const standalone = isStandalone();

  /* create form */
  const [timeOfDay, setTimeOfDay] = useState("20:30");
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [timeControl, setTimeControl] = useState<TimeControlId>("blitz");
  /* join form */
  const [codeInput, setCodeInput] = useState("");
  const [joinError, setJoinError] = useState("");

  const chess = useMemo(() => new Chess(match?.lastFen ?? undefined), [match?.lastFen]);

  /* ── identity: derived from pseudo, no toggle ── */
  const iAmCreator = match ? match.creatorName === pseudo : false;
  const iAmGuest = match ? match.guestName === pseudo : false;
  const opponentName = match ? (iAmCreator ? match.guestName : match.creatorName) : "";
  const isWhite = match ? match.whitePlayer === pseudo : true;
  const myColor = isWhite ? "w" : "b";

  const hasOpponent = Boolean(match?.guestName);
  const accepted = match?.inviteStatus === "accepted";
  const declined = match?.inviteStatus === "declined";
  const paramsConfirmed = match?.timeControlConfirmed === true;
  const isPlaying = match?.status === "playing";
  /* La partie en cours reste affichée même terminée : sinon un timeout/abandon après
     un ready vide ferait disparaître tout l'écran (bug de l'écran noir). */
  /* la partie est finie si le moteur d'echecs dit fin, OU le serveur a clos (abandon, timeout, nulle, mat...) */
  const matchOver = match?.status === "completed" || match?.result != null;
  /* on garde l'ecran echecs visible apres la fin : sinon l'ecran disparait (bug ecran noir) */
  const chessStarted = Boolean(match && (isPlaying || matchOver));
  const isArmed = match?.status === "scheduled" && accepted && paramsConfirmed;
  const isOver = chess.isGameOver() || matchOver;
  const matchDays = useMemo(() => parseDays(match?.recurrenceDays), [match?.recurrenceDays]);
  const tc = match ? tcInfo(match.timeControl) : TIME_CONTROLS[timeControl];
  const timeLeft = match ? new Date(match.scheduledAt).getTime() - now : 0;

  /* who proposed last — the OTHER one must accept */
  const lastProposalByMe = match ? (iAmCreator ? match.timeControlBy === "creator" : match.timeControlBy === "guest") : false;
  const iMustAnswer = Boolean(match && hasOpponent && !accepted && !lastProposalByMe);
  const waitingOnOpponent = Boolean(match && hasOpponent && !accepted && lastProposalByMe);

  /* ready check */
  const iAmReady = match ? (isWhite ? Boolean(match.readyWhite) : Boolean(match.readyBlack)) : false;
  const oppReady = match ? (isWhite ? Boolean(match.readyBlack) : Boolean(match.readyWhite)) : false;
  const readyDeadline = useMemo(() => {
    if (!match) return 0;
    const base = new Date(match.scheduledAt).getTime();
    const first = match.readyWhite ? new Date(match.readyWhite).getTime() : match.readyBlack ? new Date(match.readyBlack).getTime() : base;
    return first + 60_000;
  }, [match]);
  const readySecondsLeft = Math.max(0, Math.floor((readyDeadline - now) / 1000));
  const readyCheckActive = Boolean(isPlaying && !matchOver);

  const myTurn = chessStarted && chess.turn() === myColor;
  const clockOf = useCallback((color: "w" | "b") => {
    if (!match) return { text: "0:00", low: false };
    const base = color === "w" ? match.clockWhiteSeconds : match.clockBlackSeconds;
    if (!chessStarted || !match.lastMoveAt) return { text: formatClock(base), low: false };
    const elapsed = Math.floor((now - new Date(match.lastMoveAt).getTime()) / 1000);
    const remaining = base - (chess.turn() === color ? elapsed : 0);
    const total = tcInfo(match.timeControl).seconds;
    return { text: formatClock(remaining), low: remaining < Math.max(10, total * 0.1) };
  }, [match, now, chess, chessStarted]);
  const timedOut = useMemo(() => {
    if (!match || !chessStarted || !match.lastMoveAt) return null;
    const turn = chess.turn();
    const base = turn === "w" ? match.clockWhiteSeconds : match.clockBlackSeconds;
    if (base - Math.floor((now - new Date(match.lastMoveAt).getTime()) / 1000) > 0) return null;
    return turn === "w" ? match.whitePlayer : match.blackPlayer;
  }, [match, now, chess, chessStarted]);

  const notify = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 3200); }, []);
  const apply = useCallback((p: { match: Match; moves?: Move[] }) => { setMatch(p.match); if (p.moves) setMoves(p.moves); }, []);
  const load = useCallback(async (id: string) => {
    try {
      /* Tick FIRST: all state transitions (alarm, ready check, timeouts) happen here (review §2.2.1). */
      const ac = new AbortController();
      const timer = window.setTimeout(() => ac.abort(), 8000);
      try {
        await fetch(`/api/matches/${id}/tick`, { method: "POST", signal: ac.signal });
      } finally {
        window.clearTimeout(timer);
      }
      const r = await fetch(`/api/matches/${id}`, { cache: "no-store", signal: ac.signal });
      if (r.ok) apply((await r.json()) as { match: Match; moves: Move[] });
    } catch { /* */ }
  }, [apply]);

  const refreshNotif = useCallback(() => {
    if (typeof Notification === "undefined") return setPushSubscribed(false);
    if ("serviceWorker" in navigator) navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription().then((s) => setPushSubscribed(Boolean(s))).catch(() => setPushSubscribed(false)));
  }, []);

  /* ── auth actions ── */
  async function submitAuth(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setAuthError("");
    try {
      const url = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = authMode === "login"
        ? { email: authEmail, password: authPassword }
        : { email: authEmail, password: authPassword, pseudo: pseudoInput };
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await r.json()) as { user?: NonNullable<AuthUser>; error?: string };
      if (!d.user) { setAuthError(d.error ?? "Connexion impossible."); return; }
      setAuthUser(d.user);
      setPseudo(d.user.pseudo);
      setScreen(codeInput ? "join" : "home");
    } catch { setAuthError("Connexion impossible."); } finally { setSaving(false); }
  }

  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* */ }
    setAuthUser(null);
    setPseudo("");
    setPseudoInput("");
    setAuthEmail("");
    setAuthPassword("");
    setAuthError("");
    setMatch(null);
    setMoves([]);
    localStorage.removeItem(MATCH_KEY);
    setScreen("auth");
  }

  /* ── boot ── */
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined); }, []);
  useEffect(() => {
    (async () => {
      try {
        const urlCode = new URLSearchParams(window.location.search).get("code");
        if (urlCode) setCodeInput(urlCode.toUpperCase());
        /* Restore the server session cookie (auth required) */
        try {
          const r = await fetch("/api/auth/me", { cache: "no-store" });
          if (r.ok) {
            const d = (await r.json()) as { user?: NonNullable<AuthUser> };
            if (d.user) {
              setAuthUser(d.user);
              setPseudo(d.user.pseudo);
              if (urlCode) { setScreen("join"); return; }
              const savedMatch = localStorage.getItem(MATCH_KEY);
              if (savedMatch) { await load(savedMatch); setScreen("match"); return; }
              setScreen("home");
              return;
            }
          }
        } catch { /* session cookie absent */ }
        /* No session → account screen (create/login) */
        setScreen("auth");
      } catch { setScreen("auth"); } finally { setLoading(false); refreshNotif(); }
    })();
  }, [load, refreshNotif]);

  useEffect(() => { const h = (e: Event) => { e.preventDefault(); deferredPrompt.current = e as unknown as { prompt: () => Promise<void> }; }; window.addEventListener("beforeinstallprompt", h); window.addEventListener("focus", refreshNotif); return () => { window.removeEventListener("beforeinstallprompt", h); window.removeEventListener("focus", refreshNotif); }; }, [refreshNotif]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  /* Polling de secours lent (8 s) — le quasi temps réel est fourni par SSE */
  useEffect(() => { if (!match || screen !== "match") return; const t = setInterval(() => void load(match.id), 8000); return () => clearInterval(t); }, [match?.id, screen, load]);

  /* SSE — quasi temps réel (< 500 ms) : coup adverse, prêt, changement de statut => rechargement immédiat */
  useEffect(() => {
    if (!match || screen !== "match" || typeof EventSource === "undefined") return;
    let stopped = false;
    let es: EventSource | null = null;
    let retry: number | undefined;

    const connect = () => {
      try {
        es = new EventSource(`/api/matches/${match.id}/stream`);
      } catch {
        retry = window.setTimeout(connect, 2000);
        return;
      }
      es.addEventListener("update", () => { if (!stopped) void load(match.id); });
      es.onerror = () => {
        es?.close();
        if (!stopped) retry = window.setTimeout(connect, 2000);
      };
    };
    connect();

    return () => {
      stopped = true;
      if (retry) window.clearTimeout(retry);
      es?.close();
    };
  }, [match?.id, screen, load]);
  useEffect(() => { if (match?.status === "scheduled" && accepted && paramsConfirmed && timeLeft <= 0) void load(match.id); }, [timeLeft, match?.id, match?.status, accepted, paramsConfirmed, load]);
  useEffect(() => {
    if (match && match.inviteStatus === "accepted" && match.timeControlConfirmed && !pushSubscribed && !tutorialOpen) {
      const shown = localStorage.getItem("joust-notif-tutorial-shown");
      if (!shown) { setTutorialOpen(true); localStorage.setItem("joust-notif-tutorial-shown", "1"); }
    }
  }, [match?.inviteStatus, match?.timeControlConfirmed, pushSubscribed, tutorialOpen]);
  useEffect(() => setSelectedSquare(null), [match?.lastFen]);

  /* ── share content ── */
  const appOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteLink = match ? `${appOrigin}/?code=${match.inviteCode}` : "";
  const shareMessage = match
    ? `♞ ${match.creatorName} t'invite à une joust !\n` +
      `⏰ ${describeRecurrence(match.timeOfDay, matchDays)}\n` +
      `⚡ ${tc.label} (${tc.tag})\n` +
      `Code : ${match.inviteCode}\n` +
      `Rejoins : ${inviteLink}`
    : "";

  /* ── actions ── */
  async function createMatch(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const next = computeNextOccurrence(timeOfDay, days);
      const r = await fetch("/api/matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creatorName: pseudo, scheduledAt: next.toISOString(), timeOfDay, recurrenceDays: formatDays(days), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, timeControl }) });
      const d = (await r.json()) as { match?: Match; error?: string };
      if (d.match) { localStorage.setItem(MATCH_KEY, d.match.id); setMoves([]); apply({ match: d.match, moves: [] }); setScreen("match"); }
      else notify(d.error ?? "Création impossible");
    } catch { notify("Création impossible"); } finally { setSaving(false); }
  }

  async function joinByCode(e: React.FormEvent) {
    e.preventDefault(); setJoinError(""); setSaving(true);
    try {
      const code = codeInput.trim().toUpperCase();
      const r = await fetch(`/api/matches/code/${code}`, { cache: "no-store" });
      const d = (await r.json()) as { match?: Match; error?: string };
      if (!d.match) { setJoinError(d.error ?? "Code introuvable."); return; }
      /* register as guest if slot is free */
      if (!d.match.guestName || d.match.guestName === pseudo) {
        const jr = await fetch(`/api/matches/${d.match.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", playerName: pseudo }) });
        const jd = (await jr.json()) as { match?: Match; error?: string };
        if (!jd.match) { setJoinError(jd.error ?? "Impossible de rejoindre."); return; }
        localStorage.setItem(MATCH_KEY, jd.match.id); apply({ match: jd.match }); setScreen("match");
        window.history.replaceState({}, "", "/");
      } else if (d.match.creatorName === pseudo) {
        localStorage.setItem(MATCH_KEY, d.match.id); apply({ match: d.match }); setScreen("match");
      } else {
        setJoinError("Cette joust a déjà deux joueurs.");
      }
    } catch { setJoinError("Connexion impossible."); } finally { setSaving(false); }
  }

  const patch = useCallback(async (body: Record<string, unknown>, msg?: string) => {
    if (!match) return; setSaving(true);
    try {
      const r = await fetch(`/api/matches/${match.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await r.json()) as { match?: Match; moves?: Move[]; error?: string };
      if (d.match) { apply({ match: d.match, moves: d.moves }); if (msg) notify(msg); } else if (d.error) notify(d.error);
    } catch { notify("Action impossible"); } finally { setSaving(false); }
  }, [match, apply, notify]);

  function sendCounter() {
    if (!match) return;
    const next = computeNextOccurrence(timeOfDay, days);
    void patch({ action: "counter", by: iAmCreator ? "creator" : "guest", timeControl, timeOfDay, recurrenceDays: formatDays(days), scheduledAt: next.toISOString() }, "Contre-proposition envoyée");
    setEditing(false);
  }

  function openEditor() {
    if (!match) return;
    setTimeOfDay(match.timeOfDay); setDays(matchDays); setTimeControl(tcInfo(match.timeControl).id); setEditing(true);
  }

  async function sendMove(from: string, to: string, promotion?: string) {
    if (!match || !myTurn) return; setSaving(true);
    try {
      const r = await fetch(`/api/matches/${match.id}/moves`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to, promotion, playerName: pseudo }) });
      const d = (await r.json()) as { move?: Move; match?: Match; error?: string };
      if (d.move && d.match) { const nm = [...moves, d.move]; setMoves(nm); apply({ match: d.match, moves: nm }); } else if (d.error) notify(d.error);
    } catch { /* */ } finally { setSelectedSquare(null); setSaving(false); }
  }

  /* Promotion picker (review 3.2 §1) */
  function maybePromote(from: string, to: string) {
    const target = chess.get(to as Square);
    const isPromotion = target?.type === "p" && (to.endsWith("8") || to.endsWith("1"));
    if (isPromotion) {
      setPromotionPending({ from, to });
      return;
    }
    void sendMove(from, to);
  }

  async function shareInvite() {
    if (!match) return;
    if (navigator.share) {
      try { await navigator.share({ title: "Joust", text: shareMessage }); return; } catch { /* cancelled */ }
    }
    await copy(shareMessage, "Message copié !");
  }
  async function copy(text: string, msg: string) {
    try { await navigator.clipboard.writeText(text); notify(msg); } catch { notify("Copie impossible"); }
  }

  async function enableNotifs() {
    if (!match || typeof Notification === "undefined") return notify("Non supporté.");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return notify("Refusé. Installe d'abord l'app (iOS 16.4+).");
      const v = (await (await fetch("/api/push/vapid", { cache: "no-store" })).json()) as { publicKey: string };
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(v.publicKey) });
      await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchId: match.id, playerName: pseudo, subscription: sub.toJSON() }) });
      setPushSubscribed(true); notify("🔔 Notifications activées !");
    } catch { notify("Abonnement impossible."); }
  }

  function leaveMatch() { localStorage.removeItem(MATCH_KEY); setMatch(null); setMoves([]); setScreen("home"); }
  function toggleDay(d: number) { setDays((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d])); }

  /* board */
  function tap(sq: string, piece: { color: string; type: string } | null) {
    if (!match || !chessStarted || saving || timedOut) return;
    if (!selectedSquare) { if (piece?.color === myColor) setSelectedSquare(sq); return; }
    if (piece?.color === myColor) return setSelectedSquare(sq);
    maybePromote(selectedSquare, sq);
  }
  function handleDragStart(sq: string, piece: { color: string; type: string } | null) {
    if (!match || !chessStarted || saving || timedOut || !piece || piece.color !== myColor) return;
    setDragStart(sq); setSelectedSquare(sq);
  }
  function handleDragOver(sq: string, e: React.DragEvent) { e.preventDefault(); if (dragStart) setDragOver(sq); }
  function handleDrop(sq: string, e: React.DragEvent) {
    e.preventDefault();
    if (dragStart && dragStart !== sq && myTurn) maybePromote(dragStart, sq);
    setDragStart(null); setDragOver(null); setSelectedSquare(null);
  }
  const rows = useMemo(() => { const b = chess.board(); return isWhite ? b : b.map((r) => [...r].reverse()).reverse(); }, [chess, isWhite]);
  const sqName = (r: number, c: number) => `${isWhite ? FILES[c] : FILES[7 - c]}${isWhite ? 8 - r : r + 1}`;

  const ms = Math.max(0, timeLeft);
  const dd = Math.floor(ms / 86_400_000);
  const hh = String(Math.floor((ms % 86_400_000) / 3_600_000)).padStart(2, "0");
  const mmv = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
  const ssv = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#08090e]"><div className="anim-fade-up flex flex-col items-center gap-5"><div className="relative h-14 w-14"><div className="absolute inset-0 rounded-full bg-violet-600/30 blur-xl" /><div className="anim-spin relative grid h-14 w-14 place-items-center rounded-full bg-[#13151d] ring-1 ring-white/[0.06]"><ChessPiece color="w" type="k" className="h-8 w-8 text-[#e4d6ff]" /></div></div><p className="text-sm font-extrabold text-white">Joust</p></div></div>;

  return (
    <div className="flex min-h-screen flex-col bg-[#08090e]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className="absolute -top-48 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-violet-700/[0.07] blur-[120px]" /><div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-violet-700/[0.05] blur-[100px]" /></div>
      {toast && <div className="anim-fade-up fixed left-1/2 top-20 z-[60] w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2"><div className="rounded-2xl border border-violet-500/25 bg-[#1a1626] px-4 py-3 text-center text-xs font-bold text-violet-200 shadow-2xl shadow-black/40">{toast}</div></div>}

      {/* Header */}
      {screen !== "auth" && (
        <header className="sticky top-0 z-30 border-b border-white/[0.04] bg-[#08090e]/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-5">
            <div className="flex items-center gap-2.5">
              {(screen === "create" || screen === "join") ? (
                <button onClick={() => setScreen("home")} aria-label="Retour" className="grid h-7 w-7 place-items-center rounded-xl bg-white/[0.04] text-[#c4c0d4] ring-1 ring-white/[0.06] active:scale-90"><ArrowLeft size={15} /></button>
              ) : (
                <div className="grid h-7 w-7 place-items-center rounded-xl bg-violet-600 shadow-md shadow-violet-600/30"><ChessPiece color="w" type="n" className="h-5 w-5 text-white" /></div>
              )}
              <span className="text-sm font-extrabold tracking-tight text-white">Joust</span>
            </div>
            <div className="flex items-center gap-2">
              {match && <button type="button" onClick={() => { refreshNotif(); setTutorialOpen(true); }} aria-label="Notifications" className={`relative grid h-8 w-8 place-items-center rounded-xl transition active:scale-90 ${pushSubscribed ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "bg-white/[0.04] text-[#6b6882] ring-1 ring-white/[0.06]"}`}><Bell size={15} />{!pushSubscribed && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400" />}</button>}
              {pseudo && <div className="flex items-center gap-1.5 rounded-xl bg-white/[0.03] px-2.5 py-1.5 ring-1 ring-white/[0.06]"><span className="grid h-5 w-5 place-items-center rounded-md bg-violet-600/30 text-[9px] font-black text-violet-200">{pseudo.slice(0, 2).toUpperCase()}</span><span className="text-[11px] font-extrabold text-white">{pseudo}</span></div>}
              {authUser && <button type="button" onClick={() => void logout()} aria-label="Se déconnecter" title="Se déconnecter" className="grid h-8 w-8 place-items-center rounded-xl bg-white/[0.04] text-[#6b6882] ring-1 ring-white/[0.06] transition active:scale-90 hover:text-rose-300"><LogOut size={14} /></button>}
            </div>
          </div>
        </header>
      )}

      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-5 py-8">

        {/* ══ 1. AUTH (register / login) ══ */}
        {screen === "auth" && (
          <div className="anim-fade-up w-full space-y-6">
            <div className="text-center">
              <Badge tone="accent">{authMode === "login" ? "Connexion" : "Inscription"}</Badge>
              <h1 className="mt-4 text-2xl font-black tracking-tight text-white">{authMode === "login" ? "Bon retour !" : "Créer un compte"}</h1>
              <p className="mt-2 text-sm text-[#6b6882]">{authMode === "login" ? "Retrouve ta session et tes jousts." : "Ton compte survit aux purges du navigateur."}</p>
            </div>
            <Card className="anim-fade-up-d1 p-6">
              <form onSubmit={submitAuth} className="space-y-4">
                {authMode === "register" && (
                  <Field label="Pseudo">
                    <input value={pseudoInput} onChange={(e) => setPseudoInput(e.target.value)} maxLength={40} autoFocus placeholder="Lina" className={inputCls} />
                  </Field>
                )}
                <Field label="Email">
                  <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="lina@exemple.fr" className={inputCls} />
                </Field>
                <Field label="Mot de passe">
                  <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="••••••••" className={inputCls} />
                </Field>
                {authError && <p className="rounded-xl bg-rose-500/[0.08] px-3 py-2 text-center text-[11px] font-bold text-rose-300 ring-1 ring-rose-500/20">{authError}</p>}
                <Btn type="submit" disabled={saving || !authEmail.trim() || authPassword.length < 8}>{saving ? "Patiente…" : authMode === "login" ? "Se connecter" : "S'inscrire"}</Btn>
              </form>
              <div className="mt-4 border-t border-white/[0.05] pt-4">
                <button type="button" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }} className="w-full text-center text-xs font-bold text-violet-300 hover:text-violet-200">
                  {authMode === "login" ? "Pas de compte ? Inscris-toi" : "Déjà un compte ? Connecte-toi"}
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* ══ 2. HOME — create or join ══ */}
        {screen === "home" && (
          <div className="anim-fade-up w-full space-y-6">
            <div className="text-center"><Badge tone="accent">{pseudo}</Badge><h1 className="mt-4 text-3xl font-black tracking-tight text-white">Joust</h1></div>
            <div className="anim-fade-up-d1 space-y-3">
              <button onClick={() => setScreen("create")} className="w-full rounded-[20px] border border-violet-500/30 bg-gradient-to-br from-violet-600/20 to-violet-800/10 p-5 text-left transition-all active:scale-[0.98] hover:border-violet-500/50">
                <div className="flex items-center gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-600 shadow-lg shadow-violet-600/30"><Swords size={22} className="text-white" /></div>
                  <div><p className="text-base font-black text-white">Créer une joust</p><p className="mt-0.5 text-xs text-[#a39cc4]">Heure, jours et cadence</p></div>
                </div>
              </button>
              <button onClick={() => setScreen("join")} className="w-full rounded-[20px] border border-violet-500/25 bg-gradient-to-br from-violet-500/10 to-violet-700/5 p-5 text-left transition-all active:scale-[0.98] hover:border-violet-500/40">
                <div className="flex items-center gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-600/30 ring-1 ring-violet-500/30"><UserPlus size={22} className="text-violet-200" /></div>
                  <div><p className="text-base font-black text-white">Rejoindre un ami</p><p className="mt-0.5 text-xs text-[#a39cc4]">Entre le code reçu</p></div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ══ 3a. CREATE ══ */}
        {screen === "create" && (
          <div className="anim-fade-up w-full space-y-6">
            <div className="text-center"><h1 className="text-2xl font-black tracking-tight text-white">Créer une joust</h1></div>
            <Card className="anim-fade-up-d1 p-6">
              <form onSubmit={createMatch} className="space-y-5">
                <Field label="Heure"><input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className={`${inputCls} text-center font-mono text-2xl font-black`} /></Field>
                <div><span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Jours</span><DayPicker days={days} toggle={toggleDay} setDays={setDays} /></div>
                <div><span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Cadence</span><TcPicker value={timeControl} onChange={setTimeControl} /></div>
                <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] px-4 py-3"><p className="text-xs font-bold text-violet-200">{describeRecurrence(timeOfDay, days)} · {TIME_CONTROLS[timeControl].label}</p></div>
                <Btn type="submit" disabled={saving}>Envoyer la joust</Btn>
              </form>
            </Card>
          </div>
        )}

        {/* ══ 3b. JOIN ══ */}
        {screen === "join" && (
          <div className="anim-fade-up w-full space-y-6">
            <div className="text-center"><Badge tone="accent">Rejoindre</Badge><h1 className="mt-4 text-2xl font-black tracking-tight text-white">Code de la joust</h1><p className="mt-2 text-sm text-[#6b6882]">Entre le code à 6 caractères reçu de ton ami.</p></div>
            <Card className="anim-fade-up-d1 p-6">
              <form onSubmit={joinByCode} className="space-y-4">
                <input value={codeInput} onChange={(e) => { setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)); setJoinError(""); }} maxLength={8} autoFocus placeholder="K7P2QX" className={`${inputCls} text-center font-mono text-3xl font-black tracking-[0.35em]`} />
                {joinError && <p className="rounded-xl bg-rose-500/[0.08] px-3 py-2 text-center text-[11px] font-bold text-rose-300 ring-1 ring-rose-500/20">{joinError}</p>}
                <Btn type="submit" disabled={saving || codeInput.length < 4}>Rejoindre la joust</Btn>
              </form>
            </Card>
          </div>
        )}

        {/* ══ 4. MATCH ══ */}
        {screen === "match" && match && (
          <div className="w-full space-y-4">

            {/* — waiting for opponent to join — */}
            {!hasOpponent && (
              <div className="anim-fade-up space-y-5">
                <div className="text-center"><Badge tone="warn"><Dot /> En attente d'un adversaire</Badge><h2 className="mt-4 text-2xl font-black tracking-tight text-white">Ta joust</h2></div>
                <Card className="anim-fade-up-d1 overflow-hidden p-0">
                  <div className="border-b border-white/[0.05] bg-gradient-to-b from-violet-600/[0.08] to-transparent px-6 py-6 text-center">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#6b6882]">Code de la joust</p>
                    <p className="mt-2 font-mono text-4xl font-black tracking-[0.28em] text-white">{match.inviteCode}</p>
                    <div className="mt-4 flex justify-center gap-2">
                      <button onClick={() => copy(match.inviteCode, "Code copié !")} className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-2 text-[11px] font-bold text-[#c4c0d4] ring-1 ring-white/[0.08] active:scale-95"><Copy size={12} /> Code</button>
                      <button onClick={() => setShowQr(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-2 text-[11px] font-bold text-[#c4c0d4] ring-1 ring-white/[0.08] active:scale-95"><QrCode size={12} /> QR code</button>
                    </div>
                  </div>
                  <div className="space-y-3 p-5">
                    <div className="rounded-2xl bg-white/[0.02] p-4 ring-1 ring-white/[0.04]"><p className="whitespace-pre-line text-[11px] leading-5 text-[#8b87a3]">{shareMessage}</p></div>
                    <div className="grid grid-cols-2 gap-2">
                      <Btn onClick={shareInvite}><span className="inline-flex items-center gap-1.5"><Share2 size={14} /> Partager</span></Btn>
                      <Btn variant="secondary" onClick={() => copy(shareMessage, "Message copié !")}><span className="inline-flex items-center gap-1.5"><Copy size={14} /> Copier</span></Btn>
                    </div>
                  </div>
                  <div className="border-t border-white/[0.05] bg-white/[0.015] px-5 py-3 text-center"><p className="text-[11px] font-bold text-violet-300">{describeRecurrence(match.timeOfDay, matchDays)} · {tc.label}</p></div>
                </Card>
                <Btn variant="ghost" onClick={leaveMatch}>Annuler la joust</Btn>
              </div>
            )}

            {/* — negotiation — */}
            {hasOpponent && !accepted && !declined && (
              <div className="anim-fade-up space-y-5">
                <div className="text-center">
                  <Badge tone={iMustAnswer ? "warn" : "accent"}>{iMustAnswer ? "À toi de valider" : "En attente"}</Badge>
                  <h2 className="mt-4 text-2xl font-black tracking-tight text-white">{match.creatorName} <span className="text-violet-400">vs</span> {match.guestName}</h2>
                </div>
                <Card className="anim-fade-up-d1 p-6">
                  <div className="flex items-center justify-center gap-5">
                    <div className="flex flex-col items-center gap-2"><Avatar name={pseudo} tone="a" size="lg" /><span className="text-[11px] font-extrabold text-white">Toi</span></div>
                    <span className="text-[10px] font-black text-[#3a3851]">VS</span>
                    <div className="flex flex-col items-center gap-2"><Avatar name={opponentName} tone="b" size="lg" /><span className="text-[11px] font-extrabold text-white">{opponentName}</span></div>
                  </div>

                  {!editing ? (
                    <>
                      <div className="mt-6 space-y-3 rounded-2xl bg-white/[0.02] p-4 ring-1 ring-white/[0.04]">
                        <div className="text-center"><p className="font-mono text-3xl font-black text-white">{match.timeOfDay}</p><p className="mt-1 text-xs font-bold text-violet-300">{describeRecurrence(match.timeOfDay, matchDays)}</p></div>
                        <div className="flex justify-center gap-1.5 border-t border-white/[0.05] pt-3">{WEEKDAYS.map((d) => <span key={d.value} className={`grid h-7 w-7 place-items-center rounded-lg text-[10px] font-black ${matchDays.includes(d.value) ? "bg-violet-600 text-white" : "bg-white/[0.03] text-[#3a3851]"}`}>{d.short}</span>)}</div>
                        <div className="flex items-center justify-center gap-2 border-t border-white/[0.05] pt-3"><span className="font-mono text-sm font-black text-white">{tc.tag}</span><span className="text-xs font-bold text-[#6b6882]">{tc.label}</span></div>
                      </div>
                      <p className="mt-3 text-center text-[11px] text-[#6b6882]">Proposé par <span className="font-bold text-[#c4c0d4]">{lastProposalByMe ? "toi" : opponentName}</span></p>
                      <div className="mt-5 space-y-2">
                        {iMustAnswer ? (
                          <>
                            <Btn onClick={() => void patch({ action: "accept" }, "Joust validée !")} disabled={saving}>Accepter ces paramètres</Btn>
                            <Btn variant="secondary" onClick={openEditor} disabled={saving}>Proposer autre chose</Btn>
                            <Btn variant="danger" onClick={() => void patch({ action: "decline" }, "Joust refusée")} disabled={saving}>Refuser</Btn>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500/[0.06] px-4 py-3 ring-1 ring-amber-500/20"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" /><p className="text-xs font-bold text-amber-200">{opponentName} doit valider…</p></div>
                            <Btn variant="secondary" onClick={openEditor} disabled={saving}>Modifier ma proposition</Btn>
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="mt-6 space-y-4">
                      <Field label="Heure"><input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className={`${inputCls} text-center font-mono text-xl font-black`} /></Field>
                      <div><span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Jours</span><DayPicker days={days} toggle={toggleDay} setDays={setDays} /></div>
                      <div><span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Cadence</span><TcPicker value={timeControl} onChange={setTimeControl} compact /></div>
                      <div className="grid grid-cols-2 gap-2"><Btn variant="secondary" onClick={() => setEditing(false)}>Annuler</Btn><Btn onClick={sendCounter} disabled={saving}>Envoyer</Btn></div>
                    </div>
                  )}
                </Card>
                <Btn variant="ghost" onClick={leaveMatch}>Quitter la joust</Btn>
              </div>
            )}

            {/* — declined — */}
            {declined && (
              <div className="anim-fade-up space-y-6 text-center"><Badge tone="danger">Joust refusée</Badge><Card className="anim-fade-up-d1 p-8"><p className="text-lg font-black text-white">La joust a été déclinée</p><p className="mt-2 text-sm text-[#6b6882]">Crée une nouvelle joust avec d'autres paramètres.</p><div className="mt-6"><Btn onClick={leaveMatch}>Retour à l'accueil</Btn></div></Card></div>
            )}

            {/* — armed countdown — */}
            {isArmed && (
              <div className="anim-fade-up space-y-5">
                <div className="text-center"><Badge tone="accent"><Dot on /> Joust armée</Badge><h2 className="mt-4 text-2xl font-black tracking-tight text-white">{match.creatorName} <span className="text-violet-400">vs</span> {match.guestName}</h2><p className="mt-1.5 text-xs font-bold text-violet-300">{describeRecurrence(match.timeOfDay, matchDays)}</p></div>
                <Card className="anim-fade-up-d1 overflow-hidden p-0">
                  <div className="flex justify-center gap-1.5 border-b border-white/[0.05] bg-white/[0.015] px-4 py-3">{WEEKDAYS.map((d) => { const on = matchDays.includes(d.value); const isNext = new Date(match.scheduledAt).getDay() === d.value; return <span key={d.value} className={`grid h-8 w-8 place-items-center rounded-lg text-[10px] font-black ${on ? (isNext ? "bg-violet-500 text-white ring-2 ring-violet-300/50" : "bg-violet-600/40 text-violet-200") : "bg-white/[0.03] text-[#3a3851]"}`}>{d.short}</span>; })}</div>
                  <div className="bg-gradient-to-b from-violet-600/[0.06] to-transparent px-6 pb-6 pt-6 text-center"><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#6b6882]">Départ dans</p><div className="mt-3 font-mono text-5xl font-black tracking-tight text-white sm:text-6xl">{dd > 0 && <span className="text-violet-400">{dd}j </span>}{hh}<span className="anim-pulse text-violet-400">:</span>{mmv}<span className="anim-pulse text-violet-400">:</span>{ssv}</div><p className="mt-3 text-xs capitalize text-[#6b6882]">{new Date(match.scheduledAt).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p></div>
                  <div className="mx-4 mb-4 flex items-center justify-center gap-2 rounded-2xl bg-white/[0.03] px-4 py-2.5 ring-1 ring-white/[0.05]"><span className="font-mono text-sm font-black text-white">{tc.tag}</span><span className="text-xs font-bold text-[#6b6882]">{tc.label}</span><Badge tone="ok">Validé</Badge></div>
                </Card>
                <Btn variant="ghost" onClick={leaveMatch}>Annuler la joust</Btn>
              </div>
            )}

            {/* — ready check — */}
            {readyCheckActive && (
              <div className="anim-fade-up space-y-5">
                <div className="text-center"><Badge tone="accent"><Dot on /> C'est l'heure !</Badge><h2 className="mt-4 text-2xl font-black tracking-tight text-white">{match.creatorName} <span className="text-violet-400">vs</span> {match.guestName}</h2><p className="mt-1.5 text-xs font-bold text-violet-300">{tc.label} · {tc.tag}</p></div>
                <Card className="anim-fade-up-d1 overflow-hidden p-0">
                  <div className="grid grid-cols-2 divide-x divide-white/[0.05]">
                    <div className="flex flex-col items-center gap-3 px-3 py-6"><Avatar name={pseudo} tone="a" /><p className="text-[11px] font-extrabold text-white">Toi</p><Badge tone={iAmReady ? "ok" : "warn"}>{iAmReady ? "Prêt" : "…"}</Badge></div>
                    <div className="flex flex-col items-center gap-3 bg-white/[0.02] px-3 py-6"><Avatar name={opponentName} tone="b" /><p className="text-[11px] font-extrabold text-white">{opponentName}</p><Badge tone={oppReady ? "ok" : "warn"}>{oppReady ? "Prêt" : "…"}</Badge></div>
                  </div>
                  <div className="border-t border-white/[0.05] px-5 pb-6 pt-4 text-center">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#6b6882]">Temps pour valider</p>
                    <div className="mt-2 font-mono text-4xl font-black text-white">0:<span className={readySecondsLeft <= 15 ? "text-rose-400" : "text-violet-400"}>{String(readySecondsLeft).padStart(2, "0")}</span></div>
                    <div className="mt-5"><Btn variant={iAmReady ? "secondary" : "giant"} disabled={iAmReady || saving} onClick={() => void patch({ action: "ready", playerName: pseudo })}>{iAmReady ? "Prêt ✓ — en attente" : <span className="inline-flex items-center gap-2"><Zap size={22} /> Prêt</span>}</Btn></div>
                    {!iAmReady && <p className="mt-2 text-[11px] text-[#6b6882]">Départ dès que vous êtes deux, ou dans {readySecondsLeft}s.</p>}
                  </div>
                </Card>
              </div>
            )}

            {/* — chess — */}
            {chessStarted && (
              <div className="anim-fade-up space-y-3">
                <PlayerBar name={opponentName} color={isWhite ? "b" : "w"} active={chess.turn() !== myColor} clock={clockOf(isWhite ? "b" : "w").text} low={clockOf(isWhite ? "b" : "w").low} />
                <Card className="anim-fade-up-d1 overflow-hidden p-0">
                  <div className="aspect-square w-full"><div className="grid h-full w-full grid-cols-8 grid-rows-8">{rows.map((row, ri) => row.map((piece, ci) => { const sq = sqName(ri, ci); const dark = (ri + ci) % 2 === 1; const sel = sq === selectedSquare; const last = moves.at(-1)?.fromSquare === sq || moves.at(-1)?.toSquare === sq; const p = piece as { color: string; type: string } | null; return <button type="button" key={sq} onClick={() => tap(sq, p)} className={`relative flex items-center justify-center transition-colors select-none ${dark ? "bg-[#7b61a5]" : "bg-[#d8ccf0]"} ${sel ? "z-10 ring-[3px] ring-inset ring-white" : ""} ${last && !sel ? "after:absolute after:inset-0 after:bg-violet-300/25" : ""} ${myTurn && !timedOut ? "cursor-pointer hover:brightness-110 active:brightness-95" : "cursor-default"}`}>{ci === 0 && <span className={`absolute left-[3px] top-[1px] text-[8px] font-bold ${dark ? "text-[#d8ccf0]/50" : "text-[#7b61a5]/50"}`}>{isWhite ? 8 - ri : ri + 1}</span>}{ri === 7 && <span className={`absolute bottom-[1px] right-[3px] text-[8px] font-bold ${dark ? "text-[#d8ccf0]/50" : "text-[#7b61a5]/50"}`}>{isWhite ? FILES[ci] : FILES[7 - ci]}</span>}{p && <span className={`relative z-[5] flex h-full w-full items-center justify-center transition-transform ${sel ? "scale-105" : ""} ${p.color === "w" ? "text-[#f5eeff]" : "text-[#2a1f3d]"}`}><ChessPiece color={p.color as "w" | "b"} type={p.type as "p" | "n" | "b" | "r" | "q" | "k"} className="h-[85%] w-[85%] drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]" /></span>}</button>; }))}</div></div>
                </Card>
                <PlayerBar name={`${pseudo} (toi)`} color={myColor} active={chess.turn() === myColor} clock={clockOf(myColor).text} low={clockOf(myColor).low} />
                {selectedSquare && myTurn && (
                  <div className="flex items-center justify-center gap-3 mt-2">
                    <span className="text-xs font-mono text-violet-300">{selectedSquare}</span>
                    <span className="text-xs font-bold text-violet-300">Sélectionnée</span>
                    <Btn variant="ghost" onClick={() => setSelectedSquare(null)} className="!py-2 text-xs">Annuler</Btn>
                  </div>
                )}
                <Card className={`p-4 text-center text-sm font-bold ${isOver ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-300" : timedOut ? "border-rose-500/30 bg-rose-500/[0.08] text-rose-300" : myTurn ? "border-violet-500/30 bg-violet-500/[0.06] text-violet-300" : "text-[#6b6882]"}`}>{isOver ? (chess.isCheckmate() ? `Échec et mat — ${chess.turn() === myColor ? opponentName : pseudo} gagne` : "Partie nulle") : timedOut ? `Temps écoulé pour ${timedOut === pseudo ? "toi" : timedOut}` : myTurn ? "À toi de jouer" : `Au tour de ${opponentName}`}</Card>
                {moves.length > 0 && <Card className="p-4"><p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Coups</p><div className="flex flex-wrap gap-1.5">{moves.slice(-12).map((m) => <span key={m.id} className="rounded-lg bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] font-bold text-[#c4c0d4] ring-1 ring-white/[0.04]">{m.san}</span>)}</div></Card>}
                {isOver && matchDays.length > 0 && <Card className="p-4 text-center"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Prochain Joust</p><p className="mt-2 text-sm font-bold capitalize text-white">{computeNextOccurrence(match.timeOfDay, matchDays).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p><div className="mt-4"><Btn onClick={() => void patch({ action: "reschedule", scheduledAt: computeNextOccurrence(match.timeOfDay, matchDays).toISOString() }, "Joust reprogrammée")} disabled={saving}>Reprogrammer</Btn></div></Card>}
                {!isOver && !timedOut && (
                  <div className="grid grid-cols-2 gap-2">
                    <Btn variant="danger" onClick={() => void patch({ action: "resign", playerName: pseudo })} disabled={saving}>Abandonner</Btn>
                    {match.drawStatus === "proposed"
                      ? (match.drawProposedBy === (iAmCreator ? "creator" : "guest")
                          ? <Btn variant="secondary" disabled>En attente…</Btn>
                          : <Btn variant="secondary" onClick={() => void patch({ action: "draw-accept", playerName: pseudo }, "Nulle acceptée !")} disabled={saving}>Accepter la nulle</Btn>)
                      : <Btn variant="secondary" onClick={() => void patch({ action: "draw", playerName: pseudo }, "Proposition de nulle envoyée")} disabled={saving}>Proposer la nulle</Btn>}
                  </div>
                )}
                {isOver && (
                  <Card className="p-4 text-center">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Résultat</p>
                    <p className="mt-2 text-sm font-black text-white">
                      {match.winnerName
                        ? match.winnerName + " gagne (" + (match.result || "abandon") + ")"
                        : "Partie nulle" + (match.result ? " (" + match.result + ")" : "")}
                    </p>
                    {matchDays.length > 0 && (
                      <>
                        <p className="mt-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Prochain Joust</p>
                        <p className="mt-2 text-sm font-bold capitalize text-white">{computeNextOccurrence(match.timeOfDay, matchDays).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
                      </>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Btn onClick={() => void patch({ action: "rematch", scheduledAt: computeNextOccurrence(match.timeOfDay, matchDays).toISOString() }, "Revanche lancee !")} disabled={saving}>Revanche</Btn>
                      <Btn variant="secondary" onClick={() => { localStorage.removeItem(MATCH_KEY); setMatch(null); setMoves([]); setDays([1, 3, 5]); setTimeOfDay("20:30"); setTimeControl("blitz"); setScreen("create"); }}>Nouvelle joust</Btn>
                    </div>
                  </Card>
                )}
                {isOver && <Btn variant="ghost" onClick={leaveMatch}>Retour à l'accueil</Btn>}
                {!isOver && <Btn variant="ghost" onClick={leaveMatch}>Quitter</Btn>}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="relative z-10 border-t border-white/[0.04] bg-[#08090e]/80 py-4 text-center backdrop-blur-xl"><p className="text-[10px] font-bold text-[#3a3851]">Joust</p></footer>

      {/* QR modal */}
      {showQr && match && (
        <div className="fixed inset-0 z-[55] grid place-items-center bg-black/80 p-5 backdrop-blur-sm" onClick={() => setShowQr(false)}>
          <div className="anim-fade-up w-full max-w-xs rounded-[28px] border border-white/[0.08] bg-[#101018] p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><Badge tone="accent">Scanner pour rejoindre</Badge><button onClick={() => setShowQr(false)} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.04] text-[#6b6882] ring-1 ring-white/[0.06]"><X size={13} /></button></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/qr?url=${encodeURIComponent(inviteLink)}`} alt={`QR code pour rejoindre la joust ${match.inviteCode}`} className="mx-auto mt-5 h-56 w-56 rounded-2xl bg-white p-3" />
            <p className="mt-4 font-mono text-2xl font-black tracking-[0.28em] text-white">{match.inviteCode}</p>
            <p className="mt-2 text-[11px] leading-4 text-[#6b6882]">Ton ami scanne ce code avec l'appareil photo pour ouvrir la joust.</p>
          </div>
        </div>
      )}

      {/* Promotion modal (review 3.2 §1) */}
      {promotionPending && (
        <div className="fixed inset-0 z-[58] grid place-items-center bg-black/80 p-5 backdrop-blur-sm" onClick={() => setPromotionPending(null)}>
          <div className="anim-fade-up w-full max-w-xs rounded-[28px] border border-white/[0.08] bg-[#101018] p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <Badge tone="accent">Promotion</Badge>
            <p className="mt-3 text-sm font-black text-white">Choisis ta pièce</p>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {(["q", "r", "b", "n"] as const).map((p) => (
                <button key={p} type="button" onClick={() => {
                  void sendMove(promotionPending.from, promotionPending.to, p);
                  setPromotionPending(null);
                }} className="grid h-16 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] transition active:scale-90 hover:bg-white/[0.08]">
                  <ChessPiece color={myColor} type={p} className="h-10 w-10" />
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-[#6b6882]">Dame (D), Tour (T), Fou (F), Cavalier (C)</p>
          </div>
        </div>
      )}

      {/* Notification tutorial */}
      {tutorialOpen && match && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
          <div className="anim-fade-up max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-white/[0.08] bg-[#101018] p-6 shadow-2xl sm:rounded-[28px]">
            <div className="flex items-start justify-between gap-4"><div><Badge tone="accent">Notifications</Badge><h2 className="mt-3 text-xl font-black tracking-tight text-white">Soyez prévenus à l'heure H</h2><p className="mt-1.5 text-xs leading-5 text-[#6b6882]">Installe joust sur ton écran d'accueil, puis autorise les notifications.</p></div><button type="button" onClick={() => setTutorialOpen(false)} aria-label="Fermer" className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-[#6b6882] ring-1 ring-white/[0.06]"><X size={15} /></button></div>
            <div className="mt-5 flex items-center gap-4 rounded-2xl bg-white/[0.02] px-4 py-3 ring-1 ring-white/[0.05]">{[{ label: "Installée", done: standalone }, { label: "Notifications", done: pushSubscribed }].map((s) => <div key={s.label} className="flex items-center gap-2"><span className={`grid h-5 w-5 place-items-center rounded-full text-[9px] font-black ${s.done ? "bg-emerald-500 text-[#0a0f0a]" : "bg-white/[0.05] text-[#6b6882] ring-1 ring-white/[0.08]"}`}>{s.done ? <Check size={11} /> : "·"}</span><span className={`text-[10px] font-bold ${s.done ? "text-emerald-300" : "text-[#6b6882]"}`}>{s.label}</span></div>)}</div>
            <div className="mt-5 flex items-start gap-3"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl text-[11px] font-black ${standalone ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "bg-violet-600 text-white"}`}>1</span><div className="flex-1"><p className="text-sm font-extrabold text-white">Partage ton Joust</p><p className="mt-0.5 text-[11px] leading-4 text-[#6b6882]">{platform === "ios" ? <>Safari → <strong className="text-slate-300">Partager</strong> → <strong className="text-slate-300">Sur l'écran d'accueil</strong></> : platform === "android" ? <>Chrome → <strong className="text-slate-300">⋮</strong> → <strong className="text-slate-300">Installer l'application</strong></> : <>Chrome/Edge → icône <strong className="text-slate-300">+</strong> dans la barre d'adresse</>}</p>{!standalone && deferredPrompt.current && <div className="mt-2"><Btn variant="secondary" className="!py-2.5 text-xs" onClick={() => void deferredPrompt.current?.prompt()}>Installer maintenant</Btn></div>}</div></div>
            {platform === "ios" && !standalone && <div className="ml-10 mt-2 rounded-xl bg-amber-500/[0.06] px-3 py-2.5 ring-1 ring-amber-500/20"><p className="text-[11px] leading-4 text-amber-200/90">⚠️ Sur iPhone, les notifications ne marchent qu'une fois l'app installée et ouverte depuis l'écran d'accueil (iOS 16.4+).</p></div>}
            <div className="mt-5 flex items-start gap-3"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl text-[11px] font-black ${standalone ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "bg-violet-600 text-white"}`}>2</span><div className="flex-1"><p className="text-sm font-extrabold text-white">Installe Joust</p><p className="mt-0.5 text-[11px] text-[#6b6882]">Tu seras prévenu au top départ, même app fermée.</p><div className="mt-2.5"><Btn onClick={enableNotifs} disabled={pushSubscribed || (platform === "ios" && !standalone)} variant={pushSubscribed ? "secondary" : "primary"} className="!py-2.5 text-xs">{pushSubscribed ? "Activées ✓" : "Activer"}</Btn></div></div></div>
            <div className="mt-4 rounded-2xl bg-violet-600/[0.10] px-4 py-3 ring-1 ring-violet-500/20"><p className="text-xs text-violet-200 font-bold">Astuce : envoie le message copié, ou montre le QR pour inviter ton ami.</p></div>
            <div className="mt-5 border-t border-white/[0.05] pt-4"><Btn variant="ghost" onClick={() => setTutorialOpen(false)}>Plus tard</Btn></div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerBar({ name, color, active, clock, low }: { name: string; color: "w" | "b"; active: boolean; clock: string; low?: boolean }) {
  return <div className={`flex items-center justify-between rounded-2xl border px-4 py-2.5 transition-colors ${active ? "border-violet-500/30 bg-violet-600/[0.06]" : "border-white/[0.06] bg-[#13151d]"}`}><div className="flex items-center gap-2.5"><div className={`grid h-8 w-8 place-items-center rounded-lg shadow-md ring-1 ring-white/[0.06] ${color === "w" ? "bg-gradient-to-br from-[#3a2d55] to-[#2a1f3d]" : "bg-gradient-to-br from-[#1a1328] to-[#0e0918]"}`}><ChessPiece color={color} type="n" className={`h-6 w-6 ${color === "w" ? "text-[#e4d6ff]" : "text-[#6b5199]"}`} /></div><span className="text-xs font-extrabold text-white">{name}</span><Dot on={active} /></div><div className="flex items-center gap-2"><span className="rounded-lg bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-[#6b6882] ring-1 ring-white/[0.04]">{color === "w" ? "Blancs" : "Noirs"}</span><span className={`min-w-[3.2rem] rounded-lg px-2 py-1 text-center font-mono text-sm font-black ring-1 ${low ? "animate-pulse bg-rose-500/15 text-rose-300 ring-rose-500/30" : active ? "bg-violet-600/15 text-violet-200 ring-violet-500/30" : "bg-white/[0.04] text-[#c4c0d4] ring-white/[0.05]"}`}>{clock}</span></div></div>;
}