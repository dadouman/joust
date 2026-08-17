import "dotenv/config";
import { createChallenge, acceptChallenge, playMove, exportGame } from "../src/lib/lichess/service";
import { connectBoardGameStream } from "../src/lib/lichess/stream";
import { lichessAccount } from "../src/lib/lichess/client";

const whiteToken = process.env.LICHESS_WHITE_TOKEN ?? "";
const blackToken = process.env.LICHESS_BLACK_TOKEN ?? "";

if (!whiteToken || !blackToken) {
  console.error("Tokens Lichess manquants dans .env (LICHESS_WHITE_TOKEN / LICHESS_BLACK_TOKEN)");
  process.exit(1);
}

let blackUser = process.env.LICHESS_BLACK_USERNAME ?? "";

async function resolveBlackUsername() {
  if (blackUser) return blackUser;
  const acc = await lichessAccount(blackToken);
  blackUser = acc.username;
  console.log("  Compte noir détecte :", blackUser);
  return blackUser;
}

type LichessChallenge = { id: string; url: string; status: string };
type LichessGame = { id: string; pgn?: string; status: string };

async function test1_createChallenge() {
  console.log("\n[Test 1] Création d'une partie Lichess depuis notre backend.");
  const ch = (await createChallenge(whiteToken, blackUser, 3, 2)) as unknown as LichessChallenge;
  console.log("  Challenge créé :", ch.id, "| statut :", ch.status, "| url :", ch.url);
  return ch;
}

async function test2_acceptance() {
  console.log("\n[Test 2] Acceptation depuis le second compte.");
  const ch = await test1_createChallenge();
  await acceptChallenge(blackToken, ch.id);
  console.log("  Challenge accepté avec le token noir.");
  return ch;
}

async function test3_play_white(challengeId: string) {
  console.log("\n[Test 3] Le joueur blanc joue e2e4.");
  await new Promise((r) => setTimeout(r, 1000));
  await playMove(whiteToken, challengeId, "e2e4");
  console.log("  Coup blanc envoyé à Lichess.");
}

async function test5_play_black(challengeId: string) {
  console.log("\n[Test 5] Le joueur noir joue e7e5.");
  await playMove(blackToken, challengeId, "e7e5");
  console.log("  Coup noir envoyé à Lichess.");
}

async function test6_receive_state(challengeId: string) {
  console.log("\n[Test 6] Notre application reçoit l'état adverse.");
  let received = false;
  await Promise.race([
    connectBoardGameStream(challengeId, whiteToken, (evt) => {
      if (evt.type === "gameState") {
        received = true;
        console.log("  gameState reçu :", evt.fen.slice(0, 60));
        console.log("  coups :", evt.moves);
      }
    }),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  console.log("  Synchronisation reçue :", received ? "OUI" : "NON (timeout 3s)");
}

async function test8_verify_game(challengeId: string) {
  console.log("\n[Test 8] Vérification de la partie via export.");
  const game = (await exportGame(challengeId)) as unknown as LichessGame;
  console.log("  gameId :", game.id, "| statut :", game.status);
  console.log("  PGN (début) :", String(game.pgn ?? "non dispo").slice(0, 120));
}

async function main() {
  console.log("=== POC Lichess — démarrage ===");
  await resolveBlackUsername();
  const ch = await test2_acceptance();
  const gameId = ch.id;
  await test3_play_white(gameId);
  await new Promise((r) => setTimeout(r, 1000));
  await test5_play_black(gameId);
  await new Promise((r) => setTimeout(r, 1000));
  await test6_receive_state(gameId);
  await test8_verify_game(gameId);
  console.log("\n=== POC Lichess — partie terminée ===");
}

main().catch((err) => {
  console.error("POC échoué :", err instanceof Error ? err.message : err);
  process.exit(1);
});