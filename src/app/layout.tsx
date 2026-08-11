import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Joust",
  description: "Une partie d'échecs, à l'heure dite, entre deux amis.",
  applicationName: "Joust",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icons/icon-512.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Joust" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#101b2d",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
