import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorName: varchar("creator_name", { length: 80 }).notNull(),
    /* Session tokens - one per player (review 2.2.2) */
    creatorToken: varchar("creator_token", { length: 64 }).notNull(),
    guestToken: varchar("guest_token", { length: 64 }),
    /* Empty until a friend joins with the invite code */
    guestName: varchar("guest_name", { length: 80 }).notNull().default(""),
    /* Short shareable code, e.g. "K7P2QX" */
    inviteCode: varchar("invite_code", { length: 8 }).notNull().unique(),

    /* ── Alarm / rendez-vous definition (game-agnostic) ── */
    /* Next absolute occurrence of the alarm */
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    timeZone: varchar("time_zone", { length: 80 }).notNull().default("Europe/Paris"),

    /* Recurring alarm definition */
    timeOfDay: varchar("time_of_day", { length: 5 }).notNull().default("20:00"),
    /* CSV of weekday numbers, 0=Sunday … 6=Saturday. Empty string = one-shot */
    recurrenceDays: varchar("recurrence_days", { length: 20 }).notNull().default(""),

    /* Partner validation: pending | accepted | declined */
    inviteStatus: varchar("invite_status", { length: 16 }).notNull().default("pending"),

    /* ── Game abstraction ──
       The alarm machinery (status, ready check, push) is game-agnostic.
       `gameType` discriminates which adapter runs behind the match (chess today).
       `gameState` holds the game-specific state as JSON so adding a new game
       type does NOT require new columns on `matches`. */
    gameType: varchar("game_type", { length: 32 }).notNull().default("chess"),
    gameState: jsonb("game_state").$type<Record<string, unknown>>(),

    /* Time control: bullet | blitz | rapid — must be validated by both players.
       Generic for the alarm; the game adapter interprets it. */
    timeControl: varchar("time_control", { length: 16 }).notNull().default("blitz"),
    /* Who made the latest time-control proposal: creator | guest */
    timeControlBy: varchar("time_control_by", { length: 16 }).notNull().default("creator"),
    /* true once both players validated the current time control */
    timeControlConfirmed: boolean("time_control_confirmed").notNull().default(false),

    /* ── Ready check (game-agnostic): each player clicks "Prêt" once the
       countdown expires. readyWhite / readyBlack : timestamp of the click, or null. */
    readyWhite: timestamp("ready_white", { withTimezone: true }),
    readyBlack: timestamp("ready_black", { withTimezone: true }),

    /* ── Arrival validation (nouveau flow) ──
       Chaque joueur valide son arrivée avant que le match puisse être lancé.
       `arrivalCreator` / `arrivalGuest` : timestamp de validation, ou null.
       `arrivalNoticeSentAt` : dernier envoi de notification de relance.
       `arrivalNoticeCount` : nombre de relances déjà envoyées (max 1 avant ultimatum).
       `ultimatumSentAt` / `ultimatumDeadline` : ultimatum envoyé par le créateur
       · si l'invité ne valide pas avant la deadline → forfait (défaite). */
    arrivalCreator: timestamp("arrival_creator", { withTimezone: true }),
    arrivalGuest: timestamp("arrival_guest", { withTimezone: true }),
    arrivalNoticeSentAt: timestamp("arrival_notice_sent_at", { withTimezone: true }),
    arrivalNoticeCount: integer("arrival_notice_count").notNull().default(0),
    ultimatumSentAt: timestamp("ultimatum_sent_at", { withTimezone: true }),
    ultimatumDeadline: timestamp("ultimatum_deadline", { withTimezone: true }),

    /* ── 5-minute pre-game reminder (push) ── */
    reminder5SentAt: timestamp("reminder_5_sent_at", { withTimezone: true }),

    /* scheduled | playing | completed */
    status: varchar("status", { length: 24 }).notNull().default("scheduled"),

    /* ── Legacy chess-specific columns ──
       Kept for backward compatibility with the current chess implementation.
       New game types should store their state in `gameState` instead. */
    whitePlayer: varchar("white_player", { length: 80 }).notNull(),
    blackPlayer: varchar("black_player", { length: 80 }).notNull(),
    clockWhiteSeconds: integer("clock_white_seconds").notNull().default(0),
    clockBlackSeconds: integer("clock_black_seconds").notNull().default(0),
    lastMoveAt: timestamp("last_move_at", { withTimezone: true }),
    lastFen: text("last_fen"),
    pgn: text("pgn"),

    /* ── Result persistence (review 3.2 §5) ── */
    result: varchar("result", { length: 24 }),
    winnerName: varchar("winner_name", { length: 80 }),
    endedAt: timestamp("ended_at", { withTimezone: true }),

    /* ── Draw proposal state ── */
    drawStatus: varchar("draw_status", { length: 16 }).notNull().default("none"),
    drawProposedBy: varchar("draw_proposed_by", { length: 16 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("matches_scheduled_at_idx").on(table.scheduledAt),
    index("matches_status_idx").on(table.status),
    index("matches_invite_status_idx").on(table.inviteStatus),
    index("matches_game_type_idx").on(table.gameType),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerName: varchar("player_name", { length: 80 }).notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /* User preference: receive the 5-minute pre-game reminder (toggleable in the tutorial). */
    notify5min: boolean("notify_5min").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("push_subs_match_idx").on(table.matchId)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pseudo: varchar("pseudo", { length: 80 }).notNull().unique(),
    email: varchar("email", { length: 120 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("users_pseudo_idx").on(table.pseudo),
    index("users_email_idx").on(table.email),
  ],
);

/* Auth sessions — HTTP-only cookie `session` holds a random 32-byte token.
   Only the SHA-256 hash of that token is stored here (review auth §3). */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /* SHA-256 hex of the raw session token (never stored in plaintext) */
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_token_hash_idx").on(table.tokenHash),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

/* Head-to-head stats between the two friends (review 3.3) */
export const playerStats = pgTable(
  "player_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pairKey: varchar("pair_key", { length: 170 }).notNull().unique(), // "anna|marc"
    playerA: varchar("player_a", { length: 80 }).notNull(),
    playerB: varchar("player_b", { length: 80 }).notNull(),
    winsA: integer("wins_a").notNull().default(0),
    winsB: integer("wins_b").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    matchCount: integer("match_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("player_stats_pair_key_idx").on(table.pairKey)],
);

export const matchMoves = pgTable(
  "match_moves",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    ply: integer("ply").notNull(),
    fromSquare: varchar("from_square", { length: 2 }).notNull(),
    toSquare: varchar("to_square", { length: 2 }).notNull(),
    promotion: varchar("promotion", { length: 1 }),
    san: varchar("san", { length: 32 }).notNull(),
    fen: text("fen").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("match_moves_match_ply_idx").on(table.matchId, table.ply)],
);