# Court Recording Transcriber

A Next.js web application that converts FTR court recordings to standard audio, transcribes with timestamps and speaker identification, and provides a searchable transcript archive with synchronized playback.

## Features

- **FTR → MP3/WAV Conversion**: Upload proprietary FTR court recordings and convert them to standard audio formats
- **Multi-channel Audio Support**: Handle multi-track recordings common in court settings
- **Timestamped Transcript Generation**: AI-powered transcription with word-level timestamps
- **Speaker Identification**: Automatic speaker diarization (Judge, Attorney 1, Attorney 2, etc.)
- **Searchable Transcript Archive**: Find specific words or phrases across transcripts
- **Synchronized Playback**: Click any transcript segment to jump to that point in the audio
- **Export to Word/PDF**: Generate formatted transcripts with timestamps

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI**: shadcn/ui + Tailwind CSS
- **Database**: SQLite + Drizzle ORM
- **Audio Processing**: Case.dev Convert API
- **Transcription**: Case.dev Voice API
- **Storage & Search**: Case.dev Vaults API

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Case.dev API key (get one at [case.dev](https://case.dev))

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd crtrcrdtranscribe
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Case.dev API key:
```
CASEDEV_API_KEY=your_api_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. Initialize the database:
```bash
npm run db:push
```

5. Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Project Structure

```
/src
├── app/
│   ├── api/
│   │   ├── recordings/           # Recording CRUD operations
│   │   │   ├── route.ts          # GET (list), POST (create)
│   │   │   └── [id]/
│   │   │       ├── route.ts      # GET, PATCH, DELETE
│   │   │       ├── process/      # Trigger conversion/transcription
│   │   │       ├── search/       # Search within transcript
│   │   │       ├── speakers/     # Manage speaker labels
│   │   │       └── export/       # Export to Word/Text
│   │   └── webhooks/
│   │       ├── convert/          # Case.dev Convert completion
│   │       └── transcribe/       # Case.dev Voice completion
│   ├── page.tsx                  # Dashboard
│   ├── upload/page.tsx           # Upload new recording
│   └── recording/[id]/page.tsx   # Transcript viewer
├── components/
│   ├── ui/                       # shadcn/ui components
│   └── providers/                # React Query provider
└── lib/
    ├── db/
    │   ├── index.ts              # Database connection
    │   └── schema.ts             # Drizzle schema
    ├── casedev.ts                # Case.dev API client
    └── utils.ts                  # Utility functions
```

## Database Schema

- **recordings**: Stores uploaded court recordings and their processing status
- **transcripts**: Stores transcription results
- **utterances**: Individual speaker segments with timestamps
- **speaker_labels**: User-defined speaker names
- **search_history**: Recent search queries

## API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/recordings` | List all recordings |
| POST | `/api/recordings` | Create new recording |
| GET | `/api/recordings/[id]` | Get recording with transcript |
| DELETE | `/api/recordings/[id]` | Delete recording |
| POST | `/api/recordings/[id]/process` | Start conversion/transcription |
| GET | `/api/recordings/[id]/search` | Search transcript |
| PUT | `/api/recordings/[id]/speakers` | Update speaker labels |
| GET | `/api/recordings/[id]/export` | Export transcript |

## Processing Pipeline

1. **Upload**: User uploads FTR or audio file
2. **Convert** (if FTR): Case.dev Convert API converts to M4A
3. **Transcribe**: Case.dev Voice API transcribes with speaker diarization
4. **Index**: Transcript stored in database for search
5. **Ready**: User can play audio with synchronized transcript

## Handling Large Files

Court recordings can be several hours long (1-5GB). The app handles this through:

- **Presigned URLs**: Files upload directly to S3, bypassing the server
- **Chunked uploads**: Large files are uploaded in chunks with progress tracking
- **Async processing**: Conversion and transcription run in the background via webhooks
- **Streaming audio**: Audio player loads progressively

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run db:push      # Push schema changes to database
npm run db:studio    # Open Drizzle Studio (database GUI)
npm run db:generate  # Generate migration files
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CASEDEV_API_KEY` | Your Case.dev API key |
| `NEXT_PUBLIC_APP_URL` | App URL for webhooks (use ngrok for local dev) |

## Webhooks (Production)

For webhooks to work in production, deploy the app and set `NEXT_PUBLIC_APP_URL` to your deployed URL. For local development, use [ngrok](https://ngrok.com/) to expose your local server:

```bash
ngrok http 3000
```

Then set `NEXT_PUBLIC_APP_URL` to the ngrok URL.

## Future Enhancements

- [ ] Real-time transcription (live court proceedings)
- [ ] Multi-language support
- [ ] Court exhibit linking
- [ ] Batch upload processing
- [ ] Advanced search with filters
- [ ] Collaborative speaker labeling
- [ ] Integration with case management systems

## License

MIT
