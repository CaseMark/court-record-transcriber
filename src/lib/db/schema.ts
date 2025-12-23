import { pgTable, text, integer, real, timestamp, index } from 'drizzle-orm/pg-core';

// Recordings table - tracks uploaded court recordings
export const recordings = pgTable('recordings', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull(),
  originalFormat: text('original_format').notNull(), // 'ftr', 'mp3', 'wav', etc.
  fileSizeBytes: integer('file_size_bytes').notNull(),
  durationSeconds: integer('duration_seconds'),
  
  // Case.dev references
  vaultId: text('vault_id'),
  vaultObjectId: text('vault_object_id'), // Original file
  convertedObjectId: text('converted_object_id'), // M4A after conversion
  convertedAudioUrl: text('converted_audio_url'), // URL to play converted audio
  convertJobId: text('convert_job_id'),
  transcriptionJobId: text('transcription_job_id'),
  
  // Status tracking
  // 'uploading' | 'converting' | 'transcribing' | 'completed' | 'failed'
  status: text('status').notNull().default('uploading'),
  errorMessage: text('error_message'),
  
  // Metadata
  caseNumber: text('case_number'),
  courtName: text('court_name'),
  recordingDate: text('recording_date'),
  
  // Channels info (for multi-channel FTR recordings)
  channelCount: integer('channel_count'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('recordings_status_idx').on(table.status),
  index('recordings_case_number_idx').on(table.caseNumber),
  index('recordings_created_at_idx').on(table.createdAt),
]);

// Transcripts table - stores transcription results
export const transcripts = pgTable('transcripts', {
  id: text('id').primaryKey(),
  recordingId: text('recording_id').notNull().references(() => recordings.id, { onDelete: 'cascade' }),
  
  fullText: text('full_text').notNull(),
  confidence: real('confidence'),
  language: text('language').default('en'),
  
  // Summary/chapters if enabled
  summary: text('summary'),
  chaptersJson: text('chapters_json'), // JSON string of chapters
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('transcripts_recording_id_idx').on(table.recordingId),
]);

// Utterances table - individual speaker segments with timestamps
export const utterances = pgTable('utterances', {
  id: text('id').primaryKey(),
  transcriptId: text('transcript_id').notNull().references(() => transcripts.id, { onDelete: 'cascade' }),
  recordingId: text('recording_id').notNull().references(() => recordings.id, { onDelete: 'cascade' }),
  
  speaker: text('speaker').notNull(), // 'A', 'B', 'C', etc.
  speakerLabel: text('speaker_label'), // 'Judge', 'Attorney 1', etc. (user-assigned)
  text: text('text').notNull(),
  
  startMs: integer('start_ms').notNull(), // Milliseconds from start
  endMs: integer('end_ms').notNull(),
  
  // For search indexing and ordering
  sequenceIndex: integer('sequence_index').notNull(),
}, (table) => [
  index('utterances_recording_id_idx').on(table.recordingId),
  index('utterances_transcript_id_idx').on(table.transcriptId),
  index('utterances_speaker_idx').on(table.speaker),
  index('utterances_sequence_idx').on(table.recordingId, table.sequenceIndex),
]);

// Speaker labels - user-defined speaker names per recording
export const speakerLabels = pgTable('speaker_labels', {
  id: text('id').primaryKey(),
  recordingId: text('recording_id').notNull().references(() => recordings.id, { onDelete: 'cascade' }),
  speakerId: text('speaker_id').notNull(), // 'A', 'B', etc.
  label: text('label').notNull(), // 'Judge Smith', 'Defense Attorney', etc.
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('speaker_labels_recording_id_idx').on(table.recordingId),
]);

// Search history - for quick access to recent searches
export const searchHistory = pgTable('search_history', {
  id: text('id').primaryKey(),
  recordingId: text('recording_id').references(() => recordings.id, { onDelete: 'cascade' }),
  query: text('query').notNull(),
  resultCount: integer('result_count'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('search_history_recording_id_idx').on(table.recordingId),
  index('search_history_created_at_idx').on(table.createdAt),
]);

// Types for TypeScript
export type Recording = typeof recordings.$inferSelect;
export type NewRecording = typeof recordings.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
export type Utterance = typeof utterances.$inferSelect;
export type NewUtterance = typeof utterances.$inferInsert;
export type SpeakerLabel = typeof speakerLabels.$inferSelect;
export type NewSpeakerLabel = typeof speakerLabels.$inferInsert;
