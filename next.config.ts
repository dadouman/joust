import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      /* Le service worker doit TOUJOURS être re-téléchargé par le navigateur.
         Sans ça, une PWA installée peut rester bloquée sur l'ancienne version
         indéfiniment (le navigateur ne vérifie le SW que s'il peut le re-récupérer). */
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      /* Le manifest est aussi vérifié par iOS pour détecter les mises à jour. */
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
      /* Les icônes PWA : re-vérification périodique raisonnable. */
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;
