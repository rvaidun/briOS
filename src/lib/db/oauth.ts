import { eq } from "drizzle-orm";

import { db } from "./client";
import { oauthTokens } from "./schema";

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

export async function getOAuthTokens(source: string): Promise<OAuthTokens | null> {
  const rows = await db.select().from(oauthTokens).where(eq(oauthTokens.source, source)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    expiresAt: row.expiresAt,
  };
}

export async function saveOAuthTokens(source: string, tokens: OAuthTokens): Promise<void> {
  await db
    .insert(oauthTokens)
    .values({
      source,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: oauthTokens.source,
      set: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        updatedAt: new Date(),
      },
    });
}
