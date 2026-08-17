"use client";

import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";

import { type ClientSession, SessionProvider } from "@/components/SessionProvider";
import { swrConfig } from "@/lib/swr-config";

interface ProvidersProps {
  children: React.ReactNode;
  session: ClientSession;
}

export function Providers({ children, session }: ProvidersProps) {
  return (
    <SessionProvider session={session}>
      <SWRConfig value={swrConfig}>
        <ThemeProvider
          storageKey="prototype-theme"
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </SWRConfig>
    </SessionProvider>
  );
}
