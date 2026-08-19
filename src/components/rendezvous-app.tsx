  "use client";

  import { Chess, type Square } from "chess.js";
  import { ArrowLeft, Bell, BellRing, Calendar, Check, ChevronDown, ChevronRight, ChevronUp, ChevronsUp, Copy, Filter, Frown, Handshake, History, LogOut, Minimize, Pencil, Plus, QrCode, Send, Settings, Share2, Swords, Trash2, Trophy, UserPlus, Users, X, Zap } from "lucide-react";
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
    gameType: string;
    gameState: Record<string, unknown> | null;
    timeControl: string;
    timeControlBy: string;
    timeControlConfirmed: boolean;
    clockWhiteSeconds: number;
    clockBlackSeconds: number;
    lastMoveAt: string | null;
    readyWhite: string | null;
    readyBlack: string | null;
    arrivalCreator: string | null;
    arrivalGuest: string | null;
    arrivalNoticeSentAt: string | null;
    arrivalNoticeCount: number;
    ultimatumSentAt: string | null;
    ultimatumDeadline: string | null;
    ultimatumBy: string | null;
    status: string;
    whitePlayer: string;
    blackPlayer: string;
    lastFen: string | null;
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
  type Screen = "auth" | "home" | "create" | "join" | "match" | "profile" | "history";

/* Friend item returned by /api/friends */
type Friend = { pseudo: string; addedAt: string };

