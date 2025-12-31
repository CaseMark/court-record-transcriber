# Court Record Transcriber Skill

Agent skill for developing the court-record-transcriber application.

## Directory Structure

```
.skill/
├── SKILL.md                            # Core skill (always read first)
└── references/
    ├── database-schema.md              # Drizzle ORM schema
    ├── casedev-transcription-api.md    # Case.dev Speech-to-Text API
    └── audio-playback.md               # wavesurfer.js patterns
```

---

## File Descriptions

### SKILL.md
**Purpose**: Primary entry point for the skill

**Contains**:
- Application architecture overview
- Tech stack summary (Next.js 16, PostgreSQL, wavesurfer.js, Case.dev)
- Core workflow (upload → transcribe → speakers → review → export)
- Feature summary (upload, transcription, speaker ID, search, export)
- Development setup commands
- Common task patterns
- Troubleshooting table

**When loaded**: Automatically when skill triggers on queries about court-record-transcriber, transcription, court recordings, or speaker identification

**Size**: ~140 lines

---

### references/database-schema.md
**Purpose**: Drizzle ORM schema reference

**Contains**:
- Complete table definitions: recordings, transcripts, utterances
- Index definitions for time-based queries
- Relationship definitions
- Common queries (get with transcript, search text, update speakers)
- Type exports with relations

**When to read**: Modifying database schema, writing queries, adding new tables

**Size**: ~150 lines

---

### references/casedev-transcription-api.md
**Purpose**: Case.dev Speech-to-Text API integration

**Contains**:
- Base API client configuration
- Audio upload endpoint and supported formats
- Transcription request/response types
- Speaker diarization settings
- Legal vocabulary boosting list
- Polling implementation with progress
- Webhook alternative pattern
- Rate limits and error handling
- Best practices

**When to read**: Working with transcription features, debugging API issues, adding vocabulary

**Size**: ~200 lines

---

### references/audio-playback.md
**Purpose**: wavesurfer.js audio playback patterns

**Contains**:
- WaveSurfer setup and configuration
- React component patterns
- Synchronized transcript with click-to-seek
- Auto-scroll to active utterance
- Keyboard shortcuts (space, arrows)
- Playback speed control
- Time formatting utilities
- Search and highlight implementation
- CSS styling for waveform and transcript

**When to read**: Building audio player features, sync issues, adding playback controls

**Size**: ~180 lines

---

## Progressive Disclosure

| Level | What Loads | Token Cost |
|-------|------------|------------|
| 1 | Frontmatter (name + description) | ~60 tokens |
| 2 | SKILL.md body | ~850 tokens |
| 3 | Reference files (as needed) | ~450-550 tokens each |

---

## Installation

```bash
cd court-record-transcriber
mkdir -p .skill/references
# Copy files into place
git add .skill/
git commit -m "Add agent skill for court-record-transcriber development"
```

---

## Trigger Examples

| Query | Loads |
|-------|-------|
| "Fix the upload form validation" | SKILL.md only |
| "Add word-level timestamps" | SKILL.md + casedev-transcription-api.md |
| "Store speaker names in database" | SKILL.md + database-schema.md |
| "Fix the click-to-seek sync" | SKILL.md + audio-playback.md |
| "Build full transcription pipeline" | SKILL.md + casedev-transcription-api.md + database-schema.md |
