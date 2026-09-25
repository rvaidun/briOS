import "./globals.css";

import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import Script from "next/script";
import { PropsWithChildren } from "react";

import { ClientShell } from "@/components/ClientShell";
import type { ClientSession } from "@/components/SessionProvider";
import { getSession } from "@/lib/auth/user";
import { type UserRoleValue } from "@/lib/db/schema";
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

export default async function RootLayout({ children }: PropsWithChildren) {
  const session = await getSession();
  const clientSession: ClientSession = session
    ? {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          image: session.user.image,
          role: session.user.role as UserRoleValue,
        },
      }
    : null;

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
      </head>
      <body className={cn(inter.variable, ptSerif.variable)}>
        <Providers session={clientSession}>
          <ClientShell>{children}</ClientShell>
        </Providers>
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
          <Script
            src="/_/i.js"
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
            data-host-url="https://www.rahul.ws"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
