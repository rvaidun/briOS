// ⚠️ AUTO-GENERATED FILE — DO NOT EDIT MANUALLY
// Run `bun run generate-schemas` to regenerate.

import { z } from "zod";

export const WritingSchema = z.object({
  Slug: z.string().optional(),
  Published: z.string().optional(),
  Name: z.string().optional(),
});

export type Writing = z.infer<typeof WritingSchema>;

export const MusicSchema = z.object({
  Album: z.string().optional(),
  "Spotify URL": z.string().optional(),
  "Played At": z.string().optional(),
  Artist: z.string().optional(),
  Name: z.string().optional(),
});

export type Music = z.infer<typeof MusicSchema>;

export const PlacesSchema = z.object({
  Tags: z.array(z.string()).optional(),
  "Map URL": z.string().optional(),
  City: z.string().optional(),
  Category: z.enum(["Halal restaurant", "Cocktail bar", "Bakery", "Pizza restaurant", "Bar", "Dumpling restaurant", "Taiwanese restaurant", "Italian restaurant", "Sandwich shop", "Chinese bakery", "Cafe", "Restaurant"]).optional(),
  Notes: z.string().optional(),
  Name: z.string().optional(),
});

export type Places = z.infer<typeof PlacesSchema>;
