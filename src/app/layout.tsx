import "./globals.css";

import { Analytics } from "@vercel/analytics/next";
import { BotIdClient } from "botid/client";
import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { PropsWithChildren } from "react";

import { ClientShell } from "@/components/ClientShell";
import { DEFAULT_METADATA, SITE_CONFIG } from "@/lib/metadata";
import { cn } from "@/lib/utils";

import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const ptSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  ...DEFAULT_METADATA,
  alternates: {
    types: {
      "application/rss+xml": `${SITE_CONFIG.url}/blog/rss.xml`,
    },
  },
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="bg-white antialiased md:bg-[#fcfcfc] dark:bg-black"
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#fff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="rgb(10, 10, 10)" media="(prefers-color-scheme: dark)" />
        {/* BotID's client script requires the Vercel-hosted challenge endpoint,
            which 404s in local dev and leaves fetches hanging inside the wrapper.
            Only mount in production; the server's checkBotId() auto-bypasses in dev. */}
        {process.env.NODE_ENV === "production" && (
          <BotIdClient protect={[{ path: "/api/guestbook", method: "POST" }]} />
        )}
      </head>
      <body className={cn(inter.variable, ptSerif.variable)}>
        <Providers>
          <ClientShell>{children}</ClientShell>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
