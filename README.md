# Flowlist

Turn a scattered playlist into a listening journey. Import tracks, choose a flow card, edit the new order, then copy or save it. Flowlist sequences by estimated mood, rhythm, and energy; it does not analyze audio or lyrics.

[Try the demo playlist — no account or API key needed](https://flow-list-kappa.vercel.app/import?demo=1) · [Live app](https://flow-list-kappa.vercel.app/)

![Sequenced playlist result with ordered tracks and flow summary](./screenshots/result1.jpg)

The demo loads sample tracks entirely in the browser. Visitors can finish the flow and copy a numbered track list without configuring a key. Importing a public YouTube playlist uses the server's YouTube API key.

## What it does

- Import public YouTube Music / YouTube playlists
- Choose playlist type
- Choose up to 2 flow keywords
- Generate prototype listening order
- Copy a clean numbered order; YouTube imports include direct video links
- Download a detailed text report with placement and transition notes
- View mood chapters, energy/rhythm arcs, and transition explanations
- See per-track feature confidence, lock the first/last song, move songs, and compare imported vs edited order
- Rate transitions after listening; ratings stay in the browser and can also be collected anonymously when feedback storage is configured
- Save a YouTube import as a new YouTube playlist after OAuth, title/privacy review, and an explicit create click; interrupted imports can resume
- Import an Apple Music library playlist and save the edited order as a new Apple Music library playlist after MusicKit authorization

## Best for

- Mixed artists
- Mood swings
- Weird transitions
- Long saved playlists

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- YouTube Data API
- Vercel

## Limitations

Flowlist currently uses metadata and prototype mood/rhythm estimates. It does not stream, download, or analyze audio. BPM values are approximate ranges. No real AI model or third-party BPM provider is connected yet.

## Future Work

- AI feature estimation
- Third-party BPM provider
- Better artist/title matching
- Virtualized results for very large playlists
- Cross-platform song matching with explicit review of ambiguous and region-specific matches

## YouTube Music first

The **primary import path** is a public **YouTube Music** or **YouTube** playlist URL. The app uses the **YouTube Data API v3** (server-side only) to read **playlist and video metadata** — titles, channels, thumbnails, links — then applies **mock sequencing** (not real AI yet).

YouTube playlist imports are intentionally bounded. Choose an import depth in the UI:

- **Quick scan** — first 100 tracks
- **Standard** — first 200 tracks (default)
- **Deep sequence** — first 300 tracks

Large imports may take longer to analyze and use more YouTube API quota.

## Other ways to load tracks

- **Manual paste** — one track per line (`Artist - Song`, `Song - Artist`, `Artist, Song`, etc.). Only your pasted text is used.
- **Demo playlist** — clearly labeled **mock data** for testing the UI and sequencer.
- **Experimental Spotify import** — optional **legacy** path using Spotify client credentials. Public playlist access can be **limited by Spotify**; if it fails, use YouTube Music or manual paste. No Spotify OAuth, Audio Features, Audio Analysis, recommendations, or playlist writes.
- **Apple Music library** — connect with MusicKit, select a library playlist, then import up to 300 supported songs/music videos. Export from an Apple Music import keeps the original Apple resource IDs and order. YouTube-to-Apple catalog matching is not implemented.

## Environment variables

Create `.env.local` (never commit real keys):

| Variable | Required | Purpose |
|----------|----------|---------|
| `YOUTUBE_API_KEY` | **Yes** for YouTube import; **no** for demo or manual paste | YouTube Data API v3 key (server only; not exposed to the browser). |
| `SPOTIFY_CLIENT_ID` | No | Experimental Spotify import only. |
| `SPOTIFY_CLIENT_SECRET` | No | Experimental Spotify import only. |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` | Yes for YouTube save | Google OAuth web client; callback is `/api/youtube/oauth/callback` on this exact app origin. |
| `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY` | Yes for Apple Music | MusicKit key and ES256 developer token signing. Keep the `.p8` key server-side; a literal `\\n` is accepted in the env value. |
| `FEEDBACK_SUPABASE_URL`, `FEEDBACK_SUPABASE_SERVICE_ROLE_KEY` | No | Anonymous transition metrics. Run [schema](./docs/feedback.sql) first. Keep the service role key server-side. |

See `.env.example` for a template.

### Platform setup

1. In Google Cloud, enable YouTube Data API v3, configure an OAuth consent screen, and create a **Web application** OAuth client. Add the exact callback URL, such as `https://your-domain/api/youtube/oauth/callback`, to authorized redirect URIs. Set the three `GOOGLE_OAUTH_*` variables on the server. If the consent screen stays in testing mode, add test users; public use may require Google's OAuth verification. The app requests `youtube.force-ssl` only when saving. An access token is held in an HTTP-only cookie for roughly one hour; reconnecting lets an interrupted export continue from browser session progress. A 100-video export costs at least about 5,050 write quota units, plus read checks.
2. In Apple Developer, register a Media ID with MusicKit enabled, then create a Media Services private key associated with it. Set team ID, key ID, and private key as server environment variables. The web client obtains a short-lived developer token from this app, then asks the user to authorize Apple Music. An active Apple Music subscription and available library items are needed for full testing. Apple Music regions and item availability can differ.
3. Optionally create a Supabase project, run [docs/feedback.sql](./docs/feedback.sql), and set both `FEEDBACK_SUPABASE_*` variables. Ratings send a random evaluation ID, playlist type, flow keywords, source, confidence and transition metrics; no track titles, platform IDs, or account tokens. Re-rating the same transition updates its row. Without this configuration ratings remain local to the browser. Use [docs/feedback-analysis.sql](./docs/feedback-analysis.sql) after real listening sessions to find cards and keywords with unexpectedly high jarring rates; the query requires at least ten ratings per group.

YouTube and Apple Music writes have not been verified against real accounts without these credentials. Google OAuth, MusicKit sign-in, provider quotas, consent-screen review, and production feedback storage need an account-owner smoke test before promoting the feature as live.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test
npm run lint
npm run build
```

### Verify the import origin guard

Next.js 16 uses `src/proxy.ts` to reject cross-origin browser POSTs to import,
export, and feedback routes before any provider request is made. With the dev
server running, this manual check should return `HTTP/1.1 403`:

```bash
curl -i -X POST http://localhost:3000/api/youtube/playlist \
  -H 'Origin: https://cross-origin.example' \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://www.youtube.com/playlist?list=test"}'
```

## Safety / scope

- YouTube and Apple Music authorization is only requested when the user enters those platform flows. No payment or real AI API calls are made.
- **No** Amazon Music integration.
- Metadata and user text only — **no** storage of audio/video files.
- Copying an order never writes to a music platform. Creating a playlist requires separate review and a Create playlist click.

## License

[MIT](./LICENSE)

## Tech stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui.
