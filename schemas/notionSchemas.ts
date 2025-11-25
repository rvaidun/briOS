// ⚠️ AUTO-GENERATED FILE — DO NOT EDIT MANUALLY
// Run `bun run generate-schemas` to regenerate.

import { z } from "zod";

export const MusicSchema = z.object({
  image: z.string().optional(),
  album: z.string().optional(),
  url: z.string().optional(),
  playedAt: z.string().optional(),
  artist: z.string().optional(),
  name: z.string().optional(),
});

export type Music = z.infer<typeof MusicSchema>;