/* Friend request returned by /api/friends/requests */
type FriendRequest = {
  id: string;
  fromPseudo: string;
  toPseudo: string;
  status: string;
  createdAt: string;
};

  /* History session (card) returned by /api/matches/history */
  type HistorySession = {
    id: string;
    opponent: string;
    timeOfDay: string;
    recurrenceDays: string;
    timeControl: string;
    wins: number;
    losses: number;
    draws: number;
    matchCount: number;
    matches: { match: Match; moves: { id: string; san: string; ply: number }[] }[];
  };
  type HistoryData = {
    totalWins: number;
    totalLosses: number;
    totalDraws: number;
    totalMatches: number;
    sessions: HistorySession[];
  };

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

  /* ── Stockage push (IndexedDB) : partagé avec le service worker.
    Le SW s'en sert pour poussubscriptionchange + notifications programmées. ── */
  const PUSH_CTX_DB = "joust-push";
  const PUSH_CTX_STORE = "ctx";

  function openPushCtxDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(PUSH_CTX_DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(PUSH_CTX_STORE)) {
          req.result.createObjectStore(PUSH_CTX_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /* Clé partagée avec le service worker : `pushsubscriptionchange` lit le
    contexte depuis IndexedDB sous cette clé pour ré-abonner automatiquement
    quand le navigateur renouvelle l'abonnement push. */
  const PUSH_CTX_KEY = "pushCtx";

  async function savePushContext(ctx: { matchId: string; playerName: string; notify5min: boolean }): Promise<void> {
    try {
      const db = await openPushCtxDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(PUSH_CTX_STORE, "readwrite");
        tx.objectStore(PUSH_CTX_STORE).put(ctx, PUSH_CTX_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch { /* IndexedDB indisponible : pas de ré-inscription auto */ }
  }

  async function clearPushContext(): Promise<void> {
    try {
      const db = await openPushCtxDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(PUSH_CTX_STORE, "readwrite");
        tx.objectStore(PUSH_CTX_STORE).delete(PUSH_CTX_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch { /* rien à nettoyer */ }
  }

  /* ── Notification locale programmée (Notification Triggers) ──
    Le client programme une notification LOCALE à scheduledAt via le SW.
    Elle se déclenche même si le lien push expire entre-temps. À chaque
    retour, on vérifie l'état et on re-programme/annule si besoin. ── */

  async function scheduleLocalNotif(params: {
    matchId: string;
    scheduledAt: string;
    title?: string;
    body?: string;
  }): Promise<void> {
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.active?.postMessage({
        type: "joust-schedule",
        matchId: params.matchId,
        scheduledAt: params.scheduledAt,
        title: params.title || "⏰ C'est l'heure de la joust !",
        body: params.body || "Valide ton arrivée pour lancer la partie.",
        url: "/",
      });
    } catch { /* SW indisponible — le push serveur reste la voie */ }
  }

  async function cancelScheduledNotif(): Promise<void> {
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.active?.postMessage({ type: "joust-cancel-schedule" });
    } catch { /* rien à faire */ }
  }

  /* ============================================= */
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
    const [myMatches, setMyMatches] = useState<Match[]>([]);
    const [now, setNow] = useState(() => Date.now());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
    const [dragStart, setDragStart] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState<string | null>(null);
    const [promotionPending, setPromotionPending] = useState<{ from: string; to: string } | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [showQr, setShowQr] = useState(false);
    const [drawModalOpen, setDrawModalOpen] = useState(false);
    const [tutorialOpen, setTutorialOpen] = useState(false);
    const [pushSubscribed, setPushSubscribed] = useState(false);
    const [serverPushSubscribed, setServerPushSubscribed] = useState<boolean | null>(null);
    const [notify5min, setNotify5min] = useState(true);
    const notify5minRef = useRef(true);
    const [editing, setEditing] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [confirmLogout, setConfirmLogout] = useState(false);
    const [showMoves, setShowMoves] = useState(false);
    const cancelTimer = useRef<number | null>(null);
    const deferredPrompt = useRef<{ prompt: () => Promise<void> } | null>(null);
    const prevWaitingRef = useRef(false);
    const platform = detectPlatform();
    const standalone = isStandalone();

    /* create form */
    const [timeOfDay, setTimeOfDay] = useState("20:30");
    const [days, setDays] = useState<number[]>([1, 3, 5]);
    const [timeControl, setTimeControl] = useState<TimeControlId>("blitz");
    /* join form */
    const [codeInput, setCodeInput] = useState("");
    const [joinError, setJoinError] = useState("");
    /* Menu "+" : choix entre créer ou rejoindre une joust */
    const [plusMenuOpen, setPlusMenuOpen] = useState(false);
    /* Card validée dépliée dans la liste (au lieu d'un écran séparé) */
    const [expandedId, setExpandedId] = useState<string | null>(null);
    /* Détrompeur 2 clics pour annuler un joust directement depuis la card dépliée */
    const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
    /* Info-bulle du bullet « jeu / cadence » dans les cards */
    const [infoTipId, setInfoTipId] = useState<string | null>(null);
    /* Éditeur de revanche / modification depuis la fin de partie */
    const [rematchOpen, setRematchOpen] = useState(false);
    /* Card de jeu repliée après la partie : on garde uniquement le
      résultat + les actions, le plateau disparaît pour aérer l'écran. */
    const [gameCardMinimized, setGameCardMinimized] = useState(false);
    /* Filtres : bouton on/off « validés » + entonnoir multi-états.
      `filtersVisible` (réglé dans le profil) : afficher ou non la barre
      de filtres en haut de la liste des jousts. */
    const [onlyValidated, setOnlyValidated] = useState(false);
    const [funnelOpen, setFunnelOpen] = useState(false);
    const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
    const [filtersVisible, setFiltersVisible] = useState(false);
    /* Réglages du profil (engrenage) : filtres + notifications groupés */
    const [settingsOpen, setSettingsOpen] = useState(false);
    /* Onglet actif de la card Amis : "amis" | "demandes" */
    const [friendTab, setFriendTab] = useState<"amis" | "demandes">("amis");

  /* Amis + historique */
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friendInput, setFriendInput] = useState("");
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendReqLoading, setFriendReqLoading] = useState(false);
    const [historyData, setHistoryData] = useState<HistoryData | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
    /* Invitation par pseudo (écran d'attente + création) */
    const [invitePseudoInput, setInvitePseudoInput] = useState("");
    const [inviteError, setInviteError] = useState("");

    const chess = useMemo(() => new Chess(match?.lastFen ?? undefined), [match?.lastFen]);

    /* ── identity ── */
    const iAmCreator = match ? match.creatorName === pseudo : false;
    const iAmGuest = match ? match.guestName === pseudo : false;
    const opponentName = match ? (iAmCreator ? match.guestName : match.creatorName) : "";
    const isWhite = match ? match.whitePlayer === pseudo : true;
    const myColor = isWhite ? "w" : "b";
    const lichessGameId = match?.gameState?.lichessGameId as string | undefined;
    const lichessGameUrl = lichessGameId ? `https://lichess.org/${lichessGameId}` : null;

    const hasOpponent = Boolean(match?.guestName);
    const accepted = match?.inviteStatus === "accepted";
    const declined = match?.inviteStatus === "declined";
    const paramsConfirmed = match?.timeControlConfirmed === true;
    const isPlaying = match?.status === "playing";
    const matchOver = match?.status === "completed" || match?.result != null;
    const chessStarted = Boolean(match && (isPlaying || matchOver));
    const isArmed = match?.status === "scheduled" && accepted && paramsConfirmed;
    const iAmArrived = match ? (iAmCreator ? Boolean(match.arrivalCreator) : iAmGuest ? Boolean(match.arrivalGuest) : false) : false;
    const oppArrived = match ? (iAmCreator ? Boolean(match.arrivalGuest) : Boolean(match.arrivalCreator)) : false;
    const bothArrived = Boolean(match?.arrivalCreator && match?.arrivalGuest);
    const arrivalCheckActive = Boolean(isArmed && !matchOver);
    const ultimatumActive = Boolean(match?.ultimatumDeadline);
    const ultimatumByMe = match ? (match.ultimatumBy ?? "creator") === (iAmCreator ? "creator" : "guest") : false;
    const ultimatumAgainstMe = Boolean(match?.ultimatumDeadline) && !ultimatumByMe;
    const ultimatumDeadlineLeft = match?.ultimatumDeadline ? Math.max(0, Math.floor((new Date(match.ultimatumDeadline).getTime() - now) / 1000)) : 0;
    const nudgeCooldownLeft = match?.arrivalNoticeSentAt ? Math.max(0, 60 - Math.floor((now - new Date(match.arrivalNoticeSentAt).getTime()) / 1000)) : 0;
    const isOver = chess.isGameOver() || matchOver;
    const matchDays = useMemo(() => parseDays(match?.recurrenceDays), [match?.recurrenceDays]);
    /* ── Fin de partie : résultat enrichi + prochaine occurrence ── */
    const iWon = Boolean(match?.winnerName && match.winnerName === pseudo);
    const iLost = Boolean(match?.winnerName && match.winnerName === opponentName);
    const nextJoustDate = match && matchDays.length > 0 ? computeNextOccurrence(match.timeOfDay, matchDays) : null;
    const resultTitle = iWon ? "🏆 Victoire !" : iLost ? "💔 Défaite" : "🤝 Partie nulle";
    const resultDetail = match?.winnerName
      ? `${match.winnerName} gagne (${match.result || "abandon"})`
      : `Partie nulle${match?.result ? ` (${match.result})` : ""}`;
    const resultTone = iWon
      ? "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300"
      : iLost
        ? "border-rose-500/30 bg-rose-500/[0.08] text-rose-300"
        : "border-amber-500/30 bg-amber-500/[0.06] text-amber-300";
    const resultDot = iWon ? "bg-emerald-400" : iLost ? "bg-rose-400" : "bg-amber-400";
    const tc = match ? tcInfo(match.timeControl) : TIME_CONTROLS[timeControl];
    const timeLeft = match ? new Date(match.scheduledAt).getTime() - now : 0;
    const ms = Math.max(0, timeLeft);
    const dd = Math.floor(ms / 86_400_000);
    const hh = String(Math.floor((ms % 86_400_000) / 3_600_000)).padStart(2, "0");
    const mmv = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
    const ssv = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
    /* La validation d'arrivée n'est débloquée qu'à l'heure prévue de la joust
      (jamais avant). Aucun timer ne se déclenche automatiquement. */
    const arrivalUnlocked = Boolean(isArmed && !matchOver && timeLeft <= 0);

    const lastProposalByMe = match ? (iAmCreator ? match.timeControlBy === "creator" : match.timeControlBy === "guest") : false;
    const iMustAnswer = Boolean(match && hasOpponent && !accepted && !lastProposalByMe);
    const waitingOnOpponent = Boolean(match && hasOpponent && !accepted && lastProposalByMe);

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

    /* Destinations légales de la pièce sélectionnée : met en évidence les cases
      où il est possible de jouer (clic ou glisser-déposer). */
    const legalTargets = useMemo(() => {
      if (!myTurn || !selectedSquare) return new Set<string>();
      const piece = chess.get(selectedSquare as Square);
      if (!piece || piece.color !== myColor) return new Set<string>();
      return new Set(chess.moves({ square: selectedSquare as Square, verbose: true }).map((m) => m.to));
    }, [chess, myTurn, selectedSquare, myColor]);

    const notify = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 3500); }, []);
    const apply = useCallback((p: { match: Match; moves?: Move[] }) => { setMatch(p.match); if (p.moves) setMoves(p.moves); }, []);
    const load = useCallback(async (id: string) => {
      try {
        const r = await fetch(`/api/matches/${id}`, { cache: "no-store" });
        if (r.ok) apply((await r.json()) as { match: Match; moves: Move[] });
      } catch { /* */ }
    }, [apply]);

    /* Charge la liste des jousts de l'utilisateur (triée par proximité). */
    const loadMyMatches = useCallback(async () => {
      try {
        const r = await fetch("/api/matches/mine", { cache: "no-store" });
        if (r.ok) {
          const d = (await r.json()) as { matches?: Match[] };
          if (d.matches) setMyMatches(d.matches);
        }
      } catch { /* */ }
    }, []);

  /* Charge la liste d'amis de l'utilisateur connecté. */
  const loadFriends = useCallback(async () => {
    if (!authUser) return;
    try {
      const r = await fetch("/api/friends", { cache: "no-store" });
      if (r.ok) {
        const d = (await r.json()) as { friends?: Friend[] };
        if (d.friends) setFriends(d.friends);
      }
    } catch { /* */ }
  }, [authUser]);

  /* Charge les demandes d'ami reçues en attente. */
  const loadFriendRequests = useCallback(async () => {
    if (!authUser) return;
    try {
      const r = await fetch("/api/friends/requests", { cache: "no-store" });
      if (r.ok) {
        const d = (await r.json()) as { requests?: FriendRequest[] };
        if (d.requests) setFriendRequests(d.requests);
      }
    } catch { /* */ }
  }, [authUser]);

    /* Charge l'historique des parties terminées. */
    const loadHistory = useCallback(async () => {
      if (!authUser) return;
      setHistoryLoading(true);
      try {
        const r = await fetch("/api/matches/history", { cache: "no-store" });
        if (r.ok) {
          const d = (await r.json()) as HistoryData;
          setHistoryData(d);
        }
      } catch { /* */ } finally { setHistoryLoading(false); }
    }, [authUser]);

    /* Ouvre un joust depuis la liste des cards.
      Les jousts validées (armed) restent sur l'accueil : la card dépliée gère
      déjà l'arrivée et le lancement — pas besoin d'un écran intermédiaire. */
    const openMatch = useCallback(async (m: Match) => {
      const isArmedMatch = m.status === "scheduled" && m.inviteStatus === "accepted" && m.timeControlConfirmed && !m.result;
      if (isArmedMatch) {
        setExpandedId(m.id);
        setScreen("home");
        return;
      }
      localStorage.setItem(MATCH_KEY, m.id);
      await load(m.id);
      setScreen("match");
    }, [load]);

    /* Ré-enregistre l'abonnement navigateur côté serveur s'il a disparu.
      Retourne true si l'abonnement serveur est actif après la synchro. */
    const syncServerSubscription = useCallback(
      async (sub: PushSubscription): Promise<boolean> => {
        if (!match || !pseudo) return false;
        try {
          const r = await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              matchId: match.id,
              playerName: pseudo,
              notify5min: notify5minRef.current,
              subscription: sub.toJSON(),
            }),
          });
          const d = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
          if (r.ok) {
            setServerPushSubscribed(true);
            /* Partage le contexte avec le service worker pour le
              pushsubscriptionchange (ré-abonnement auto même app fermée). */
            void savePushContext({ matchId: match.id, playerName: pseudo, notify5min: notify5minRef.current });
            return true;
          }
          setServerPushSubscribed(false);
          console.warn("[push] Ré-enregistrement serveur échoué:", r.status, d?.error);
          return false;
        } catch {
          setServerPushSubscribed(false);
          return false;
        }
      },
      [match?.id, pseudo],
    );

    const refreshNotif = useCallback(() => {
      if (typeof Notification === "undefined") { setPushSubscribed(false); return; }
      if (!("serviceWorker" in navigator)) { setPushSubscribed(false); return; }
      let cancelled = false;
      const t = window.setTimeout(() => { if (!cancelled) setPushSubscribed(false); }, 6000);
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then(async (s) => {
          const localSub = Boolean(s);
          if (cancelled) return;

          /* Souscription navigateur perdue MAIS permission encore accordée
            (ex: pushsubscriptionchange n'a pas pu s'exécuter, purge du SW…) →
            ré-abonnement silencieux + ré-enregistrement serveur. */
          if (!s && Notification.permission === "granted" && match?.id && pseudo) {
            try {
              const v = (await (await fetch("/api/push/vapid", { cache: "no-store" })).json()) as { publicKey?: string };
              if (v.publicKey) {
                const reg = await navigator.serviceWorker.ready;
                const newSub = await reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(v.publicKey),
                });
                if (cancelled) return;
                setPushSubscribed(true);
                await syncServerSubscription(newSub);
              }
            } catch {
              if (!cancelled) setPushSubscribed(false);
            }
            return;
          }

          setPushSubscribed(localSub);
          if (!s) {
            setServerPushSubscribed(false);
            return;
          }
          if (!match?.id || !pseudo) return;
          try {
            const r = await fetch(`/api/push/status?matchId=${encodeURIComponent(match.id)}&playerName=${encodeURIComponent(pseudo)}`, { cache: "no-store" });
            const d = (await r.json().catch(() => null)) as { subscribed?: boolean; notify5min?: boolean } | null;
            if (cancelled) return;
            if (d && typeof d.subscribed === "boolean") {
              if (d.subscribed) {
                setServerPushSubscribed(true);
                if (typeof d.notify5min === "boolean") {
                  setNotify5min(d.notify5min);
                  notify5minRef.current = d.notify5min;
                }
              } else {
                /* Abonnement navigateur présent mais absent côté serveur
                  (purge, endpoint unique écrasé, …) → ré-enregistrement auto. */
                await syncServerSubscription(s);
              }
            }
          } catch { /* statut indisponible : on garde l'état courant */ }
        })
        .catch(() => { if (!cancelled) setPushSubscribed(false); })
        .finally(() => window.clearTimeout(t));
      return () => { cancelled = true; window.clearTimeout(t); };
    }, [match?.id, pseudo, syncServerSubscription]);

    /* ── auth ── */
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
        if (!codeInput) { void loadMyMatches(); void loadFriends(); void loadFriendRequests(); }
        setScreen(codeInput ? "join" : "home");
      } catch { setAuthError("Connexion impossible."); } finally { setSaving(false); }
    }

    function handleLogoutClick() {
      setConfirmLogout(true);
    }

    function cancelLogout() {
      setConfirmLogout(false);
    }

    async function logout() {
      setConfirmLogout(false);
      try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* */ }
      void clearPushContext();
      void cancelScheduledNotif();
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
    useEffect(() => {
      if (!("serviceWorker" in navigator)) return;
      let reloading = false;
      const onControllerChange = () => {
        /* Un nouveau service worker a pris le contrôle → on recharge la page
          pour servir le code et les styles les plus récents (ex: safe areas iOS). */
        if (reloading) return;
        reloading = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      /* PWA : on demande au navigateur de NE PAS utiliser le cache HTTP pour le
        SW (les en-têtes no-cache de next.config.ts le garantissent côté serveur).
        On force aussi update() à chaque chargement pour que l'app installée
        récupère les nouveaux styles dès qu'elle est ouverte. */
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
      const t = window.setTimeout(() => {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg) {
            reg.update().catch(() => undefined);
          }
        });
      }, 2000);
      return () => {
        window.clearTimeout(t);
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      };
    }, []);
    useEffect(() => {
      (async () => {
        try {
          const urlCode = new URLSearchParams(window.location.search).get("code");
          if (urlCode) setCodeInput(urlCode.toUpperCase());
          try {
            const r = await fetch("/api/auth/me", { cache: "no-store" });
            if (r.ok) {
              const d = (await r.json()) as { user?: NonNullable<AuthUser> };
              if (d.user) {
                setAuthUser(d.user);
                setPseudo(d.user.pseudo);
                if (urlCode) { setScreen("join"); return; }
                /* Affiche toujours la liste des jousts à la connexion :
                  le bouton « + » et les cards sont le point d'entrée. */
                void loadMyMatches();
                void loadFriends();
                void loadFriendRequests();
                setScreen("home");
                return;
              }
            }
          } catch { /* session cookie absent */ }
          setScreen("auth");
        } catch { setScreen("auth"); } finally { setLoading(false); refreshNotif(); }
      })();
      /* Exécution UNIQUE au boot : ne doit pas se relancer quand match.id change
        (sinon retour intempestif à l'accueil pendant le partage ou le jeu). */
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { const h = (e: Event) => { e.preventDefault(); deferredPrompt.current = e as unknown as { prompt: () => Promise<void> }; }; window.addEventListener("beforeinstallprompt", h); window.addEventListener("focus", refreshNotif); return () => { window.removeEventListener("beforeinstallprompt", h); window.removeEventListener("focus", refreshNotif); }; }, [refreshNotif]);
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);

    /* Canal temps réel unique : SSE — le backend pousse les changements depuis le
      stream Lichess (coups, horloges, fin) et met à jour la base toutes les 500 ms.
      Plus aucun polling 8 s ni Supabase Realtime (broadcast fire-and-forget peu fiable). */
    useEffect(() => {
      if (!match || screen !== "match") return;
      if (typeof EventSource === "undefined") return;
      let stopped = false;
      let es: EventSource | null = null;
      let retry: number | undefined;
      const connect = () => {
        try { es = new EventSource(`/api/matches/${match.id}/stream`); }
        catch { retry = window.setTimeout(connect, 2000); return; }
        es.addEventListener("update", () => { if (!stopped) void load(match.id); });
        es.onerror = () => { es?.close(); if (!stopped) retry = window.setTimeout(connect, 2000); };
      };
      connect();
      return () => { stopped = true; if (retry) window.clearTimeout(retry); es?.close(); };
    }, [match?.id, screen, load]);
    useEffect(() => { if (match?.status === "scheduled" && accepted && paramsConfirmed && timeLeft <= 0) void load(match.id); }, [timeLeft, match?.id, match?.status, accepted, paramsConfirmed, load]);

    /* ── Notification locale programmée (Notification Triggers) ──
      Programme une notification à scheduledAt quand la joust est armée.
      À chaque changement d'état, on vérifie que la programmation correspond. */
    useEffect(() => {
      if (!match) return;
      const expectScheduled =
        match.status === "scheduled" && match.inviteStatus === "accepted" && match.timeControlConfirmed;

      if (expectScheduled && new Date(match.scheduledAt).getTime() > Date.now()) {
        void scheduleLocalNotif({
          matchId: match.id,
          scheduledAt: match.scheduledAt,
          title: "⏰ C'est l'heure de la joust !",
          body: `${match.creatorName} vs ${match.guestName} — valide ton arrivée pour lancer la partie.`,
        });
      } else {
        /* Match non armé / annulé / terminé → annule la programmation locale. */
        void cancelScheduledNotif();
      }
    }, [match?.id, match?.status, match?.inviteStatus, match?.timeControlConfirmed, match?.scheduledAt, match?.creatorName, match?.guestName]);

    /* Tuto notifications : ne s'auto-ouvre QUE si l'utilisateur n'a jamais vu le tuto ET n'est pas abonné. */
    useEffect(() => {
      if (match && match.inviteStatus === "accepted" && match.timeControlConfirmed && !pushSubscribed && !tutorialOpen) {
        const shown = localStorage.getItem("joust-notif-tutorial-shown");
        if (!shown) { setTutorialOpen(true); localStorage.setItem("joust-notif-tutorial-shown", "1"); }
      }
    }, [match?.inviteStatus, match?.timeControlConfirmed, pushSubscribed, tutorialOpen]);
    useEffect(() => setSelectedSquare(null), [match?.lastFen]);

    /* Popup de proposition de nulle : s'ouvre automatiquement quand l'adversaire propose. */
    useEffect(() => {
      if (match?.drawStatus === "proposed" && match.drawProposedBy !== (iAmCreator ? "creator" : "guest") && chessStarted && !isOver) {
        setDrawModalOpen(true);
      }
    }, [match?.drawStatus, match?.drawProposedBy, iAmCreator, chessStarted, isOver]);
    /* La popup se referme quand la proposition est traitée ou la partie finie. */
    useEffect(() => {
      if (!chessStarted || isOver || match?.drawStatus !== "proposed") setDrawModalOpen(false);
    }, [chessStarted, isOver, match?.drawStatus]);

    /* Notification visuelle quand l'adversaire modifie la proposition. */
    useEffect(() => {
      if (!match) return;
      const prevWaiting = prevWaitingRef.current;
      prevWaitingRef.current = waitingOnOpponent;
      if (prevWaiting && !waitingOnOpponent && iMustAnswer && hasOpponent && !accepted) {
        notify("🔄 Ton adversaire a modifié la proposition.");
      }
    }, [match, waitingOnOpponent, iMustAnswer, hasOpponent, accepted, notify]);

    /* ── share ── */
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
        if (d.match) { localStorage.setItem(MATCH_KEY, d.match.id); setMoves([]); apply({ match: d.match, moves: [] }); void loadMyMatches(); setScreen("match"); }
        else notify(d.error ?? "Création impossible");
      } catch { notify("Création impossible"); } finally { setSaving(false); }
    }

    /* Envoie une invitation à un pseudo via le code d'invitation de la joust.
      Le destinataire recevra le code (partage) et pourra rejoindre. */
    async function inviteByPseudo(targetPseudo: string) {
      if (!match || !targetPseudo.trim()) { setInviteError("Pseudo requis."); return; }
      setInviteError(""); setSaving(true);
      try {
        const msg =
          `♞ ${pseudo} t'invite à une joust !\n` +
          `⏰ ${describeRecurrence(match.timeOfDay, matchDays)}\n` +
          `⚡ ${tc.label} (${tc.tag})\n` +
          `Code : ${match.inviteCode}\n` +
          `Rejoins : ${inviteLink}`;
        /* Pas d'envoi serveur — le navigateur partage via Web Share ou copie
          pour l'instant ; le pseudo est validé côté client. */
        if (navigator.share) {
          try { await navigator.share({ title: "Joust", text: msg }); return; } catch { /* cancelled */ }
        }
        await copy(msg, `Invitation envoyée à ${targetPseudo} !`);
      } catch { setInviteError("Impossible d'envoyer l'invitation."); } finally { setSaving(false); }
    }

  /* Envoie une demande d'ami par pseudo (le destinataire doit accepter). */
  async function addFriend(p: string) {
    const target = p.trim();
    if (!target) return;
    setFriendLoading(true);
    try {
      const r = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pseudo: target }),
      });
      const d = (await r.json()) as { friend?: Friend; error?: string; acceptedIncoming?: boolean };
      if (d.friend) {
        setFriends((prev) => [...prev, d.friend!]);
        setFriendInput("");
        notify(d.acceptedIncoming ? `${d.friend.pseudo} est maintenant ton ami !` : `${d.friend.pseudo} ajouté à tes amis !`);
      } else {
        notify(d.error ?? "Demande impossible");
      }
    } catch { notify("Demande impossible"); } finally { setFriendLoading(false); }
  }

  /* Répond à une demande d'ami reçue (accept ou decline). */
  async function respondFriendRequest(id: string, action: "accept" | "decline") {
    setFriendReqLoading(true);
    try {
      const r = await fetch("/api/friends/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const d = (await r.json()) as { ok?: boolean; friend?: Friend; error?: string };
      if (!d.ok) { notify(d.error ?? "Réponse impossible"); return; }
      /* Retire la demande de la liste. */
      setFriendRequests((prev) => prev.filter((x) => x.id !== id));
      if (d.friend) {
        setFriends((prev) => [...prev, d.friend!]);
        notify(`${d.friend.pseudo} est maintenant ton ami ! 🎉`);
      } else {
        notify("Demande refusée.");
      }
    } catch { notify("Réponse impossible"); } finally { setFriendReqLoading(false); }
  }

    /* Retire un ami de la liste. */
    async function removeFriend(p: string) {
      try {
        await fetch(`/api/friends/${encodeURIComponent(p)}`, { method: "DELETE" });
        setFriends((prev) => prev.filter((f) => f.pseudo !== p));
        notify(`${p} retiré de tes amis.`);
      } catch { notify("Suppression impossible"); }
    }

    async function joinByCode(e: React.FormEvent) {
      e.preventDefault(); setJoinError(""); setSaving(true);
      try {
        const code = codeInput.trim().toUpperCase();
        const r = await fetch(`/api/matches/code/${code}`, { cache: "no-store" });
        const d = (await r.json()) as { match?: Match; error?: string };
        if (!d.match) { setJoinError(d.error ?? "Code introuvable."); return; }
        if (!d.match.guestName || d.match.guestName === pseudo) {
          const jr = await fetch(`/api/matches/${d.match.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", playerName: pseudo }) });
          const jd = (await jr.json()) as { match?: Match; error?: string };
          if (!jd.match) { setJoinError(jd.error ?? "Impossible de rejoindre."); return; }
          localStorage.setItem(MATCH_KEY, jd.match.id); apply({ match: jd.match }); void loadMyMatches(); setScreen("match");
          window.history.replaceState({}, "", "/");
        } else if (d.match.creatorName === pseudo) {
          localStorage.setItem(MATCH_KEY, d.match.id); apply({ match: d.match }); void loadMyMatches(); setScreen("match");
        } else {
          setJoinError("Cette joust a déjà deux joueurs.");
        }
      } catch { setJoinError("Connexion impossible."); } finally { setSaving(false); }
    }

    const patch = useCallback(async (body: Record<string, unknown>, msg?: string) => {
      if (!match) return; setSaving(true);
      try {
        const payload = { ...body, playerName: body.playerName ?? pseudo };
        const r = await fetch(`/api/matches/${match.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const d = (await r.json()) as { match?: Match; moves?: Move[]; error?: string };
        if (d.match) { apply({ match: d.match, moves: d.moves }); if (msg) notify(msg); } else if (d.error) notify(d.error);
      } catch { notify("Action impossible"); } finally { setSaving(false); }
    }, [match, apply, notify, pseudo]);

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

    /* Ouvre l'éditeur de revanche / modification depuis la fin de partie,
      prérempli avec les paramètres de la partie qui vient de se terminer. */
    function openRematchEditor() {
      if (!match) return;
      setTimeOfDay(match.timeOfDay); setDays(matchDays); setTimeControl(tcInfo(match.timeControl).id); setRematchOpen(true);
    }

    /* Envoie une proposition de revanche (rematch=true pour inverser les couleurs)
      ou une simple modification (rematch=false) — l'adversaire reçoit la
      notification et doit valider via l'action accept. */
    function sendRematchProposal(rematch: boolean) {
      if (!match) return;
      const next = computeNextOccurrence(timeOfDay, days);
      void patch(
        { action: "counter", by: iAmCreator ? "creator" : "guest", timeControl, timeOfDay, recurrenceDays: formatDays(days), scheduledAt: next.toISOString(), rematch },
        rematch ? "⚔️ Proposition de revanche envoyée" : "Modification envoyée",
      );
      setRematchOpen(false);
    }

    async function sendMove(from: string, to: string, promotion?: string) {
      if (!match || !myTurn) return; setSaving(true);
      try {
        const r = await fetch(`/api/matches/${match.id}/moves`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to, promotion, playerName: pseudo }) });
        const d = (await r.json()) as { move?: Move; match?: Match; error?: string };
        if (d.move && d.match) { const nm = [...moves, d.move]; setMoves(nm); apply({ match: d.match, moves: nm }); } else if (d.error) notify(d.error);
      } catch { /* */ } finally { setSelectedSquare(null); setSaving(false); }
    }

    function maybePromote(from: string, to: string) {
      const target = chess.get(to as Square);
      const isPromotion = target?.type === "p" && (to.endsWith("8") || to.endsWith("1"));
      if (isPromotion) { setPromotionPending({ from, to }); return; }
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

    /* ── Notifications ── */
    async function enableNotifs() {
      if (!match) return;
      if (typeof Notification === "undefined") {
        setTutorialOpen(false);
        return notify("Notifications non supportées par ce navigateur.");
      }
      try {
        /* iOS 16.4+ : le push Web exige HTTPS ET une PWA installée (standalone).
          iPhones exige HTTPS même pour localhost — aucun contournement en HTTP. */
        if (typeof window !== "undefined" && window.location.protocol !== "https:") {
          setTutorialOpen(false);
          notify(`🔒 Les notifications iOS exigent HTTPS. URL actuelle : ${window.location.host} (${window.location.protocol}). Utilisez le déploiement en ligne HTTPS (ex. Vercel).`);
          return;
        }
        /* iOS 16.4+ : l'abonnement push n'est possible qu'en PWA installée (standalone). */
        if (platform === "ios" && !standalone) {
          setTutorialOpen(false);
          notify("📲 Installe d'abord Joust depuis Safari → Partager → « Sur l'écran d'accueil », puis réouvre l'app pour activer les notifications.");
          return;
        }

        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setPushSubscribed(false);
          setTutorialOpen(false);
          return notify("Notifications refusées. Réactive-les dans les réglages du navigateur.");
        }

        const v = (await (await fetch("/api/push/vapid", { cache: "no-store" })).json()) as { publicKey?: string };
        if (!v.publicKey) {
          setTutorialOpen(false);
          return notify("Erreur serveur : clé VAPID absente.");
        }

        const swReady = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("sw-timeout")), 8000)),
        ]);

        const sub = await swReady.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(v.publicKey),
        });

        setPushSubscribed(true);
        setTutorialOpen(false);

        const ok = await syncServerSubscription(sub);
        if (ok) {
          notify("🔔 Notifications activées !");
        } else {
          notify("⚠️ Abonné mais non enregistré sur le serveur.");
        }
      } catch (err) {
        setTutorialOpen(false);
        setPushSubscribed(false);
        const name = err instanceof Error ? err.name : "Inconnu";
        const msg = err instanceof Error ? err.message : String(err);
        if (name === "TimeoutError" || (err instanceof Error && err.message === "sw-timeout")) {
          notify("Service worker trop lent. Réessaie dans un instant.");
        } else {
          notify(`❌ Échec abonnement (${name}) : ${msg.slice(0, 120)}`);
        }
      }
    }

    /* Push manuel de test : ré-enregistre d'abord si l'abonnement serveur a disparu. */
    async function testPush() {
      if (!match) return;
      try {
        setSaving(true);
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            const r = await fetch(`/api/push/status?matchId=${encodeURIComponent(match.id)}&playerName=${encodeURIComponent(pseudo)}`, { cache: "no-store" });
            const d = (await r.json().catch(() => null)) as { subscribed?: boolean } | null;
            if (d && d.subscribed === false) {
              await syncServerSubscription(sub);
            }
          }
        }
        const r = await fetch("/api/push/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId: match.id, title: "🔔 Joust — Test", body: `Ceci est un test. Si tu vois ceci, tout fonctionne ! (${new Date().toLocaleTimeString("fr-FR")})` }),
        });
        const d = (await r.json()) as { ok?: boolean; sent?: number; error?: string };
        if (d.ok) notify(`✅ Notification envoyée à ${d.sent} appareil(s).`);
        else notify(d.error ?? "Envoi impossible.");
      } catch { notify("Envoi impossible."); } finally { setSaving(false); }
    }

    /* Retour simple à l'accueil depuis le détail d'une card (sans annuler). */
    function goHome() {
      localStorage.removeItem(MATCH_KEY); setMatch(null); setMoves([]); setScreen("home"); void loadMyMatches();
    }

    /* Ouvre le profil : les filtres (validés + entonnoir) y sont accessibles. */
    function goProfile() {
      if (screen === "profile") { setScreen("home"); return; }
      setScreen("profile");
    }

    function leaveMatch() {
      void cancelScheduledNotif();
      /* Quitter une joust active l'annule côté serveur (statut « cancelled »),
        ce qui retire définitivement la card de la liste. */
      if (match && (match.status === "scheduled" || match.status === "playing") && !matchOver) {
        void patch({ action: "cancel", playerName: pseudo });
      }
      localStorage.removeItem(MATCH_KEY); setMatch(null); setMoves([]); setScreen("home"); void loadMyMatches();
    }

    /* Annulation en 2 clics : 1er clic → le bouton passe en rouge,
      2e clic → annulation réelle + notification à l'adversaire. */
    function handleCancelClick() {
      if (!match) return;
      if (!confirmCancel) {
        setConfirmCancel(true);
        if (cancelTimer.current) window.clearTimeout(cancelTimer.current);
        cancelTimer.current = window.setTimeout(() => setConfirmCancel(false), 4000);
        return;
      }
      if (cancelTimer.current) window.clearTimeout(cancelTimer.current);
      setConfirmCancel(false);
      void patch({ action: "cancel", playerName: pseudo }, "Joust annulée");
      localStorage.removeItem(MATCH_KEY);
      setMatch(null);
      setMoves([]);
      setScreen("home");
      void loadMyMatches();
    }

    /* Annulation d'un joust directement depuis sa card dépliée (détrompeur 2 clics). */
    const cancelCardTimer = useRef<number | null>(null);
    async function handleCardCancelClick(m: Match) {
      if (cancelConfirmId !== m.id) {
        setCancelConfirmId(m.id);
        if (cancelCardTimer.current) window.clearTimeout(cancelCardTimer.current);
        cancelCardTimer.current = window.setTimeout(() => setCancelConfirmId(null), 4000);
        return;
      }
      if (cancelCardTimer.current) window.clearTimeout(cancelCardTimer.current);
      setCancelConfirmId(null);
      try {
        const r = await fetch(`/api/matches/${m.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel", playerName: pseudo }),
        });
        const d = (await r.json()) as { match?: Match; error?: string };
        if (d.error) notify(d.error);
        else notify("Joust annulée");
      } catch { notify("Annulation impossible"); }
      if (match?.id === m.id) { localStorage.removeItem(MATCH_KEY); setMatch(null); setMoves([]); }
      setMyMatches((prev) => prev.filter((x) => x.id !== m.id));
    }
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

    if (loading) return <div className="flex min-h-dvh items-center justify-center bg-[#08090e]"><div className="anim-fade-up flex flex-col items-center gap-5"><div className="relative h-14 w-14"><div className="absolute inset-0 rounded-full bg-violet-600/30 blur-xl" /><div className="anim-spin relative grid h-14 w-14 place-items-center rounded-full bg-[#13151d] ring-1 ring-white/[0.06]"><ChessPiece color="w" type="k" className="h-8 w-8 text-[#e4d6ff]" /></div></div><p className="text-sm font-extrabold text-white">Joust</p></div></div>;

    return (
      <div className="flex min-h-dvh flex-col bg-[#08090e] pb-[var(--safe-bottom)]">
        <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className="absolute -top-48 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-violet-700/[0.07] blur-[120px]" /><div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-violet-700/[0.05] blur-[100px]" /></div>
        {toast && <div className="anim-fade-up fixed left-1/2 top-[calc(var(--safe-top)+5rem)] z-[60] w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2"><div className="rounded-2xl border border-violet-500/25 bg-[#1a1626] px-4 py-3 text-center text-xs font-bold text-violet-200 shadow-2xl shadow-black/40">{toast}</div></div>}

        {/* Header */}
        {screen !== "auth" && (
          <header className="sticky top-0 z-30 border-b border-white/[0.04] bg-[#08090e]/80 pt-[var(--safe-top)] backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-5">
              <div className="flex items-center gap-2.5">
                {(screen === "create" || screen === "join" || screen === "match" || screen === "profile" || screen === "history") ? (
                  <button onClick={() => (screen === "match" ? goHome() : screen === "profile" ? goProfile() : setScreen("home"))} aria-label="Retour" className="grid h-7 w-7 place-items-center rounded-xl bg-white/[0.04] text-[#c4c0d4] ring-1 ring-white/[0.06] active:scale-90"><ArrowLeft size={15} /></button>
                ) : (
                  <div className="grid h-7 w-7 place-items-center rounded-xl bg-violet-600 shadow-md shadow-violet-600/30"><ChessPiece color="w" type="n" className="h-5 w-5 text-white" /></div>
                )}
                <span className="text-sm font-extrabold tracking-tight text-white">Joust</span>
              </div>
              <div className="flex items-center gap-2">
  {pseudo && <button type="button" onClick={goProfile} className="flex items-center gap-1.5 rounded-xl bg-white/[0.03] px-2.5 py-1.5 ring-1 ring-white/[0.06] transition active:scale-95 hover:bg-white/[0.06]"><span className="grid h-5 w-5 place-items-center rounded-md bg-violet-600/30 text-[9px] font-black text-violet-200">{pseudo.slice(0, 2).toUpperCase()}</span><span className="text-[11px] font-extrabold text-white">{pseudo}</span></button>}
                {/* Cloche demandes d'amis : badge quand il y a des demandes en attente */}
                {authUser && (
                  <button
                    type="button"
                    aria-label={`${friendRequests.length} demande${friendRequests.length > 1 ? "s" : ""} d'ami`}
                    title={friendRequests.length > 0 ? `${friendRequests.length} demande${friendRequests.length > 1 ? "s" : ""} d'ami en attente` : "Demandes d'amis"}
                    className={`relative grid h-8 w-8 place-items-center rounded-xl ring-1 transition active:scale-90 ${friendRequests.length > 0 ? "bg-amber-500/15 text-amber-300 ring-amber-500/30" : "bg-white/[0.04] text-[#6b6882] ring-white/[0.06] hover:text-violet-300"}`}
                    onClick={() => { setScreen("profile"); setFriendTab("demandes"); }}
                  >
                    <Bell size={14} />
                    {friendRequests.length > 0 && (
                      <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white shadow-md shadow-rose-500/40">{friendRequests.length}</span>
                    )}
                  </button>
                )}
                {authUser && <button type="button" onClick={handleLogoutClick} aria-label="Se déconnecter" title="Se déconnecter" className="grid h-8 w-8 place-items-center rounded-xl bg-white/[0.04] text-[#6b6882] ring-1 ring-white/[0.06] transition active:scale-90 hover:text-rose-300"><LogOut size={14} /></button>}
              </div>
            </div>
          </header>
        )}

        <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-5 py-8">

          {/* ══ 1. AUTH ══ */}
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

          {/* ══ 2. HOME — liste des jousts ══ */}
          {screen === "home" && (
            <div className="anim-fade-up w-full">
              {myMatches.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-5 py-14 text-center">
                  <div className="grid h-16 w-16 place-items-center rounded-[24px] border border-white/[0.06] bg-[#13151d] shadow-xl shadow-black/20"><Swords size={26} className="text-[#6b6882]" /></div>
                  <div>
                    <h1 className="text-xl font-black tracking-tight text-white">Aucun joust en cours</h1>
                    <p className="mx-auto mt-2 max-w-xs text-sm leading-5 text-[#6b6882]">Crée un nouveau rendez-vous échecs avec un ami, ou rejoins une joust avec un code.</p>
                  </div>
                  <div className="w-full max-w-xs space-y-2.5">
                    <button onClick={() => setScreen("create")} className="w-full rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 py-3.5 text-sm font-extrabold text-white shadow-2xl shadow-violet-700/30 transition-all duration-200 hover:brightness-110 active:scale-[0.97]"><span className="inline-flex items-center justify-center gap-2"><Plus size={16} /> Créer une joust</span></button>
                    <button onClick={() => setScreen("join")} className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] py-3.5 text-sm font-extrabold text-[#c4c0d4] transition-all duration-200 hover:bg-white/[0.06] active:scale-[0.97]">Rejoindre avec un code</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#6b6882]">Prochains jousts</p>
                      <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Salut {pseudo} 👋</h1>
                    </div>
                    <Badge tone="accent">{myMatches.length} {myMatches.length > 1 ? "jousts" : "joust"}</Badge>
                  </div>

                  {/* Barre de filtres (visibilité réglée dans le profil) */}
                  {filtersVisible && (
                    <div className="anim-fade-up space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setOnlyValidated((v) => !v)}
                          aria-pressed={onlyValidated}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-extrabold transition-all duration-200 ${onlyValidated
                            ? "border-violet-500/50 bg-violet-600/15 text-violet-200"
                            : "border-white/[0.06] bg-white/[0.03] text-[#6b6882]"
                          }`}
                        >
                          <span className={`relative h-4 w-8 rounded-full transition-colors ${onlyValidated ? "bg-violet-600" : "bg-white/[0.08]"}`}>
                            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${onlyValidated ? "left-[18px]" : "left-0.5"}`} />
                          </span>
                          Validés
                        </button>
                        <button
                          onClick={() => setFunnelOpen((v) => !v)}
                          aria-pressed={funnelOpen}
                          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-extrabold transition-all duration-200 ${funnelOpen || statusFilters.size > 0
                            ? "border-violet-500/50 bg-violet-600/15 text-violet-200"
                            : "border-white/[0.06] bg-white/[0.03] text-[#6b6882]"
                          }`}
                        >
                          <Filter size={12} />
                          État
                          {statusFilters.size > 0 && <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-black text-white">{statusFilters.size}</span>}
                        </button>
                        {(onlyValidated || statusFilters.size > 0) && (
                          <button onClick={() => { setOnlyValidated(false); setStatusFilters(new Set()); }} className="ml-auto text-[10px] font-bold text-[#6b6882] hover:text-violet-300 transition-colors">Réinitialiser</button>
                        )}
                      </div>
                      {funnelOpen && (
                        <div className="anim-fade-up rounded-[20px] border border-white/[0.08] bg-[#13151d] p-3 shadow-xl shadow-black/20">
                          <p className="mb-2 px-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Filtrer par état</p>
                          <div className="flex flex-wrap gap-1.5">
                            {([
                              { key: "valid", label: "Validée" },
                              { key: "waiting-player", label: "Attend un joueur" },
                              { key: "answer", label: "À toi de valider" },
                              { key: "waiting-opp", label: "En attente" },
                              { key: "playing", label: "En cours" },
                            ] as const).map((s) => {
                              const on = statusFilters.has(s.key);
                              return (
                                <button
                                  key={s.key}
                                  onClick={() => {
                                    const next = new Set(statusFilters);
                                    if (on) next.delete(s.key); else next.add(s.key);
                                    setStatusFilters(next);
                                  }}
                                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 transition-all active:scale-95 ${on ? "bg-violet-600/20 text-violet-200 ring-violet-500/40" : "bg-white/[0.03] text-[#6b6882] ring-white/[0.06]"}`}
                                >
                                  {s.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="anim-fade-up-d1 space-y-2.5">
                    {myMatches
                      .filter((m) => {
                        if (onlyValidated) {
                          const ok = (m.status === "scheduled" && m.inviteStatus === "accepted" && m.timeControlConfirmed) || m.status === "playing";
                          if (!ok) return false;
                        }
                        if (statusFilters.size > 0) {
                          const iCreator2 = m.creatorName === pseudo;
                          const pending2 = m.inviteStatus === "pending";
                          const hasKey =
                            (statusFilters.has("valid") && (m.status === "scheduled" && m.inviteStatus === "accepted" && m.timeControlConfirmed)) ||
                            (statusFilters.has("waiting-player") && !m.guestName) ||
                            (statusFilters.has("answer") && m.guestName && pending2 && !(iCreator2 ? m.timeControlBy === "creator" : m.timeControlBy === "guest")) ||
                            (statusFilters.has("waiting-opp") && m.guestName && pending2 && (iCreator2 ? m.timeControlBy === "creator" : m.timeControlBy === "guest")) ||
                            (statusFilters.has("playing") && m.status === "playing");
                          if (!hasKey) return false;
                        }
                        return true;
                      })
                      .map((m) => {
                      const mTc = tcInfo(m.timeControl);
                      const iCreator = m.creatorName === pseudo;
                      const opp = iCreator ? m.guestName : m.creatorName;
                      const pending = m.inviteStatus === "pending";
                      const iMustAnswer2 = Boolean(m.guestName && pending && !(iCreator ? m.timeControlBy === "creator" : m.timeControlBy === "guest"));
                      const waitingOpp = Boolean(m.guestName && pending && (iCreator ? m.timeControlBy === "creator" : m.timeControlBy === "guest"));
                      const waitingPlayer = !m.guestName;
                      const playing = m.status === "playing";
                      const armed = m.status === "scheduled" && m.inviteStatus === "accepted" && m.timeControlConfirmed;
                      const arrived = iCreator ? Boolean(m.arrivalCreator) : Boolean(m.arrivalGuest);
                      /* Timer restant — quand il est écoulé, on propose « Rentrer » */
                      const mTimeLeft = new Date(m.scheduledAt).getTime() - now;
                      const mUnlocked = mTimeLeft <= 0;
                      const msLeft = Math.max(0, mTimeLeft);
                      const ddLeft = Math.floor(msLeft / 86_400_000);
                      const hhLeft = String(Math.floor((msLeft % 86_400_000) / 3_600_000)).padStart(2, "0");
                      const mmLeft = String(Math.floor((msLeft % 3_600_000) / 60_000)).padStart(2, "0");
                      const ssLeft = String(Math.floor((msLeft % 60_000) / 1000)).padStart(2, "0");
                      const timerLabel = ddLeft > 0 ? `${ddLeft}j ${hhLeft}:${mmLeft}` : `${hhLeft}:${mmLeft}`;
                      /* La card validée se déplie dans la liste (fusion card + détail).
                        < 1h restante → affichage automatiquement en grand. */
                      const withinHour = msLeft > 0 && msLeft <= 3_600_000;
                      const expanded = expandedId === m.id;
                      const showDetail = (armed || playing) && (expanded || withinHour || mUnlocked);
                      /* Statut → pastille de couleur dans l'icône à gauche */
                      const statusDot = playing
                        ? "bg-emerald-400"
                        : armed
                          ? (arrived ? "bg-emerald-400" : "bg-violet-400")
                          : (waitingPlayer || iMustAnswer2)
                            ? "bg-amber-400"
                            : "bg-[#3a3851]";
                      const statusLabel = playing
                        ? "En cours"
                        : armed
                          ? (arrived ? "Arrivé ✓" : "Validée")
                          : waitingPlayer
                            ? "Attend un joueur"
                            : iMustAnswer2
                              ? "À toi de valider"
                              : waitingOpp
                                ? "En attente"
                                : "—";
                      return (
                        <div key={m.id} className={`w-full rounded-[20px] border bg-[#13151d] shadow-xl shadow-black/20 transition-all duration-200 ${infoTipId === m.id ? "overflow-visible" : "overflow-hidden"} ${showDetail ? "border-violet-500/40 ring-1 ring-violet-500/20" : "border-white/[0.06] hover:border-violet-500/30"}`}>
                          {/* En-tête compact cliquable */}
                          <button onClick={() => { if (armed) { setExpandedId(expanded ? null : m.id); } else { void openMatch(m); } }} className="block w-full p-4 text-left">
                            <div className="flex items-center gap-3.5">
                              {/* Icône gauche : avatar de l'adversaire (ou logo Joust si pas d'adversaire) + pastille de statut */}
                              <div className="relative shrink-0">
                                {opp ? (
                                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#2a243a] font-black text-xs text-[#c4c0d4] ring-1 ring-white/[0.08]">{opp.slice(0, 2).toUpperCase()}</div>
                                ) : (
                                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-600/20 font-black ring-1 ring-violet-500/25"><ChessPiece color="w" type="n" className="h-6 w-6 text-violet-200" /></div>
                                )}
                                <span title={statusLabel} aria-label={statusLabel} className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-[#13151d] ${statusDot}`} />
                              </div>
                              <div className="min-w-0 flex-1">
                                {/* 1. Date / heure */}
                                <p className="truncate text-sm font-black capitalize text-white">{new Date(m.scheduledAt).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                                {/* 2. Adversaire : nom aligné à gauche */}
                                <p className="mt-1 truncate text-left text-[13px] font-extrabold text-[#c4c0d4]">{opp || "En attente d'un joueur…"}</p>
                                {/* 3. Format & durée (bullet cliquable → info-bulle jeu/cadence) */}
                                <div className="relative mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => { e.stopPropagation(); setInfoTipId(infoTipId === m.id ? null : m.id); }}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setInfoTipId(infoTipId === m.id ? null : m.id); } }}
                                    className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 transition active:scale-95 ${infoTipId === m.id ? "bg-violet-500/20 text-violet-200 ring-violet-500/40" : "bg-white/[0.04] text-[#8b87a3] ring-white/[0.06] hover:text-violet-200"}`}
                                  >
                                    ♞ {mTc ? `${mTc.label} (${mTc.tag})` : "Échecs"}
                                  </span>
                                  {!mUnlocked && <span className="rounded-full bg-violet-500/[0.1] px-2 py-0.5 font-mono text-[10px] font-bold text-violet-200 ring-1 ring-violet-500/25">{timerLabel}</span>}
                                  {infoTipId === m.id && (
                                    /* Info-bulle : s'ouvre vers le HAUT quand la card est repliée
                                      (sinon rognée par overflow-hidden), vers le BAS quand elle est dépliée. */
                                    <div className={`absolute z-40 w-52 rounded-xl border border-white/[0.08] bg-[#1a1626] p-3 text-left shadow-2xl shadow-black/40 ${expanded ? "left-0 top-full mt-1.5" : "right-0 bottom-full mb-1.5"}`}>
                                      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Détails de la partie</p>
                                      <p className="mt-1.5 text-[11px] font-bold text-[#c4c0d4]">♞ Jeu : Échecs</p>
                                      {mTc && <p className="mt-0.5 text-[11px] font-bold text-[#c4c0d4]">⚡ Cadence : {mTc.label} ({mTc.tag})</p>}
                                      <p className="mt-0.5 text-[11px] font-bold text-[#c4c0d4]">📅 {describeRecurrence(m.timeOfDay, parseDays(m.recurrenceDays))}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {armed ? (expanded ? <ChevronUp size={16} className="shrink-0 text-[#3a3851]" /> : <ChevronDown size={16} className="shrink-0 text-[#3a3851]" />) : <ChevronRight size={16} className="shrink-0 text-[#3a3851]" />}
                            </div>
                          </button>
                          {/* Version dépliée en grand (fusion card/détail) pour les jousts validés ou en cours */}
                          {showDetail && (
                            <div className="anim-fade-up border-t border-white/[0.05]">
                              {/* Timer hypnotique quand pas encore l'heure */}
                              {!mUnlocked && (
                                <>
                                  <div className="relative px-6 py-4 text-center">
                                    <div className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/10 blur-3xl" />
                                    <div className="relative mx-auto flex items-baseline justify-center gap-1 font-mono text-3xl font-black tracking-tight text-white sm:text-4xl">
                                      {ddLeft > 0 && <span className="text-violet-300">{ddLeft}<span className="ml-0.5 text-base text-violet-400">j</span></span>}
                                      <span className="tabular-nums">{hhLeft}</span>
                                      <span className="anim-pulse text-violet-400">:</span>
                                      <span className="tabular-nums">{mmLeft}</span>
                                      <span className="anim-pulse text-violet-400">:</span>
                                      <span className="tabular-nums">{ssLeft}</span>
                                    </div>
                                  </div>
                                  {/* Récurrence des jours dans un bloc à part */}
                                  <div className="border-t border-white/[0.05] bg-white/[0.015] px-5 py-3">
                                    <div className="flex items-center justify-center gap-1">
                                      {WEEKDAYS.map((d) => { const on = parseDays(m.recurrenceDays).includes(d.value); const isNext = new Date(m.scheduledAt).getDay() === d.value; return <span key={d.value} className={`grid h-6 w-6 place-items-center rounded-md text-[9px] font-black transition ${on ? (isNext ? "bg-violet-500 text-white shadow-md shadow-violet-600/30" : "bg-violet-600/40 text-violet-200") : "bg-white/[0.03] text-[#3a3851]"}`}>{d.short}</span>; })}
                                    </div>
                                  </div>
                                </>
                              )}
                              {/* Bouton d'arrivée quand l'heure est arrivée */}
                              {mUnlocked && armed && !arrived && !playing && (
                                <div className="px-5 pt-2 text-center">
                                  <button onClick={() => void openMatch(m)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-700/25 transition-all duration-200 hover:brightness-110 active:scale-[0.97]">
                                    <Zap size={16} /> Je suis arrivé(e)
                                  </button>
                                </div>
                              )}
                              {mUnlocked && armed && arrived && !playing && (
                                <div className="px-5 pt-2 text-center">
                                  <div className="rounded-xl bg-emerald-500/[0.08] px-4 py-3 ring-1 ring-emerald-500/20"><p className="text-xs font-bold text-emerald-300">✅ Tu es arrivé(e) — attente de {opp || "l'adversaire"}…</p></div>
                                </div>
                              )}
                              {/* Annuler la joust (détrompeur 2 clics, comme le flux existant) */}
                              <div className="px-5 pb-3 pt-2">
                                <button
                                  type="button"
                                  onClick={() => void handleCardCancelClick(m)}
                                  className={`w-full rounded-2xl py-2 text-sm font-extrabold transition-all duration-300 active:scale-[0.97] ${cancelConfirmId === m.id
                                    ? "animate-pulse border border-rose-500/60 bg-rose-500/20 text-rose-200 shadow-lg shadow-rose-500/20"
                                    : "border border-transparent text-[#6b6882] hover:text-[#c4c0d4]"
                                  }`}
                                >
                                  {cancelConfirmId === m.id ? "⚠️ Confirmer l'annulation" : "Annuler la joust"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {myMatches.length > 0 && (
              <div className="mt-6 flex flex-col items-center gap-2.5">
                <button onClick={() => setPlusMenuOpen((v) => !v)} className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 py-3 pl-3 pr-5 text-sm font-extrabold text-white shadow-2xl shadow-violet-700/40 transition-all duration-200 hover:brightness-110 hover:shadow-violet-600/50 active:scale-95">
                  <span className={`grid h-8 w-8 place-items-center rounded-full bg-white/20 transition-transform duration-200 ${plusMenuOpen ? "rotate-45" : "group-hover:rotate-90"}`}><Plus size={18} /></span>
                  Nouvelle joust
                </button>
                {plusMenuOpen && (
                  <div className="anim-fade-up flex w-full max-w-xs flex-col gap-2 rounded-[20px] border border-white/[0.08] bg-[#13151d] p-2 shadow-2xl shadow-black/30">
                    <button onClick={() => { setPlusMenuOpen(false); setScreen("create"); }} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-violet-600/15 active:scale-[0.98]">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-600 shadow-lg shadow-violet-600/25"><Swords size={18} className="text-white" /></div>
                      <div><p className="text-sm font-extrabold text-white">Créer une joust</p><p className="text-[11px] text-[#6b6882]">Heure, jours et cadence</p></div>
                    </button>
                    <button onClick={() => { setPlusMenuOpen(false); setScreen("join"); }} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-violet-600/15 active:scale-[0.98]">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-600/25 ring-1 ring-violet-500/30"><UserPlus size={18} className="text-violet-200" /></div>
                      <div><p className="text-sm font-extrabold text-white">Rejoindre un ami</p><p className="text-[11px] text-[#6b6882]">Entre le code reçu</p></div>
                    </button>
                  </div>
                )}
              </div>
              )}
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

          {/* ══ 3c. PROFIL — filtres des jousts (opt-in via le pseudo) ══ */}
          {screen === "profile" && (
            <div className="anim-fade-up w-full space-y-6">
              <div className="relative text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-[24px] border border-white/[0.08] bg-violet-600/15 ring-1 ring-violet-500/25"><span className="text-lg font-black text-violet-200">{(pseudo || "?").slice(0, 2).toUpperCase()}</span></div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen((v) => !v)}
                  aria-label="Réglages"
                  title="Réglages"
                  className={`absolute right-0 top-0 grid h-10 w-10 place-items-center rounded-xl ring-1 transition active:scale-90 ${settingsOpen ? "bg-violet-600/20 text-violet-200 ring-violet-500/40" : "bg-white/[0.04] text-[#6b6882] ring-white/[0.06] hover:text-violet-300"}`}
                >
                  <Settings size={17} />
                </button>
                <h1 className="mt-4 text-2xl font-black tracking-tight text-white">{pseudo}</h1>
                <p className="mt-1 text-sm text-[#6b6882]">{authUser?.email}</p>
              </div>

              {/* Amis + historique */}
              <Card className="anim-fade-up-d1 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-600/15 ring-1 ring-violet-500/25"><Users size={16} className="text-violet-200" /></div>
                    <div>
                      <p className="text-sm font-extrabold text-white">Amis</p>
                      <p className="mt-0.5 text-[10px] text-[#6b6882]">{friends.length} ami{friends.length > 1 ? "s" : ""} · {friendRequests.length} demande{friendRequests.length > 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { void loadHistory().then(() => setScreen("history")); }}
                    className="flex items-center gap-1.5 rounded-xl bg-white/[0.03] px-3 py-2 text-[11px] font-extrabold text-violet-300 ring-1 ring-white/[0.06] transition active:scale-95 hover:bg-white/[0.06]"
                  >
                    <History size={13} /> Historique
                  </button>
                </div>

                {/* Onglets Amis / Demandes */}
                <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.05]">
                  <button
                    type="button"
                    onClick={() => setFriendTab("amis")}
                    aria-pressed={friendTab === "amis"}
                    className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-extrabold transition-all ${friendTab === "amis" ? "bg-violet-600 text-white shadow-md shadow-violet-600/25" : "text-[#6b6882] hover:text-white"}`}
                  >
                    <Users size={12} /> Amis ({friends.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFriendTab("demandes")}
                    aria-pressed={friendTab === "demandes"}
                    className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-extrabold transition-all ${friendTab === "demandes" ? "bg-amber-500 text-white shadow-md shadow-amber-500/25" : "text-[#6b6882] hover:text-white"}`}
                  >
                    <Bell size={12} /> Demandes ({friendRequests.length})
                  </button>
                </div>

                {/* Contenu : demandes d'ami */}
                {friendTab === "demandes" && (
                  <div className="mt-4 space-y-2">
                    {friendRequests.length === 0 ? (
                      <p className="rounded-xl bg-white/[0.02] px-3 py-2.5 text-center text-[10px] font-bold text-[#6b6882] ring-1 ring-white/[0.04]">Aucune demande d'ami en attente.</p>
                    ) : (
                      <>
                        <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-300">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                          {friendRequests.length} demande{friendRequests.length > 1 ? "s" : ""} d'ami
                        </p>
                        {friendRequests.map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <Avatar name={r.fromPseudo} />
                              <div className="min-w-0">
                                <p className="truncate text-xs font-extrabold text-white">{r.fromPseudo}</p>
                                <p className="text-[9px] font-semibold text-[#6b6882]">Le {new Date(r.createdAt).toLocaleDateString("fr-FR")}</p>
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <button
                                type="button"
                                onClick={() => void respondFriendRequest(r.id, "accept")}
                                disabled={friendReqLoading}
                                className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25 active:scale-90"
                              >
                                <Check size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void respondFriendRequest(r.id, "decline")}
                                disabled={friendReqLoading}
                                className="grid h-7 w-7 place-items-center rounded-lg bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/25 transition hover:bg-rose-500/20 active:scale-90"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* Contenu : amis */}
                {friendTab === "amis" && (
                  <>
                    {/* Envoyer une demande d'ami */}
                    <form
                      onSubmit={(e) => { e.preventDefault(); void addFriend(friendInput); }}
                      className="mt-4 flex gap-2"
                    >
                      <input
                        value={friendInput}
                        onChange={(e) => setFriendInput(e.target.value)}
                        maxLength={40}
                        placeholder="Pseudo d'un ami…"
                        className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-xs font-bold text-white outline-none placeholder:text-[#3a3851] focus:border-violet-500/60"
                      />
                      <Btn type="submit" disabled={friendLoading || !friendInput.trim()} variant="secondary" className="!w-auto !px-4 !py-2.5 !text-xs">
                        <span className="inline-flex items-center gap-1.5"><UserPlus size={13} /> Demander</span>
                      </Btn>
                    </form>

                    {/* Liste des amis */}
                    {friends.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {friends.map((f) => (
                          <div key={f.pseudo} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.02] px-3 py-2.5 ring-1 ring-white/[0.05]">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <Avatar name={f.pseudo} />
                              <div className="min-w-0">
                                <p className="truncate text-xs font-extrabold text-white">{f.pseudo}</p>
                                <p className="text-[9px] font-semibold text-[#6b6882]">Ami depuis le {new Date(f.addedAt).toLocaleDateString("fr-FR")}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void removeFriend(f.pseudo)}
                              aria-label={`Retirer ${f.pseudo} de tes amis`}
                              title={`Retirer ${f.pseudo}`}
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.03] text-[#6b6882] ring-1 ring-white/[0.06] transition hover:text-rose-300 active:scale-90"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 rounded-xl bg-white/[0.02] px-3 py-2.5 text-center text-[10px] font-bold text-[#6b6882] ring-1 ring-white/[0.04]">Ajoute tes partenaires de joust pour les retrouver ici.</p>
                    )}
                  </>
                )}
              </Card>

              {/* Réglages (engrenage) : filtres + notifications groupés */}
              {settingsOpen && (
                <div className="anim-fade-up space-y-4">
                  <Card className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06]"><Settings size={16} className="text-[#c4c0d4]" /></div>
                        <div>
                          <p className="text-sm font-extrabold text-white">Réglages</p>
                          <p className="mt-0.5 text-[10px] text-[#6b6882]">Filtres et notifications</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(false)}
                        aria-label="Fermer les réglages"
                        className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.04] text-[#6b6882] ring-1 ring-white/[0.06] transition active:scale-90 hover:text-violet-300"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </Card>

                  {/* Paramètres de filtre */}
                  <Card className="p-5">
                    <button
                      type="button"
                      onClick={() => setFiltersVisible((v) => !v)}
                      aria-pressed={filtersVisible}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white/[0.02] px-4 py-3.5 ring-1 ring-white/[0.06] active:scale-[0.98]"
                    >
                      <span className="text-left">
                        <span className="flex items-center gap-2 text-[13px] font-extrabold text-white"><Filter size={14} className="text-violet-300" /> Barre de filtres</span>
                        <span className="mt-0.5 block text-[10px] text-[#6b6882]">{filtersVisible ? "Visible dans la liste des jousts" : "Masquée dans la liste des jousts"}</span>
                      </span>
                      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${filtersVisible ? "bg-violet-600" : "bg-white/[0.08]"}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${filtersVisible ? "left-[22px]" : "left-0.5"}`} />
                      </span>
                    </button>
                  </Card>

                  {/* Notifications */}
                  <Card className="p-5">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-extrabold text-white">Notifications</p>
                          <p className="mt-0.5 text-[10px] text-[#6b6882]">Rappels, relances et alertes de joust</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={serverPushSubscribed ? "ok" : "muted"}>{serverPushSubscribed ? "Activées" : "—"}</Badge>
                          {match && <button type="button" onClick={() => void testPush()} aria-label="Tester le push" title="Envoyer une notification push de test" className="grid h-8 w-8 place-items-center rounded-xl bg-white/[0.04] text-[#6b6882] ring-1 ring-white/[0.06] transition active:scale-90 hover:text-violet-300"><BellRing size={15} /></button>}
                        </div>
                      </div>

                      {/* Bouton Activer (ouvre le tuto) si pas encore abonné */}
                      {match && !pushSubscribed && (
                        <Btn variant="secondary" className="!py-2.5 text-xs" onClick={() => { refreshNotif(); setTutorialOpen(true); }}>
                          <span className="inline-flex items-center gap-2"><Bell size={14} /> Activer les notifications</span>
                        </Btn>
                      )}

                      {/* Toggle rappel 5 min une fois abonné */}
                      {pushSubscribed && (
                        <button
                          type="button"
                          onClick={() => {
                            const v = !notify5min;
                            setNotify5min(v);
                            notify5minRef.current = v;
                            /* Mettre à jour la préférence côté serveur immédiatement,
                              sinon le serveur continue d'envoyer les rappels 5 min
                              même quand l'utilisateur les a désactivés. */
                            if ("serviceWorker" in navigator) {
                              navigator.serviceWorker.ready
                                .then((reg) => reg.pushManager.getSubscription())
                                .then((sub) => { if (sub) void syncServerSubscription(sub); })
                                .catch(() => undefined);
                            }
                            notify("⏰ Rappel 5 min " + (v ? "activé" : "désactivé") + " !");
                          }}
                          className="flex w-full items-center justify-between rounded-2xl bg-white/[0.02] px-4 py-3 ring-1 ring-white/[0.06] active:scale-[0.98]"
                        >
                          <span className="flex items-center gap-2 text-[11px] font-bold text-[#c4c0d4]">⏰ Rappel 5 min avant le début</span>
                          <span className={`relative h-6 w-11 rounded-full transition-colors ${notify5min ? "bg-violet-600" : "bg-white/[0.08]"}`}>
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${notify5min ? "left-[22px]" : "left-0.5"}`} />
                          </span>
                        </button>
                      )}
                    </div>
                  </Card>
                </div>
              )}

              <Btn variant="danger" onClick={handleLogoutClick}>Se déconnecter</Btn>
            </div>
          )}

          {/* ══ 3d. HISTORIQUE — parties terminées groupées en cards ══ */}
          {screen === "history" && (
            <div className="anim-fade-up w-full space-y-6">
              <div className="text-center">
                <Badge tone="accent"><History size={11} /> Historique</Badge>
                <h1 className="mt-4 text-2xl font-black tracking-tight text-white">Tes parties</h1>
                <p className="mt-2 text-sm text-[#6b6882]">Victoires, défaites et nulles, groupées par adversaire.</p>
              </div>

              {historyLoading && !historyData ? (
                <div className="flex justify-center py-12"><p className="text-sm font-bold text-[#6b6882]">Chargement…</p></div>
              ) : !historyData || historyData.totalMatches === 0 ? (
                <Card className="anim-fade-up-d1 p-8 text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] border border-white/[0.06] bg-[#13151d]"><History size={22} className="text-[#6b6882]" /></div>
                  <p className="mt-4 text-sm font-black text-white">Aucune partie terminée</p>
                  <p className="mt-2 text-xs leading-5 text-[#6b6882]">Joue une joust avec un ami pour remplir ton historique.</p>
                </Card>
              ) : (
                <>
                  {/* Bandeau récapitulatif win/loose/draw */}
                  <Card className="anim-fade-up-d1 p-5">
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div><p className="text-2xl font-black text-emerald-300">{historyData.totalWins}</p><p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#6b6882]">Victoires</p></div>
                      <div><p className="text-2xl font-black text-rose-300">{historyData.totalLosses}</p><p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#6b6882]">Défaites</p></div>
                      <div><p className="text-2xl font-black text-amber-300">{historyData.totalDraws}</p><p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#6b6882]">Nulles</p></div>
                      <div><p className="text-2xl font-black text-white">{historyData.totalMatches}</p><p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#6b6882]">Parties</p></div>
                    </div>
                  </Card>

                  {/* Cards par session (opposant + récurrence) */}
                  <div className="space-y-3">
                    {historyData.sessions.map((s) => {
                      const expanded = expandedHistoryId === s.id;
                      const hTc = tcInfo(s.timeControl);
                      return (
                        <Card key={s.id} className={`overflow-hidden transition-all duration-200 ${expanded ? "border-violet-500/40 ring-1 ring-violet-500/20" : ""}`}>
                          {/* En-tête cliquable */}
                          <button
                            type="button"
                            onClick={() => setExpandedHistoryId(expanded ? null : s.id)}
                            className="block w-full p-4 text-left"
                          >
                            <div className="flex items-center gap-3.5">
                              <Avatar name={s.opponent} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-black text-white">vs {s.opponent}</p>
                                <p className="mt-0.5 text-[10px] font-bold text-[#6b6882]">{describeRecurrence(s.timeOfDay, parseDays(s.recurrenceDays))} · {hTc ? `${hTc.label}` : s.timeControl}</p>
                              </div>
                              {/* Mini scores */}
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className="rounded-lg bg-emerald-500/10 px-2 py-1 font-mono text-[10px] font-black text-emerald-300 ring-1 ring-emerald-500/20">{s.wins}W</span>
                                <span className="rounded-lg bg-rose-500/10 px-2 py-1 font-mono text-[10px] font-black text-rose-300 ring-1 ring-rose-500/20">{s.losses}L</span>
                                <span className="rounded-lg bg-amber-500/10 px-2 py-1 font-mono text-[10px] font-black text-amber-300 ring-1 ring-amber-500/20">{s.draws}N</span>
                                {expanded ? <ChevronUp size={15} className="text-[#3a3851]" /> : <ChevronDown size={15} className="text-[#3a3851]" />}
                              </div>
                            </div>
                          </button>

                          {/* Sous-cards : chaque partie de la session */}
                          {expanded && (
                            <div className="anim-fade-up space-y-2 border-t border-white/[0.05] p-3">
                              <p className="px-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">{s.matchCount} partie{s.matchCount > 1 ? "s" : ""}</p>
                              {s.matches.map(({ match: m, moves: mv }) => {
                                const iWonM = m.winnerName === pseudo;
                                const iLostM = Boolean(m.winnerName && m.winnerName !== pseudo);
                                const tone = iWonM
                                  ? "border-emerald-500/25 bg-emerald-500/[0.05]"
                                  : iLostM
                                    ? "border-rose-500/25 bg-rose-500/[0.05]"
                                    : "border-amber-500/25 bg-amber-500/[0.04]";
                                const dot = iWonM ? "bg-emerald-400" : iLostM ? "bg-rose-400" : "bg-amber-400";
                                const label = iWonM ? "Victoire" : iLostM ? "Défaite" : "Nulle";
                                return (
                                  <div key={m.id} className={`rounded-2xl border px-3.5 py-3 ${tone}`}>
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex min-w-0 items-center gap-2.5">
                                        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                                        <div className="min-w-0">
                                          <p className="truncate text-xs font-extrabold text-white">
                                            {m.winnerName
                                              ? `${m.winnerName} gagne`
                                              : "Partie nulle"}
                                          </p>
                                          <p className="mt-0.5 text-[9px] font-bold text-[#6b6882]">
                                            {m.endedAt ? new Date(m.endedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                                            {" · "}{tcInfo(m.timeControl).tag}
                                          </p>
                                        </div>
                                      </div>
                                      <span className={`shrink-0 text-[10px] font-black ${iWonM ? "text-emerald-300" : iLostM ? "text-rose-300" : "text-amber-300"}`}>{label}</span>
                                    </div>
                                    {mv.length > 0 && (
                                      <div className="mt-2.5 flex flex-wrap gap-1 border-t border-white/[0.05] pt-2">
                                        {mv.slice(0, 14).map((x) => <span key={x.id} className="rounded-md bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#8b87a3] ring-1 ring-white/[0.03]">{x.san}</span>)}
                                        {mv.length > 14 && <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#6b6882]">+{mv.length - 14}</span>}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ 4. MATCH ══ */}
          {screen === "match" && match && (
            <div className="w-full space-y-4">

              {/* — waiting for opponent — */}
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

                      {/* Invitation directe par pseudo */}
                      <div className="border-t border-white/[0.05] pt-3">
                        <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Inviter par pseudo</p>
                        <div className="flex gap-2">
                          <input
                            value={invitePseudoInput}
                            onChange={(e) => { setInvitePseudoInput(e.target.value); setInviteError(""); }}
                            maxLength={40}
                            placeholder="Pseudo de ton ami…"
                            className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-xs font-bold text-white outline-none placeholder:text-[#3a3851] focus:border-violet-500/60"
                          />
                          <button
                            type="button"
                            onClick={() => { void inviteByPseudo(invitePseudoInput); setInvitePseudoInput(""); }}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-600/20 px-3 py-2.5 text-[11px] font-extrabold text-violet-200 ring-1 ring-violet-500/30 transition hover:bg-violet-600/30 active:scale-95"
                          >
                            <Send size={12} /> Envoyer
                          </button>
                        </div>
                        {inviteError && <p className="mt-2 rounded-lg bg-rose-500/[0.08] px-2 py-1.5 text-[10px] font-bold text-rose-300 ring-1 ring-rose-500/20">{inviteError}</p>}
                        {/* Amis disponibles en un clic */}
                        {friends.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {friends.map((f) => (
                              <button
                                key={f.pseudo}
                                type="button"
                                onClick={() => { void inviteByPseudo(f.pseudo); }}
                                className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-[#c4c0d4] ring-1 ring-white/[0.06] transition hover:bg-violet-600/20 hover:text-violet-200 active:scale-95"
                              >
                                <Users size={9} /> {f.pseudo}
                              </button>
                            ))}
                          </div>
                        )}
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
              {declined && match.status !== "cancelled" && (
                <div className="anim-fade-up space-y-6 text-center"><Badge tone="danger">Joust refusée</Badge><Card className="anim-fade-up-d1 p-8"><p className="text-lg font-black text-white">La joust a été déclinée</p><p className="mt-2 text-sm text-[#6b6882]">Crée une nouvelle joust avec d'autres paramètres.</p><div className="mt-6"><Btn onClick={leaveMatch}>Retour à l'accueil</Btn></div></Card></div>
              )}

              {/* — arrival check (nouveau flow : pas de timer auto) —
                La validation d'arrivée n'est possible qu'à l'heure prévue de la
                joust (jamais avant). Aucun chronomètre ne se déclenche
                automatiquement : seul l'ultimatum (envoi manuel par un joueur
                arrivé) déclenche un décompte. Le départ est toujours manuel.
                Le timer est compact (une ligne), hypnotique, sans texte superflu.
                La date apparaît sous le titre avec un point, la récurrence des
                jours dans un bloc séparé sous le timer, et l'annulation se fait
                en 2 clics (le 1er passe le bouton en rouge). */}
              {arrivalCheckActive && (
                /* Cartouche réutilisable : date → joueurs → jeu → timer+récurrence → annuler */
                <Card className="anim-fade-up-d1 overflow-hidden p-0">
                  {/* 1. Prochaine date */}
                  <div className="border-b border-white/[0.05] bg-gradient-to-b from-violet-600/[0.08] to-transparent px-5 py-3 text-center">
                    <p className="inline-flex items-center justify-center gap-2 text-sm font-bold text-[#c4c0d4]">
                      {arrivalUnlocked ? "C'est l'heure !" : new Date(match.scheduledAt).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                      <Dot on />
                    </p>
                  </div>

                  {/* 2. Qui contre qui */}
                  <div className="px-5 pt-5 text-center">
                    <h2 className="text-2xl font-black tracking-tight text-white">{match.creatorName} <span className="text-violet-400">vs</span> {match.guestName}</h2>
                    {/* 3. Le jeu */}
                    <p className="mt-1.5 text-xs font-bold text-[#6b6882]">♞ Échecs · {tc.label} ({tc.tag})</p>
                  </div>

                  {/* 4. Timer + récurrence OU validation d'arrivée */}
                  {!arrivalUnlocked ? (
                    <>
                      <div className="relative mt-5 bg-gradient-to-b from-violet-600/[0.08] via-transparent to-transparent px-6 py-6 text-center">
                        {/* Halo hypnotique */}
                        <div className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/10 blur-3xl" />
                        {/* Timer compact sur une ligne */}
                        <div className="relative mx-auto flex items-baseline justify-center gap-1 font-mono text-3xl font-black tracking-tight text-white sm:text-4xl">
                          {dd > 0 && <span className="text-violet-300">{dd}<span className="ml-0.5 text-base text-violet-400">j</span></span>}
                          <span className="tabular-nums">{hh}</span>
                          <span className="anim-pulse text-violet-400">:</span>
                          <span className="tabular-nums">{mmv}</span>
                          <span className="anim-pulse text-violet-400">:</span>
                          <span className="tabular-nums">{ssv}</span>
                        </div>
                      </div>
                      {/* Récurrence des jours dans un bloc à part */}
                      <div className="border-t border-white/[0.05] bg-white/[0.015] px-5 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {WEEKDAYS.map((d) => { const on = matchDays.includes(d.value); const isNext = new Date(match.scheduledAt).getDay() === d.value; return <span key={d.value} className={`grid h-6 w-6 place-items-center rounded-md text-[9px] font-black transition ${on ? (isNext ? "bg-violet-500 text-white shadow-md shadow-violet-600/30" : "bg-violet-600/40 text-violet-200") : "bg-white/[0.03] text-[#3a3851]"}`}>{d.short}</span>; })}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="bg-[#1a1626]">
                      <div className="grid grid-cols-2 divide-x divide-white/[0.05]">
                        <div className="flex flex-col items-center gap-3 px-3 py-6">
                          <Avatar name={match.creatorName} tone="a" />
                          <p className="text-[11px] font-extrabold text-white">{match.creatorName === pseudo ? "Toi" : match.creatorName}</p>
                          <Badge tone={Boolean(match.arrivalCreator) ? "ok" : "warn"}>{match.arrivalCreator ? "Arrivé ✓" : "…"}</Badge>
                        </div>
                        <div className="flex flex-col items-center gap-3 bg-white/[0.02] px-3 py-6">
                          <Avatar name={match.guestName} tone="b" />
                          <p className="text-[11px] font-extrabold text-white">{match.guestName === pseudo ? "Toi" : match.guestName}</p>
                          <Badge tone={Boolean(match.arrivalGuest) ? "ok" : "warn"}>{match.arrivalGuest ? "Arrivé ✓" : "…"}</Badge>
                        </div>
                      </div>
                      <div className="border-t border-white/[0.05] px-5 pb-6 pt-4 text-center">
                        {!iAmArrived ? (
                          <>
                            <p className="text-[11px] leading-5 text-[#6b6882]">Quand tu arrives, valide ton arrivée pour lancer la joust.</p>
                            {ultimatumAgainstMe && (
                              <div className="mt-4 rounded-2xl bg-rose-500/[0.1] px-4 py-4 ring-1 ring-rose-500/30">
                                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-rose-300">⏳ Ultimatum de {opponentName}</p>
                                <p className="mt-2 font-mono text-4xl font-black text-rose-300">0:{String(ultimatumDeadlineLeft).padStart(2, "0")}</p>
                                <p className="mt-2 text-[11px] text-rose-200/80">Valide ton arrivée avant la fin du décompte, sinon tu perds par forfait.</p>
                              </div>
                            )}
                            <div className="mt-4"><Btn variant="giant" disabled={saving} onClick={() => void patch({ action: "arrive", playerName: pseudo }, "Arrivée validée !")}><span className="inline-flex items-center gap-2"><Zap size={20} /> Je suis arrivé(e)</span></Btn></div>
                          </>
                        ) : (
                          <>
                            <div className="rounded-2xl bg-emerald-500/[0.08] px-4 py-3 ring-1 ring-emerald-500/20"><p className="text-xs font-bold text-emerald-300">✅ Tu es arrivé(e) — tu attends {opponentName}…</p></div>
                            {!oppArrived && (
                              <>
                                {ultimatumActive ? (
                                  <div className="mt-4 rounded-2xl bg-rose-500/[0.08] px-4 py-4 ring-1 ring-rose-500/30">
                                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-rose-300">Ultimatum en cours</p>
                                    <p className="mt-2 font-mono text-4xl font-black text-rose-300">0:{String(ultimatumDeadlineLeft).padStart(2, "0")}</p>
                                    <p className="mt-2 text-[11px] text-rose-200/80">{ultimatumByMe ? `${opponentName} a 1 minute pour valider son arrivée, sinon il perd la partie.` : `${opponentName} t'a envoyé un ultimatum — valide ton arrivée immédiatement.`}</p>
                                  </div>
                                ) : (
                                  <div className="mt-4 space-y-2">
                                    <Btn variant="secondary" disabled={saving || nudgeCooldownLeft > 0} onClick={() => void patch({ action: "nudge", playerName: pseudo }, nudgeCooldownLeft > 0 ? `Relance possible dans ${nudgeCooldownLeft}s` : "Notification relancée !")}>
                                      {nudgeCooldownLeft > 0 ? `Relayer dans ${nudgeCooldownLeft}s…` : "🔔 Relancer une notification"}
                                    </Btn>
                                    <Btn variant="danger" disabled={saving} onClick={() => void patch({ action: "ultimatum", playerName: pseudo }, "Ultimatum envoyé !")}>
                                      ⏳ Envoyer un ultimatum (1 min)
                                    </Btn>
                                  </div>
                                )}
                              </>
                            )}
                          </>
                        )}
                        {bothArrived && (
                          <div className="mt-4 rounded-2xl bg-emerald-500/[0.1] px-4 py-4 ring-1 ring-emerald-500/30">
                            <p className="text-sm font-black text-emerald-300">🎉 Les deux joueurs sont arrivés — la partie se lance…</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleCancelClick}
                    className={`w-full rounded-2xl py-2 text-sm font-extrabold transition-all duration-300 active:scale-[0.97] ${confirmCancel
                      ? "animate-pulse border border-rose-500/60 bg-rose-500/20 text-rose-200 shadow-lg shadow-rose-500/20"
                      : "border border-transparent text-[#6b6882] hover:text-[#c4c0d4]"
                    }`}
                  >
                    {confirmCancel ? "⚠️ Confirmer l'annulation" : "Annuler la joust"}
                  </button>
                </Card>
              )}

              {/* — joust cancelled (par un joueur) — */}
              {match?.status === "cancelled" && (
                <div className="anim-fade-up space-y-6 text-center">
                  <Badge tone="danger">Joust annulée</Badge>
                  <Card className="anim-fade-up-d1 p-8">
                    <p className="text-lg font-black text-white">Cette joust a été annulée</p>
                    <div className="mt-6"><Btn onClick={leaveMatch}>Retour à l'accueil</Btn></div>
                  </Card>
                </div>
              )}

              {/* — chess — */}
              {chessStarted && (
                <div className="anim-fade-up space-y-3">
                  {/* ══ CARD ENGLOBANTE : l'adversaire en haut, le plateau au centre, toi en bas ══ */}
                  <Card className="anim-fade-up-d1 overflow-hidden p-0">
                    {/* Header : adversaire (avatar + nom + chrono) + bouton replier */}
                    <div className={`flex items-center justify-between gap-3 px-4 py-2.5 transition-colors ${!isOver && chess.turn() !== myColor ? "border-violet-500/30 bg-violet-600/[0.06]" : "border-b border-white/[0.05]"}`}>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg shadow-md ring-1 ring-white/[0.06] ${isWhite ? "bg-gradient-to-br from-[#1a1328] to-[#0e0918]" : "bg-gradient-to-br from-[#3a2d55] to-[#2a1f3d]"}`}><ChessPiece color={isWhite ? "b" : "w"} type="n" className={`h-6 w-6 ${isWhite ? "text-[#6b5199]" : "text-[#e4d6ff]"}`} /></div>
                        <div className="min-w-0">
                          <p className={`truncate text-xs font-extrabold ${isOver ? "text-[#c4c0d4]" : "text-white"}`}>{opponentName}</p>
                          <p className="text-[9px] font-bold text-[#6b6882]">{isWhite ? "Noirs" : "Blancs"}</p>
                        </div>
                        <Dot on={!isOver && chess.turn() !== myColor} />
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className={`min-w-[3.2rem] rounded-lg px-2 py-1 text-center font-mono text-sm font-black ring-1 ${clockOf(isWhite ? "b" : "w").low ? "animate-pulse bg-rose-500/15 text-rose-300 ring-rose-500/30" : !isOver && chess.turn() !== myColor ? "bg-violet-600/15 text-violet-200 ring-violet-500/30" : "bg-white/[0.04] text-[#c4c0d4] ring-white/[0.05]"}`}>{clockOf(isWhite ? "b" : "w").text}</span>
                        {isOver && !rematchOpen && !gameCardMinimized && (
                          <button
                            type="button"
                            onClick={() => setGameCardMinimized(true)}
                            aria-label="Replier le jeu"
                            title="Replier le jeu"
                            className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.04] text-[#6b6882] ring-1 ring-white/[0.06] transition hover:text-violet-300 active:scale-90"
                          >
                            <Minimize size={13} />
                          </button>
                        )}
                        {isOver && gameCardMinimized && (
                          <button
                            type="button"
                            onClick={() => setGameCardMinimized(false)}
                            aria-label="Déplier le jeu"
                            title="Déplier le jeu"
                            className="grid h-7 w-7 place-items-center rounded-lg bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/30 transition hover:bg-violet-500/25 active:scale-90"
                          >
                            <ChevronsUp size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Plateau (masqué quand la partie est repliée après la fin) */}
                    {(!isOver || !gameCardMinimized) && (
                      <div className="aspect-square w-full">
                        <div className="grid h-full w-full grid-cols-8 grid-rows-8">
                          {rows.map((row, ri) => row.map((piece, ci) => {
                            const sq = sqName(ri, ci);
                            const dark = (ri + ci) % 2 === 1;
                            const sel = sq === selectedSquare;
                            const isLegal = legalTargets.has(sq);
                            const hasPiece = piece != null;
                            const last = moves.at(-1)?.fromSquare === sq || moves.at(-1)?.toSquare === sq;
                            const p = piece as { color: string; type: string } | null;
                            const canPlay = myTurn && !timedOut && !saving;
                            return (
                              <button
                                type="button"
                                key={sq}
                                draggable={canPlay && Boolean(p?.color === myColor)}
                                onClick={() => tap(sq, p)}
                                onDragStart={() => { if (p) handleDragStart(sq, p as { color: string; type: string }); }}
                                onDragOver={(e) => handleDragOver(sq, e)}
                                onDrop={(e) => handleDrop(sq, e)}
                                className={`relative flex items-center justify-center transition-colors select-none ${dark ? "bg-[#7b61a5]" : "bg-[#d8ccf0]"} ${sel ? "z-10 shadow-[inset_0_0_0_3px_#fff,inset_0_0_0_6px_rgba(139,92,246,0.45)]" : ""} ${isLegal && !hasPiece ? "cursor-pointer" : ""} ${last && !sel ? "after:absolute after:inset-0 after:bg-violet-300/25" : ""} ${canPlay && p?.color === myColor ? "cursor-grab active:cursor-grabbing hover:brightness-110" : isLegal ? "cursor-pointer hover:brightness-110" : canPlay ? "cursor-pointer hover:brightness-105" : "cursor-default"}`}
                              >
                                {ci === 0 && <span className={`absolute left-[3px] top-[1px] text-[8px] font-bold ${dark ? "text-[#d8ccf0]/50" : "text-[#7b61a5]/50"}`}>{isWhite ? 8 - ri : ri + 1}</span>}
                                {ri === 7 && <span className={`absolute bottom-[1px] right-[3px] text-[8px] font-bold ${dark ? "text-[#d8ccf0]/50" : "text-[#7b61a5]/50"}`}>{isWhite ? FILES[ci] : FILES[7 - ci]}</span>}
                                {p && (
                                  <span className={`relative z-[5] flex h-full w-full items-center justify-center transition-all duration-100 ${sel ? "scale-[1.18] drop-shadow-[0_4px_6px_rgba(0,0,0,0.45)]" : "hover:scale-105"} ${p.color === "w" ? "text-[#f5eeff]" : "text-[#2a1f3d]"}`}>
                                    <ChessPiece color={p.color as "w" | "b"} type={p.type as "p" | "n" | "b" | "r" | "q" | "k"} className="h-[85%] w-[85%] drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]" />
                                  </span>
                                )}
                                {isLegal && !hasPiece && (
                                  <span className={`absolute z-[6] h-4 w-4 rounded-full ${dark ? "bg-[#6b4d9e]/70" : "bg-[#8b6bb8]/70"} shadow-[0_0_0_3px_rgba(255,255,255,0.35)]`} />
                                )}
                                {isLegal && hasPiece && sel === null && (
                                  <span className={`absolute inset-0 z-[6] rounded-full shadow-[inset_0_0_0_4px_rgba(255,255,255,0.55)] ${dark ? "bg-[#6b4d9e]/30" : "bg-[#8b6bb8]/30"}`} />
                                )}
                              </button>
                            );
                          }))}
                        </div>
                      </div>
                    )}

                    {/* Footer : toi (avatar + nom + chrono) */}
                    <div className={`flex items-center justify-between gap-3 border-t border-white/[0.05] px-4 py-2.5 transition-colors ${!isOver && chess.turn() === myColor ? "bg-violet-600/[0.06]" : ""}`}>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg shadow-md ring-1 ring-white/[0.06] ${isWhite ? "bg-gradient-to-br from-[#3a2d55] to-[#2a1f3d]" : "bg-gradient-to-br from-[#1a1328] to-[#0e0918]"}`}><ChessPiece color={myColor} type="n" className={`h-6 w-6 ${isWhite ? "text-[#e4d6ff]" : "text-[#6b5199]"}`} /></div>
                        <div className="min-w-0">
                          <p className={`truncate text-xs font-extrabold ${isOver ? "text-[#c4c0d4]" : "text-white"}`}>{pseudo} <span className="text-[#6b6882]">(toi)</span></p>
                          <p className="text-[9px] font-bold text-[#6b6882]">{isWhite ? "Blancs" : "Noirs"}</p>
                        </div>
                        <Dot on={!isOver && chess.turn() === myColor} />
                      </div>
                      <span className={`min-w-[3.2rem] rounded-lg px-2 py-1 text-center font-mono text-sm font-black ring-1 ${clockOf(myColor).low ? "animate-pulse bg-rose-500/15 text-rose-300 ring-rose-500/30" : !isOver && chess.turn() === myColor ? "bg-violet-600/15 text-violet-200 ring-violet-500/30" : "bg-white/[0.04] text-[#c4c0d4] ring-white/[0.05]"}`}>{clockOf(myColor).text}</span>
                    </div>
                  </Card>
                  {selectedSquare && myTurn && (
                    <div className="flex items-center justify-center gap-3 mt-2">
                      <span className="text-xs font-mono text-violet-300">{selectedSquare}</span>
                      <span className="text-xs font-bold text-violet-300">Sélectionnée</span>
                      <Btn variant="ghost" onClick={() => setSelectedSquare(null)} className="!py-2 text-xs">Annuler</Btn>
                    </div>
                  )}
                  {!isOver && (
                    <Card className={`p-4 text-center text-sm font-bold ${timedOut ? "border-rose-500/30 bg-rose-500/[0.08] text-rose-300" : myTurn ? "border-violet-500/30 bg-violet-500/[0.06] text-violet-300" : "text-[#6b6882]"}`}>{timedOut ? `Temps écoulé pour ${timedOut === pseudo ? "toi" : timedOut}` : myTurn ? "À toi de jouer" : `Au tour de ${opponentName}`}</Card>
                  )}
                  {moves.length > 0 && (
                    isOver ? (
                      <Card className="p-4">
                        <button
                          type="button"
                          onClick={() => setShowMoves((v) => !v)}
                          className="flex w-full items-center justify-between gap-2 rounded-2xl bg-white/[0.02] px-4 py-2.5 text-left ring-1 ring-white/[0.06] transition active:scale-[0.98] hover:bg-white/[0.05]"
                        >
                          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Coups de la partie</span>
                          <span className="rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] font-bold text-[#8b87a3] ring-1 ring-white/[0.05]">{moves.length}</span>
                          {showMoves ? <ChevronUp size={14} className="text-[#6b6882]" /> : <ChevronDown size={14} className="text-[#6b6882]" />}
                        </button>
                        {showMoves && (
                          <div className="anim-fade-up mt-3 flex flex-wrap gap-1.5">
                            {moves.map((m) => <span key={m.id} className="rounded-lg bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] font-bold text-[#c4c0d4] ring-1 ring-white/[0.04]">{m.san}</span>)}
                          </div>
                        )}
                      </Card>
                    ) : (
                      <Card className="p-4"><p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Coups</p><div className="flex flex-wrap gap-1.5">{moves.slice(-12).map((m) => <span key={m.id} className="rounded-lg bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] font-bold text-[#c4c0d4] ring-1 ring-white/[0.04]">{m.san}</span>)}</div></Card>
                    )
                  )}
                  {lichessGameUrl && (
                    <a href={lichessGameUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] py-2.5 text-xs font-extrabold text-[#c4c0d4] transition-all duration-200 hover:bg-white/[0.06] active:scale-[0.97]">
                      ♞ Voir sur Lichess
                    </a>
                  )}
                  {!isOver && !timedOut && (
                    <div className="grid grid-cols-2 gap-2">
                      <Btn variant="danger" onClick={() => void patch({ action: "resign", playerName: pseudo })} disabled={saving}>Abandonner</Btn>
                      {match.drawStatus === "proposed"
                        ? <Btn variant="secondary" disabled>{match.drawProposedBy === (iAmCreator ? "creator" : "guest") ? "En attente…" : "Proposition de nulle…"}</Btn>
                        : <Btn variant="secondary" onClick={() => void patch({ action: "draw", playerName: pseudo }, "Proposition de nulle envoyée")} disabled={saving}>Proposer la nulle</Btn>}
                    </div>
                  )}
                  {isOver && !rematchOpen && (
                    <div className="space-y-3">
                      {/* Bandeau résultat : icône + titre compact, clic → modifier le rendez-vous */}
                      <button
                        type="button"
                        onClick={openRematchEditor}
                        className={`flex w-full items-center justify-center gap-2.5 rounded-2xl border px-4 py-3.5 text-center transition active:scale-[0.98] ${resultTone}`}
                        title={matchDays.length > 0 ? "Double-clic pour modifier la prochaine date" : "Prévoir une revanche"}
                      >
                        {iWon ? <Trophy size={17} className="shrink-0" /> : iLost ? <Frown size={17} className="shrink-0" /> : <Handshake size={17} className="shrink-0" />}
                        <p className="text-sm font-black">{resultTitle}</p>
                        <p className="truncate text-[11px] font-bold opacity-80">{resultDetail}</p>
                      </button>

                      {/* Prochaine date planifiée : clic unique → modifier, double-clic → annuler */}
                      {matchDays.length > 0 ? (
                        <button
                          type="button"
                          onClick={openRematchEditor}
                          onDoubleClick={() => void handleCardCancelClick(match)}
                          title="Clic : modifier · Double-clic : annuler le rendez-vous"
                          className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#13151d] px-4 py-3 text-left shadow-lg shadow-black/20 transition-all duration-200 active:scale-[0.98] hover:border-violet-500/30"
                        >
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-600/15 text-violet-200 ring-1 ring-violet-500/25"><Calendar size={16} /></div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Prochain rendez-vous</p>
                            <p className="truncate text-sm font-black capitalize text-white">{nextJoustDate ? nextJoustDate.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "—"}</p>
                          </div>
                          <Pencil size={14} className="shrink-0 text-[#3a3851]" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={openRematchEditor}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.03] px-4 py-3.5 text-sm font-extrabold text-[#c4c0d4] ring-1 ring-white/[0.06] transition-all duration-200 hover:bg-white/[0.06] active:scale-[0.97]"
                        >
                          <Swords size={16} className="text-violet-300" /> Prévoir la revanche
                        </button>
                      )}

                      {/* Actions : modifier / annuler (double-clic) — tout en icônes pour aérer */}
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={openRematchEditor}
                          aria-label="Modifier le rendez-vous"
                          title="Modifier"
                          className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.04] text-[#6b6882] ring-1 ring-white/[0.06] transition hover:text-violet-300 active:scale-90"
                        >
                          <Pencil size={16} />
                        </button>
                        {matchDays.length === 0 && (
                          <button
                            type="button"
                            onClick={openRematchEditor}
                            aria-label="Prévoir une revanche"
                            title="Revanche"
                            className="grid h-11 w-11 place-items-center rounded-xl bg-violet-600/15 text-violet-200 ring-1 ring-violet-500/30 transition hover:bg-violet-600/25 active:scale-90"
                          >
                            <Swords size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleCardCancelClick(match)}
                          onDoubleClick={() => void handleCardCancelClick(match)}
                          aria-label={cancelConfirmId === match.id ? "Confirmer l'annulation" : "Annuler la joust"}
                          title={cancelConfirmId === match.id ? "Double-clic pour confirmer l'annulation" : "Annuler (double-clic)"}
                          className={`grid h-11 w-11 place-items-center rounded-xl ring-1 transition active:scale-90 ${cancelConfirmId === match.id ? "animate-pulse border border-rose-500/60 bg-rose-500/20 text-rose-200 shadow-lg shadow-rose-500/20" : "bg-white/[0.04] text-[#6b6882] ring-white/[0.06] hover:text-rose-300"}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {/* Ligne du bas : retour à l'accueil */}
                      <div className="text-center">
                        <button onClick={leaveMatch} className="text-xs font-bold text-[#6b6882] transition hover:text-[#c4c0d4]">Retour à l'accueil</button>
                      </div>
                    </div>
                  )}
                  {/* Éditeur de revanche / modification prérempli depuis la fin de partie */}
                  {isOver && rematchOpen && (
                    <Card className="p-5">
                      <p className="mb-4 text-center text-sm font-black text-white">{matchDays.length > 0 ? "Modifier le rendez-vous" : "Paramétrer la revanche"}</p>
                      <div className="space-y-4">
                        <Field label="Heure"><input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className={`${inputCls} text-center font-mono text-xl font-black`} /></Field>
                        <div><span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Jours</span><DayPicker days={days} toggle={toggleDay} setDays={setDays} /></div>
                        <div><span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6b6882]">Cadence</span><TcPicker value={timeControl} onChange={setTimeControl} compact /></div>
                        {matchDays.length === 0 && <p className="text-[11px] text-[#6b6882]">⚡ Les couleurs seront inversées par rapport à cette partie.</p>}
                        <div className="grid grid-cols-2 gap-2">
                          <Btn variant="secondary" onClick={() => setRematchOpen(false)}>Annuler</Btn>
                          <Btn onClick={() => sendRematchProposal(matchDays.length === 0)} disabled={saving}>Envoyer la proposition</Btn>
                        </div>
                      </div>
                    </Card>
                  )}
                  {!isOver && <Btn variant="ghost" onClick={leaveMatch}>Quitter</Btn>}
                </div>
              )}
            </div>
          )}
        </main>

        <footer className="relative z-10 border-t border-white/[0.04] bg-[#08090e]/80 pb-[calc(var(--safe-bottom)+1rem)] pt-4 text-center backdrop-blur-xl"><p className="text-[10px] font-bold text-[#3a3851]">Joust</p></footer>

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

        {/* Promotion modal */}
        {promotionPending && (
          <div className="fixed inset-0 z-[58] grid place-items-center bg-black/80 p-5 backdrop-blur-sm" onClick={() => setPromotionPending(null)}>
            <div className="anim-fade-up w-full max-w-xs rounded-[28px] border border-white/[0.08] bg-[#101018] p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <Badge tone="accent">Promotion</Badge>
              <p className="mt-3 text-sm font-black text-white">Choisis ta pièce</p>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {(["q", "r", "b", "n"] as const).map((p) => (
                  <button key={p} type="button" onClick={() => { void sendMove(promotionPending.from, promotionPending.to, p); setPromotionPending(null); }} className="grid h-16 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] transition active:scale-90 hover:bg-white/[0.08]">
                    <ChessPiece color={myColor} type={p} className="h-10 w-10" />
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-[#6b6882]">Dame (D), Tour (T), Fou (F), Cavalier (C)</p>
            </div>
          </div>
        )}

        {/* Popup proposition de nulle */}
        {drawModalOpen && match && (
          <div className="fixed inset-0 z-[56] grid place-items-center bg-black/80 p-5 backdrop-blur-sm">
            <div className="anim-fade-up w-full max-w-xs rounded-[28px] border border-white/[0.08] bg-[#101018] p-6 text-center shadow-2xl">
              <Badge tone="warn">Proposition de nulle</Badge>
              <p className="mt-3 text-sm font-black text-white">{opponentName} propose la nulle.</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Btn variant="secondary" onClick={() => void patch({ action: "draw-decline", playerName: pseudo }, "Nulle refusée")} disabled={saving}>Refuser</Btn>
                <Btn onClick={() => void patch({ action: "draw-accept", playerName: pseudo }, "Nulle acceptée !")} disabled={saving}>Accepter</Btn>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation de déconnexion */}
        {confirmLogout && (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-5 backdrop-blur-sm" onClick={cancelLogout}>
            <div className="anim-fade-up w-full max-w-xs rounded-[28px] border border-white/[0.08] bg-[#101018] p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <Badge tone="danger">Déconnexion</Badge>
              <p className="mt-3 text-sm font-black text-white">Quitter ton compte ?</p>
              <p className="mt-2 text-[11px] leading-4 text-[#6b6882]">Tes jousts et notifications seront interrompus sur cet appareil.</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Btn variant="secondary" onClick={cancelLogout}>Annuler</Btn>
                <Btn variant="danger" onClick={() => void logout()}>Se déconnecter</Btn>
              </div>
            </div>
          </div>
        )}

        {/* Notification tutorial */}
        {tutorialOpen && match && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
            <div className="anim-fade-up max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-white/[0.08] bg-[#101018] p-6 pb-[calc(var(--safe-bottom)+1.5rem)] shadow-2xl sm:rounded-[28px]">
              <div className="flex items-start justify-between gap-4"><div><Badge tone="accent">Notifications</Badge><h2 className="mt-3 text-xl font-black tracking-tight text-white">Soyez prévenus à l'heure H</h2><p className="mt-1.5 text-xs leading-5 text-[#6b6882]">Installe joust sur ton écran d'accueil, puis autorise les notifications.</p></div><button type="button" onClick={() => setTutorialOpen(false)} aria-label="Fermer" className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-[#6b6882] ring-1 ring-white/[0.06]"><X size={15} /></button></div>
              <div className="mt-5 flex items-center gap-4 rounded-2xl bg-white/[0.02] px-4 py-3 ring-1 ring-white/[0.05]">{[{ label: "Installée", done: standalone }, { label: "Notifications", done: pushSubscribed }].map((s) => <div key={s.label} className="flex items-center gap-2"><span className={`grid h-5 w-5 place-items-center rounded-full text-[9px] font-black ${s.done ? "bg-emerald-500 text-[#0a0f0a]" : "bg-white/[0.05] text-[#6b6882] ring-1 ring-white/[0.08]"}`}>{s.done ? <Check size={11} /> : "·"}</span><span className={`text-[10px] font-bold ${s.done ? "text-emerald-300" : "text-[#6b6882]"}`}>{s.label}</span></div>)}</div>
              <div className="mt-5 flex items-start gap-3"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl text-[11px] font-black ${standalone ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "bg-violet-600 text-white"}`}>1</span><div className="flex-1"><p className="text-sm font-extrabold text-white">Installe Joust</p><p className="mt-0.5 text-[11px] leading-4 text-[#6b6882]">{platform === "ios" ? <>Safari → <strong className="text-slate-300">Partager</strong> → <strong className="text-slate-300">Sur l'écran d'accueil</strong></> : platform === "android" ? <>Chrome → <strong className="text-slate-300">⋮</strong> → <strong className="text-slate-300">Installer l'application</strong></> : <>Chrome/Edge → icône <strong className="text-slate-300">+</strong> dans la barre d'adresse</>}</p>{!standalone && deferredPrompt.current && <div className="mt-2"><Btn variant="secondary" className="!py-2.5 text-xs" onClick={() => void deferredPrompt.current?.prompt()}>Installer maintenant</Btn></div>}</div></div>
              {platform === "ios" && !standalone && <div className="ml-10 mt-2 rounded-xl bg-amber-500/[0.06] px-3 py-2.5 ring-1 ring-amber-500/20"><p className="text-[11px] leading-4 text-amber-200/90">⚠️ Sur iPhone, les notifications ne marchent qu'une fois l'app installée et ouverte depuis l'écran d'accueil (iOS 16.4+).</p></div>}
              <div className="mt-5 flex items-start gap-3"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl text-[11px] font-black ${standalone ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "bg-violet-600 text-white"}`}>2</span><div className="flex-1"><p className="text-sm font-extrabold text-white">Active les notifications</p><p className="mt-0.5 text-[11px] text-[#6b6882]">Tu seras prévenu au top départ, même app fermée.</p><div className="mt-2.5"><Btn onClick={enableNotifs} disabled={pushSubscribed} variant={pushSubscribed ? "secondary" : "primary"} className="!py-2.5 text-xs">{pushSubscribed ? "Activées ✓" : "Activer"}</Btn></div></div></div>
              {pushSubscribed && (
                <button
                  type="button"
                  onClick={() => {
                    const v = !notify5min;
                    setNotify5min(v);
                    notify5minRef.current = v;
                    /* Mettre à jour la préférence côté serveur immédiatement,
                      sinon le serveur continue d'envoyer les rappels 5 min
                      même quand l'utilisateur les a désactivés. */
                    if ("serviceWorker" in navigator) {
                      navigator.serviceWorker.ready
                        .then((reg) => reg.pushManager.getSubscription())
                        .then((sub) => { if (sub) void syncServerSubscription(sub); })
                        .catch(() => undefined);
                    }
                    notify("⏰ Rappel 5 min " + (v ? "activé" : "désactivé") + " !");
                  }}
                  className="mt-4 flex w-full items-center justify-between rounded-2xl bg-white/[0.02] px-4 py-3 ring-1 ring-white/[0.06] active:scale-[0.98]"
                >
                  <span className="flex items-center gap-2 text-[11px] font-bold text-[#c4c0d4]">⏰ Rappel 5 min avant le début</span>
                  <span className={`relative h-6 w-11 rounded-full transition-colors ${notify5min ? "bg-violet-600" : "bg-white/[0.08]"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${notify5min ? "left-[22px]" : "left-0.5"}`} />
                  </span>
                </button>
              )}
              <div className="mt-5 border-t border-white/[0.05] pt-4"><Btn variant="ghost" onClick={() => setTutorialOpen(false)}>Plus tard</Btn></div>
            </div>
          </div>
        )}
      </div>
    );
  }

