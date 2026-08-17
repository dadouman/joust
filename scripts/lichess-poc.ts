import "dotenv/config";
import { createChallenge, acceptChallenge, playMove, exportGame } from "../src/lib/lichess/service";
import { connectBoardGameStream } from "../src/lib/lichess/stream";
import { lichessAccount } from "../src/lib/lichess/client";

const whiteToken = process.env.LICHESS_WHITE_TOKEN ?? "";
const blackToken = process.env.LICHESS_BLACK_TOKEN ?? "";
if (!whiteToken || !blackToken) {
  console.error("Tokens Lichess manquants dans .env");
  process.exit(1);
}

let blackUser = process.env.LICHESS_BLACK_USERNAME ?? "";
async function resolveBlackUsername() {
  if (blackUser) return blackUser;
  const acc = await lichessAccount(blackToken);
  blackUser = acc.username;
  console.log("Compte noir detecte :", blackUser);
  return blackUser;
}

async function main() {
  console.log("=== POC Lichess — demarrage ===");
  await resolveBlackUsername();

  console.log("\n[Test 1] Creation d'une partie Lichess.");
  const ch = (await createChallenge(whiteToken, blackUser, 3, 2)) as { id: string; url: string };
  console.log("Challenge :", ch.id, "| url :", ch.url);
  const gameId = ch.id;

  console.log("\n[Test 2] Acceptation depuis le second compte.");
  await acceptChallenge(blackToken, gameId);
  console.log("Challenge accepte.");

  console.log("\n[Test 3-4] Blanc joue e2e4, verifie cote Lichess.");
  await new Promise((r) => setTimeout(r, 1000));
  await playMove(whiteToken, gameId, "e2e4");
  console.log("Coup blanc envoye.");

  console.log("\n[Test 5] Noir joue e7e5.");
  await playMove(blackToken, gameId, "e7e5");
  console.log("Coup noir envoye.");

  console.log("\n[Test 6] Reception de l'etat adverse via le stream.");
  let received = false;
  await Promise.race([
    connectBoardGameStream(gameId, whiteToken, (evt) => {
      if (evt.type === "gameState" || (evt.type === "gameFull" && evt.state)) {
        received = true;
        console.log("Etat recu, coups joues sur Lichess.");
      }
    }),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  console.log("Synchronisation :", received ? "OUI" : "NON (timeout)");

  console.log("\n[Test 8] Verification export de la partie.");
  const game = (await exportGame(gameId)) as { id: string; status: string };
  console.log("gameId :", game.id, "| statut :", game.status);
  console.log("Partie retrouvable : https://lichess.org/" + game.id);

  console.log("\n=== POC Lichess — termine ===");
}

main().catch((err) => {
  console.error("POC echoue :", err instanceof Error ? err.message : err);
  process.exit(1);
});