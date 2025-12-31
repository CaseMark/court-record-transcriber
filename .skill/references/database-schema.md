# Database Schema Reference

PostgreSQL database managed with Drizzle ORM.

**Schema location**: `src/lib/db/schema.ts`

## Tables

### recordings
Uploaded audio files and their metadata.

```typescript
export const recordings = pgTable('recordings', {
  id: uuid('id').defaultRandom().primaryKey(),
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),  // bytes
  duration: real('duration'),  // seconds
  audioUrl: text('audio_url'),  // Storage URL
  status: text('status', { 
    enum: ['uploaded', 'processing', 'transcribed', 'failed'] 
  }).notNull().default('uploaded'),
  casedevAudioId: text('casedev_audio_id'),  // Case.dev reference
  casedevJobId: text('casedev_job_id'),  // Transcription job ID
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### transcripts
Transcription results linked to recordings.

```typescript
export const transcripts = pgTable('transcripts', {
  id: uuid('id').defaultRandom().primaryKey(),
  recordingId: uuid('recording_id')
    .notNull()
    .unique()
    .references(() => recordings.id, { onDelete: 'cascade' }),
  language: text('language').default('en'),
  speakerCount: integer('speaker_count'),
  speakerMap: jsonb('speaker_map'),  // { "SPEAKER_00": "Judge Smith" }
  wordCount: integer('word_count'),
  confidence: real('confidence'),  // 0-1 average confidence
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### utterances
Individual speech segments with timestamps.

```typescript
export const utterances = pgTable('utterances', {
  id: uuid('id').defaultRandom().primaryKey(),
  transcriptId: uuid('transcript_id')
    .notNull()
    .references(() => transcripts.id, { onDelete: 'cascade' }),
  speaker: text('speaker').notNull(),  // SPEAKER_00, SPEAKER_01, etc.
  text: text('text').notNull(),
  startTime: real('start_time').notNull(),  // seconds
  endTime: real('end_time').notNull(),  // seconds
  confidence: real('confidence'),
  sequenceIndex: integer('sequence_index').notNull(),
});
```

## Indexes

```typescript
// Fast utterance lookup by transcript
export const utterancesTranscriptIdx = index('utterances_transcript_idx')
  .on(utterances.transcriptId);

// Fast time-based queries
export const utterancesTimeIdx = index('utterances_time_idx')
  .on(utterances.transcriptId, utterances.startTime);

// Recording status filtering
export const recordingsStatusIdx = index('recordings_status_idx')
  .on(recordings.status);
```

## Relationships

```typescript
export const recordingsRelations = relations(recordings, ({ one }) => ({
  transcript: one(transcripts),
}));

export const transcriptsRelations = relations(transcripts, ({ one, many }) => ({
  recording: one(recordings, {
    fields: [transcripts.recordingId],
    references: [recordings.id],
  }),
  utterances: many(utterances),
}));

export const utterancesRelations = relations(utterances, ({ one }) => ({
  transcript: one(transcripts, {
    fields: [utterances.transcriptId],
    references: [transcripts.id],
  }),
}));
```

## Common Queries

### Get recording with full transcript
```typescript
const recording = await db.query.recordings.findFirst({
  where: eq(recordings.id, recordingId),
  with: {
    transcript: {
      with: {
        utterances: {
          orderBy: [asc(utterances.sequenceIndex)],
        },
      },
    },
  },
});
```

### Get utterance at timestamp
```typescript
const utterance = await db
  .select()
  .from(utterances)
  .where(
    and(
      eq(utterances.transcriptId, transcriptId),
      lte(utterances.startTime, timestamp),
      gte(utterances.endTime, timestamp)
    )
  )
  .limit(1);
```

### Search transcript text
```typescript
const results = await db
  .select()
  .from(utterances)
  .where(
    and(
      eq(utterances.transcriptId, transcriptId),
      ilike(utterances.text, `%${searchTerm}%`)
    )
  )
  .orderBy(asc(utterances.startTime));
```

### Update speaker labels
```typescript
await db
  .update(transcripts)
  .set({
    speakerMap: {
      SPEAKER_00: 'Judge Wilson',
      SPEAKER_01: 'Attorney Johnson',
      SPEAKER_02: 'Witness Martinez',
    },
  })
  .where(eq(transcripts.id, transcriptId));
```

### Get recordings by status
```typescript
const pendingRecordings = await db
  .select()
  .from(recordings)
  .where(eq(recordings.status, 'processing'));
```

## Type Exports

```typescript
export type Recording = typeof recordings.$inferSelect;
export type NewRecording = typeof recordings.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
export type Utterance = typeof utterances.$inferSelect;
export type NewUtterance = typeof utterances.$inferInsert;

// With relations
export type RecordingWithTranscript = Recording & {
  transcript: Transcript & { utterances: Utterance[] } | null;
};
```

## Commands

```bash
npm run db:push      # Apply schema directly (dev)
npm run db:generate  # Create migration files
npm run db:studio    # Visual database browser
```
