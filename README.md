# Court Recording Transcriber

Transcribe court recordings with AI-powered speaker identification, synchronized playback, and professional exports. Built with [Case.dev](https://case.dev) APIs.

## ✨ Features

- **Upload & Transcribe** — Drag-and-drop audio files (MP3, WAV, M4A, and more)
- **Speaker Identification** — Automatic detection with customizable labels (Judge, Attorney, Witness)
- **Synced Playback** — Click any line to jump to that moment in the audio
- **Search** — Find words or phrases instantly with highlighted results
- **Export** — Download as PDF, Word, or plain text with legal formatting
- **Legal Vocabulary** — Enhanced accuracy for terms like "objection", "sustained", "plaintiff"

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your CASEDEV_API_KEY and DATABASE_URL

# Initialize database
npm run db:push

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🔧 Environment Variables

| Variable | Description |
|----------|-------------|
| `CASEDEV_API_KEY` | Your Case.dev API key |
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXT_PUBLIC_APP_URL` | App URL (for webhooks in production) |

## 📁 Project Structure

```
src/
├── app/
│   ├── api/recordings/     # API routes
│   ├── upload/             # Upload page
│   └── recording/[id]/     # Transcript viewer
├── components/ui/          # UI components
└── lib/
    ├── db/                 # Database schema
    └── legal-vocabulary.ts # Word boosting config
```

## 🛠 Tech Stack

Next.js 16 • React 19 • Tailwind CSS • PostgreSQL • Drizzle ORM • wavesurfer.js • Case.dev APIs

## 📝 Scripts

```bash
npm run dev        # Development server
npm run build      # Production build
npm run db:push    # Sync database schema
npm run db:studio  # Open database GUI
```

## License

MIT
