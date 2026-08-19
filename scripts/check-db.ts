import "dotenv/config";
import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db" });
  await c.connect();

  // 1. Colonnes
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='matches' ORDER BY ordinal_position");
  console.log("COLONNES:", cols.rows.map((x) => x.column_name).join(", "));

  // 2. Test d'un vrai INSERT (puis rollback pour ne pas polluer)
  try {
    await c.query("BEGIN");
    const ins = await c.query(
      `INSERT INTO matches (creator_name, creator_token, guest_name, invite_code, scheduled_at, time_zone, time_of_day, recurrence_days, invite_status, game_type, time_control, time_control_by, time_control_confirmed, status, white_player, black_player)
       VALUES ($1, $2, '', $3, $4, 'Europe/Paris', '20:30', '1,3,5', 'pending', 'chess', 'blitz', 'creator', false, 'scheduled', $1, '')
       RETURNING id, invite_code`,
      ["TEST_" + Date.now(), "tok" + Date.now(), "ABCDEF" + Date.now().toString().slice(-2)],
    );
    console.log("INSERT OK:", ins.rows[0]);
    await c.query("ROLLBACK");
  } catch (e) {
    console.error("INSERT ERREUR:", e instanceof Error ? e.message : String(e));
    await c.query("ROLLBACK").catch(() => undefined);
  }

  // 3. Compteur de jousts existants
  const cnt = await c.query("SELECT count(*)::int AS n FROM matches");
  console.log("JOUSTS EN BASE:", cnt.rows[0].n);

  await c.end();
}

main().catch((e) => {
  console.error("ERREUR:", e.message);
  process.exit(1);
