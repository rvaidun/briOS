// ⚠️ AUTO-GENERATED FILE — DO NOT EDIT MANUALLY
// Run `bun run generate-schemas` to regenerate.

import { z } from "zod";

export const MusicSchema = z.object({
  Album: z.string().optional(),
  "Spotify URL": z.string().optional(),
  "Played At": z.string().optional(),
  Artist: z.string().optional(),
  Name: z.string().optional(),
});

export type Music = z.infer<typeof MusicSchema>;
