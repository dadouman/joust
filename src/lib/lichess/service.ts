import { lichessRequest } from "./client";
export async function createChallenge(whiteToken: string, blackUsername: string, minutes: number, increment: number) {
  const params = new URLSearchParams();
  params.set("rated", "false");
  params.set("clock.limit", String(minutes * 60));
  params.set("clock.increment", String(increment));
  params.set("color", "white");
  params.set("variant", "standard");
  return lichessRequest("/api/challenge/" + encodeURIComponent(blackUsername), { method: "POST", token: whiteToken, body: params });
}

export async function acceptChallenge(blackToken: string, challengeId: string) {
  return lichessRequest("/api/challenge/" + encodeURIComponent(challengeId) + "/accept", { method: "POST", token: blackToken });
}

export async function playMove(token: string, gameId: string, uci: string) {
  return lichessRequest("/api/board/game/" + encodeURIComponent(gameId) + "/move/" + encodeURIComponent(uci), { method: "POST", token });
}

export async function resignGame(token: string, gameId: string) {
  return lichessRequest("/api/board/game/" + encodeURIComponent(gameId) + "/resign", { method: "POST", token });
}

export async function abortGame(token: string, gameId: string) {
  return lichessRequest("/api/board/game/" + encodeURIComponent(gameId) + "/abort", { method: "POST", token });
}

export async function handleDraw(token: string, gameId: string, action: string) {
  return lichessRequest("/api/board/game/" + encodeURIComponent(gameId) + "/draw/" + action, { method: "POST", token });
}

export async function exportGame(gameId: string) {
  return lichessRequest("/api/game/" + encodeURIComponent(gameId) + "?pgnInJson=true", { timeoutMs: 30000 });
}

export function mapLichessStatus(status: string, winner: string, whitePlayer: string, blackPlayer: string) {
  if (status === "mate") return { result: "checkmate", winner: winner === "white" ? whitePlayer : blackPlayer };
  if (status === "resign") return { result: "resign", winner: winner === "white" ? whitePlayer : blackPlayer };
  if (status === "timeout" || status === "outoftime") return { result: "timeout", winner: winner === "white" ? whitePlayer : blackPlayer };
  if (status === "aborted") return { result: "aborted", winner: null };
  return { result: status, winner: null };
}
