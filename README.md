# Flowlist

Flowlist reorders playlists into a smoother **listening journey** using **emotional continuity**, **rhythmic continuity**, **energy progression**, and **user-chosen flow keywords** (intro → build → peak → cooldown → outro). It does **not** stream music, download audio/video, or run lyrics analysis.

## Live Demo

flow-list-kappa.vercel.app

## What it does

- Import public YouTube Music / YouTube playlists
- Choose playlist type
- Choose up to 2 flow keywords
- Generate prototype listening order
- View mood chapters, energy/rhythm arcs, and transition explanations

## Screenshots

### Landing Page
![Landing Page](screenshots:landing.png)

### Guided Flow
![Guided Flow](screenshots:import-flow.png.jpg)
![Guided Flow](screenshots:defining_playlist.jpg)

### Flow Keywords
![Flow Keywords](screenshots:keyword-cards.jpg)

### Results
![Results](screenshots:result1.jpg)
![Results](screenshots:result2.jpg)
![Results](screenshots:result3.jpg)

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
- Export/copy workflow polish

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

## Environment variables

Create `.env.local` (never commit real keys):

| Variable | Required | Purpose |
|----------|----------|---------|
| `YOUTUBE_API_KEY` | **Yes** for YouTube import | YouTube Data API v3 key (server only; not exposed to the browser). |
| `SPOTIFY_CLIENT_ID` | No | Experimental Spotify import only. |
| `SPOTIFY_CLIENT_SECRET` | No | Experimental Spotify import only. |

See `.env.example` for a template.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm run build
```

## Safety / scope

- No **authentication**, **database**, **payment**, or **real AI API** calls in this prototype.
- **No** Amazon Music integration.
- Metadata and user text only — **no** storage of audio/video files.

## Tech stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui.
