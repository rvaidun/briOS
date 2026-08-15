# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands

- `bun run dev` - Start development server with Turbopack (auto-generates schemas) - **ALWAYS RUNNING ON PORT 3000** (do not attempt to start)
- `bun run build` - Build production bundle
- `bun run lint` - Run ESLint
- `bun run lint:fix` - Run ESLint with auto-fix
- `bun run format` - Format code with Prettier
- `bun run generate-schemas` - Generate TypeScript schemas from Notion databases
- `bun run db:generate` - Generate Drizzle migration SQL from `src/lib/db/schema.ts` (output: `drizzle/`)
- `bun run db:migrate` - Apply pending migrations to the database at `DATABASE_URL`
- `bun run db:studio` - Open Drizzle Studio against `DATABASE_URL`

### Environment Setup

- Use Bun for package management (not npm/yarn)
- Use TailwindCSS for styling (latest version)
- Required environment variables for full functionality:
  - `NOTION_TOKEN` - Notion API token
  - `NOTION_STACK_DATABASE_ID` - Stack items database
  - `NOTION_AMA_DATABASE_ID` - AMA questions database
  - `ADMIN_USER_ID` - Admin user restriction
  - `KV_REST_API_URL` / `KV_REST_API_TOKEN` - Upstash Redis (Vercel KV) credentials used by the blog hearts counter (`src/lib/hearts.ts`). Missing values cause hearts to gracefully degrade to 0.
  - `DATABASE_URL` - Neon Postgres connection string used by the listening history (`src/lib/db/`). Required for `/listening` reads and the listening sync cron.
  - `LOCAL_TZ` - Timezone for hour-of-day listening analytics (default `America/Los_Angeles`). Used by `src/lib/db/stats.ts`.
  - `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` - Spotify app credentials used by both the listening cron (refresh flow) and the web re-auth routes.
  - `SPOTIFY_OWNER_USER_ID` - Your Spotify user id (from `GET /v1/me`). The `/api/auth/spotify/callback` route refuses to save tokens unless the freshly-authorized account matches this id, so even a leaked re-auth link can't poison the listening pipeline.
  - `SPOTIFY_REAUTH_SECRET` - Required `?key=` query param on `/api/auth/spotify/start`. Long random string; the cron embeds it in the Discord re-auth link.
  - `SPOTIFY_REDIRECT_URI` - Optional override. When unset, the start/callback routes derive the redirect URI from the request origin (`<origin>/api/auth/spotify/callback`). The production URI must be registered on the Spotify app dashboard.
  - `GUESTBOOK_IP_SALT` - Optional random string used to SHA-256 hash submitter IPs on `/api/guestbook`. Enables bulk-deleting abuse by IP without storing raw addresses. Unset ⇒ no hashing (rows store `null`).
  - `GUESTBOOK_ADMIN_PASSWORD` - Password for `/guestbook/admin`. Unset ⇒ the admin page is permanently locked (no login possible). Rotating this value invalidates every existing admin session.
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth client credentials for the Google Drive integration that powers `/runs`. Instead of setting these, you can drop the `client_secret_*.json` downloaded from Google Cloud Console at the project root — it's gitignored and read as a fallback by `src/lib/runs/google-drive.ts`.
  - `GOOGLE_OWNER_EMAIL` - Your Google account email. `scripts/bootstrapGoogleDriveAuth.ts` refuses to save tokens unless the freshly-authorized account matches this. Prevents a leaked re-auth link from repointing the pipeline.
  - `GOOGLE_DRIVE_RUNS_FOLDER_ID` - The Drive folder id containing exported Apple Watch `.fit` files. `scripts/syncRuns.ts` polls this folder.
  - `GOOGLE_REDIRECT_URI` - Optional (default: `http://localhost/callback/`). Must be registered as an authorized redirect URI on the OAuth client in Google Cloud Console.
  - `LOCAL_FIT_DIR` - Dev only. Directory scanned when `getParsedFit` sees a `local:<md5>` `drive_file_id` (rows inserted via `syncRuns.ts --file`). Skipped in production so a leaked env var can't smuggle in an arbitrary local path.
  - `NEXT_PUBLIC_MAP_STYLE_URL` - Optional. Overrides the default inline OSM raster style used by `/runs` maps. Point at a hosted MapLibre style URL (e.g. `https://tiles.openfreemap.org/styles/positron`) or a `pmtiles://...` URL for a self-hosted vector basemap.

## Architecture Overview

### Data Management

- **Notion as CMS**: All content (stacks, AMA, writing) is stored in separate Notion databases
- **Schema Generation**: TypeScript schemas are auto-generated from Notion database properties via `generateNotionSchemas.ts`
- **API Routes**: Next.js route handlers provide cached API endpoints (24-hour cache) for each content type
- **Data Fetching**: SWR for client-side data fetching with custom hooks in `/hooks/`

### UI Architecture

- **Layout System**: Main layout with collapsible sidebar (`PrimarySidebar`) and command menu (`CommandMenu`)
- **List-Detail Pattern**: Consistent navigation pattern with `ListDetailLayout` component
- **State Management**: Jotai for global state (sidebar toggle)
- **Styling**: TailwindCSS with custom design tokens, Radix UI components
- **Hotkeys**: Global keyboard shortcuts via react-hotkeys-hook

### Key Patterns

- **Route Structure**: App router with nested layouts for each content section
- **Infinite Scroll**: Custom `InfiniteScrollList` component with `useInfiniteScroll` hook
- **Theme Support**: next-themes for dark/light mode switching
- **Content Rendering**: Notion blocks rendered to React components in `renderBlocks.tsx`

### Migration Scripts

- `backfillStacksToNotion.ts` - Migrate JSON stack data to Notion
- `backfillAmaToNotion.ts` - Migrate AMA questions to Notion
- `migrateSimplecast.ts` - Mirror podcast episodes to S3

### API Caching

All API routes use Next.js route handlers with 24-hour caching. Data is fetched from Notion and transformed using generated schemas for type safety.
