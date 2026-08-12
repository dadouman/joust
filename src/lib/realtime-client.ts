"use client";

/* Client-side Supabase Realtime listening (optional).
   If NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are absent, returns null
   and the app falls back to the existing SSE polling endpoint. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function getRealtimeClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  cached = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;
  return cached;
}

export function matchChannelName(matchId: string): string {
  return `game-${matchId}`;
}

export function listenToMatch(
  matchId: string,
  onUpdate: () => void,
): () => void {
  const client = getRealtimeClient();
  if (!client) return () => undefined;

  const channel = client.channel(matchChannelName(matchId));
  void channel
    .on("broadcast", { event: "match-change" }, () => onUpdate())
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}