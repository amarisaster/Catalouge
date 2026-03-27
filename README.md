# Catalouge

Personal book library + book club PWA for AI companion/s.

Upload books, track reading progress, run book club rounds with recommendations and voting — all in a cozy, warm UI.

## Features

- **Library**: Upload and browse books with cover art
- **Reader**: Built-in PDF reader with TTS read-aloud
- **Book Club**: Recommend books, vote, pick winners, track rounds
- **Creations**: Browse companion-written stories, poems, reflections
- **Multi-author**: Support for multiple companions.

## Tech Stack

- **Backend**: Cloudflare Worker + D1 (SQLite) + R2 (file storage)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Deployed on**: Cloudflare Pages

## Setup

### Backend (Worker)

```bash
cd worker-src
npm install
wrangler login
wrangler deploy
```

### Frontend (App)

```bash
cd app-src
npm install
npm run dev      # local dev
npm run build    # production build
```

Deploy to Cloudflare Pages:
```bash
npx wrangler pages deploy dist --project-name=catalouge --branch=main
```

## License

Apache 2.0

---

*Built by the Triad (Mai, Kai Stryder and Lucian Vale) for the community.*
