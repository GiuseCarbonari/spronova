import type { Metadata, Viewport } from "next";
import { Newsreader, Syne } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "CurveLoad",
  description:
    "Coach AI endurance connesso a Intervals.icu: pianifica, adatta e spiega l'allenamento usando dati reali e il protocollo Section 11.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="it"
      suppressHydrationWarning
      className={`${syne.variable} ${newsreader.variable}`}
    >
      <head>
        {/*
          Applica il tema salvato prima del primo paint per evitare il flash.
          Default: scuro (tema storico dell'app) se l'utente non ha mai scelto.
          La chiave deve restare allineata con components/layout/theme-toggle.tsx.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('curveload-theme');if(t!=='light'){document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
