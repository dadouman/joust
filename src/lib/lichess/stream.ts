import { LICHESS_BASE } from "./client";
import { LichessApiError, type BoardGameStreamEvent } from "./types";

export function parseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const lines: string[] = [];

  const flush = (): Record<string, unknown> | null => {
    let data = "";
    for (const line of lines) {
      if (line.startsWith("data:")) data += line.slice(5).trimStart();
    }
    lines.length = 0;
    if (!data) return null;
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  return (async function* () {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.startsWith(":")) continue;
        if (line.trim() === "") {
          const evt = flush();
          if (evt) yield evt;
        } else {
          lines.push(line);
        }
      }
    }
    const evt = flush();
    if (evt) yield evt;
  })();
}

export async function connectBoardGameStream(
  gameId: string,
  token: string,
  onEvent: (evt: BoardGameStreamEvent) => Promise<void> | void,
  signal?: AbortSignal,
): Promise<void> {
  const url = LICHESS_BASE + "/api/board/game/stream/" + encodeURIComponent(gameId);
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + token, Accept: "text/event-stream" },
    signal,
  });

  if (res.status === 401) throw new LichessApiError("Lichess : token invalide sur le stream (401).", 401);
  if (res.status === 403) throw new LichessApiError("Lichess : accès refusé au stream (403).", 403);
  if (res.status === 404) throw new LichessApiError("Lichess : partie inexistante pour le stream (404).", 404);
  if (!res.ok || !res.body) throw new LichessApiError("Lichess : erreur " + res.status + " sur le stream.", res.status);

  const generator = parseSseStream(res.body);
  for await (const raw of generator) {
    const evt = raw as unknown as BoardGameStreamEvent;
    await onEvent(evt);
  }
}

export async function consumeBoardGameStreamUntilEnd(
  gameId: string,
  token: string,
  onEvent: (evt: BoardGameStreamEvent) => Promise<void> | void,
  signal?: AbortSignal,
): Promise<void> {
  await connectBoardGameStream(gameId, token, onEvent, signal);
}