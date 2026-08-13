/* ── Script CLI de test de notifications push ──
   Usage :
     npx tsx scripts/push-test.ts <matchId> [titre] [message]
   Exemple :
     npx tsx scripts/push-test.ts a114a055-370f-4d7e-92c1-47829b95f5ef
     npx tsx scripts/push-test.ts <matchId> "🔔 Test Joust" "Notifications OK !"

   Prérequis :
     - DATABASE_URL dans .env
     - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY dans .env (ou .vapid.json généré)
     - Un appareil abonné à ce match (bouton « Activer » dans l'app)
*/
import "dotenv/config";
import { sendPushToMatch } from "@/lib/push";

const [matchId, titleArg, bodyArg] = process.argv.slice(2);

if (!matchId) {
  console.error("Usage: npx tsx scripts/push-test.ts <matchId> [titre] [message]");
  console.error("Exemple: npx tsx scripts/push-test.ts a114a055-370f-4d7e-92c1-47829b95f5ef \"🔔 Test\" \"Cou cou !\"");
  process.exit(1);
}

const title = titleArg ?? "🔔 Joust — Test";
const body = bodyArg ?? "Ceci est un test de notification push. Si tu vois ceci, tout fonctionne !";

console.log(`📨 Envoi d'une notification push vers le match ${matchId}…`);
console.log(`   Titre : ${title}`);
console.log(`   Corps : ${body}`);

const sent = await sendPushToMatch(matchId, title, body);
if (sent === 0) {
  console.error("❌ Aucun appareil abonné pour ce match.");
  console.error("   → Dans l'app Joust, clique sur la cloche, puis « Activer ».");
  console.error("   → Vérifie que la table `push_subscriptions` contient une ligne pour ce match :");
  console.error("     SELECT * FROM push_subscriptions WHERE match_id = '<matchId>';");
  process.exit(2);
}

console.log(`✅ Notification envoyée à ${sent} appareil(s) abonné(s).`);