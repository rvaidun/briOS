#!/usr/bin/env bun
/**
 * Print a fresh Apple Music developer JWT to stdout. Paste it into
 * scripts/apple-music-auth.html (open the file in a browser) to mint a
 * long-lived user token via MusicKit JS sign-in.
 *
 * Usage: bun scripts/mintAppleDevToken.ts
 * Requires: APPLE_TEAM_ID, APPLE_MUSICKIT_KEY_ID,
 *           APPLE_MUSICKIT_PRIVATE_KEY_B64 (or _PRIVATE_KEY)
 */
import { mintAppleDeveloperToken } from "../src/lib/apple-music";

console.log(mintAppleDeveloperToken());
