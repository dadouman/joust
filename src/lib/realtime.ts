/* Optional Supabase Realtime Broadcast — fast propagation without DB polling.
   Neon stays the source of truth; Supabase is used only as a WebSocket pub/sub.
   If SUPABASE_URL / SUPABASE_ANON_KEY are absent, the app falls back to SSE. */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.trim();
const anonKey = process.env.SUPABASE_ANON_KEY?.trim();

const client = url && anonKey ? createClient(url, anonKey, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 20 } },
}) : null;

export function channelName(matchId: string): string {
  return `game-${matchId}`;
}

/** Fire-and-forget broadcast of a match change to all subscribed clients. */
export function broadcastMatchChange(matchId: string, payload: Record<string, unknown> = {}) {
  if (!client) return;
  void (async () => {
    try {
      const channel = client.channel(channelName(matchId));
      await channel.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        void channel.send({
          type: "broadcast",
          event: "match-change",
          payload,
        });
        void client.removeChannel(channel);
      });
    } catch {
      /* optional — ignore */
    }
  })();
}