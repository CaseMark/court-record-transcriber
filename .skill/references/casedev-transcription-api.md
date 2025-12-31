# Case.dev Transcription API Reference

Patterns for integrating with Case.dev Speech-to-Text APIs.

## Base Configuration

```typescript
// lib/casedev/client.ts
const BASE_URL = 'https://api.case.dev/v1';
const API_KEY = process.env.CASEDEV_API_KEY;

async function casedevFetch(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    throw new CaseDevError(await response.json());
  }
  
  return response.json();
}
```

## Upload Audio

### Upload for Transcription
```typescript
interface UploadAudioResponse {
  audio_id: string;
  duration: number;  // seconds
  format: string;
  sample_rate: number;
}

async function uploadAudio(file: File): Promise<UploadAudioResponse> {
  const formData = new FormData();
  formData.append('file', file);
  
  return fetch(`${BASE_URL}/audio/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}` },
    body: formData,
  }).then(r => r.json());
}
```

### Supported Formats
- MP3 (.mp3)
- WAV (.wav)
- M4A (.m4a)
- FLAC (.flac)
- OGG (.ogg)
- WebM (.webm)

### File Size Limits
- Maximum: 500MB
- Recommended: Compress audio if over 100MB
- Duration: Up to 4 hours per file

## Start Transcription

### Request
```typescript
interface TranscriptionRequest {
  audio_id: string;
  language?: string;  // ISO code, default 'en'
  speaker_diarization?: boolean;  // Identify speakers
  vocabulary_boost?: string[];  // Words to boost
  punctuation?: boolean;  // Add punctuation
  timestamps?: 'word' | 'segment';  // Timestamp granularity
}

interface TranscriptionResponse {
  job_id: string;
  status: 'queued' | 'processing';
  estimated_duration: number;  // seconds
}

async function startTranscription(
  audioId: string,
  options: Partial<TranscriptionRequest> = {}
): Promise<TranscriptionResponse> {
  return casedevFetch('/transcription/start', {
    method: 'POST',
    body: JSON.stringify({
      audio_id: audioId,
      speaker_diarization: true,
      punctuation: true,
      timestamps: 'segment',
      vocabulary_boost: legalVocabulary,
      ...options,
    }),
  });
}
```

## Legal Vocabulary Boosting

```typescript
// lib/legal-vocabulary.ts
export const legalVocabulary = [
  // Courtroom
  'objection', 'sustained', 'overruled', 'sidebar',
  'stipulate', 'stipulation', 'voir dire', 'recess',
  
  // Parties
  'plaintiff', 'defendant', 'petitioner', 'respondent',
  'appellant', 'appellee', 'complainant',
  
  // Legal terms
  'habeas corpus', 'pro se', 'pro bono', 'amicus curiae',
  'subpoena', 'deposition', 'affidavit', 'testimony',
  'indictment', 'arraignment', 'bail', 'custody',
  
  // Evidence
  'exhibit', 'hearsay', 'admissible', 'inadmissible',
  'probative', 'prejudicial', 'foundation',
  
  // Verdicts
  'guilty', 'not guilty', 'liable', 'damages',
  'judgment', 'verdict', 'sentence', 'acquittal',
];
```

## Poll Transcription Status

### Response Structure
```typescript
interface TranscriptionStatus {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;  // 0-100
  result?: TranscriptionResult;
  error?: string;
}

interface TranscriptionResult {
  text: string;  // Full transcript
  segments: TranscriptSegment[];
  speakers: string[];  // Detected speaker IDs
  language: string;
  duration: number;
  word_count: number;
  confidence: number;
}

interface TranscriptSegment {
  speaker: string;  // SPEAKER_00, SPEAKER_01, etc.
  text: string;
  start: number;  // seconds
  end: number;  // seconds
  confidence: number;
  words?: WordTimestamp[];  // If timestamps: 'word'
}

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
}
```

### Polling Implementation
```typescript
async function pollTranscriptionStatus(
  jobId: string,
  onProgress?: (progress: number) => void
): Promise<TranscriptionResult> {
  const maxAttempts = 180;  // 30 minutes at 10s intervals
  const interval = 10000;  // 10 seconds
  
  for (let i = 0; i < maxAttempts; i++) {
    const status = await casedevFetch(`/transcription/${jobId}/status`);
    
    if (status.status === 'completed') {
      return status.result;
    }
    
    if (status.status === 'failed') {
      throw new Error(`Transcription failed: ${status.error}`);
    }
    
    if (onProgress && status.progress) {
      onProgress(status.progress);
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('Transcription timeout');
}
```

## Webhook Alternative

Instead of polling, use webhooks for completion notification:

```typescript
// Start with webhook URL
await startTranscription(audioId, {
  webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/transcription`,
});

// Handle webhook
// app/api/webhooks/transcription/route.ts
export async function POST(request: NextRequest) {
  const { job_id, status, result } = await request.json();
  
  if (status === 'completed') {
    await saveTranscript(job_id, result);
  }
  
  return NextResponse.json({ received: true });
}
```

## Save Results to Database

```typescript
async function saveTranscript(
  recordingId: string,
  result: TranscriptionResult
) {
  // Create transcript record
  const [transcript] = await db
    .insert(transcripts)
    .values({
      recordingId,
      language: result.language,
      speakerCount: result.speakers.length,
      wordCount: result.word_count,
      confidence: result.confidence,
    })
    .returning();
  
  // Insert utterances
  const utteranceRows = result.segments.map((seg, idx) => ({
    transcriptId: transcript.id,
    speaker: seg.speaker,
    text: seg.text,
    startTime: seg.start,
    endTime: seg.end,
    confidence: seg.confidence,
    sequenceIndex: idx,
  }));
  
  await db.insert(utterances).values(utteranceRows);
  
  // Update recording status
  await db
    .update(recordings)
    .set({ status: 'transcribed' })
    .where(eq(recordings.id, recordingId));
}
```

## Error Handling

```typescript
class CaseDevError extends Error {
  constructor(
    public response: { message: string; code?: string; status: number }
  ) {
    super(response.message);
    this.name = 'CaseDevError';
  }
}

const ERROR_CODES = {
  INVALID_AUDIO: 'invalid_audio_format',
  AUDIO_TOO_LONG: 'audio_exceeds_duration_limit',
  AUDIO_TOO_LARGE: 'file_size_exceeded',
  RATE_LIMITED: 'rate_limit_exceeded',
  TRANSCRIPTION_FAILED: 'transcription_error',
} as const;
```

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Audio upload | 20 | per minute |
| Start transcription | 10 | per minute |
| Status polling | 60 | per minute |

## Best Practices

1. **Audio quality** - Higher quality audio = better transcription
2. **Vocabulary boost** - Add case-specific names and terms
3. **Handle long files** - Show progress for files over 10 minutes
4. **Retry on transient errors** - Network issues, rate limits
5. **Store audio IDs** - Allows re-transcription without re-upload
