import { VAPID_PUBLIC_KEY } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ publicKey: VAPID_PUBLIC_KEY });
}
