import { NextRequest, NextResponse } from 'next/server';
import { db, recordings, transcripts, utterances } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/webhooks/transcribe
 * Webhook handler for Case.dev Voice API transcription completion
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id: jobId,
      status,
      text,
      utterances: transcriptUtterances,
      chapters,
      confidence,
      audio_duration,
      summary, // AI-generated summary when summarization is enabled
      error,
    } = body;

    console.log('Transcription webhook received:', { jobId, status });

    // Find recording by transcription job ID
    const recording = await db.query.recordings.findFirst({
      where: eq(recordings.transcriptionJobId, jobId),
    });

    if (!recording) {
      console.error('Recording not found for transcription job:', jobId);
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    if (status === 'completed') {
      const now = new Date();

      // Create transcript record with summary and confidence
      const transcriptId = uuidv4();
      await db.insert(transcripts).values({
        id: transcriptId,
        recordingId: recording.id,
        fullText: text || '',
        confidence: confidence,
        language: 'en',
        summary: summary || null, // Store AI-generated summary
        chaptersJson: chapters ? JSON.stringify(chapters) : null,
        createdAt: now,
      });

      // Log accuracy metrics for monitoring
      console.log('Transcription accuracy metrics:', {
        recordingId: recording.id,
        confidence: confidence,
        confidencePercent: confidence ? `${(confidence * 100).toFixed(1)}%` : 'N/A',
        utteranceCount: transcriptUtterances?.length || 0,
        hasSummary: !!summary,
        hasChapters: !!chapters,
      });

      // Create utterance records
      if (transcriptUtterances && transcriptUtterances.length > 0) {
        const utteranceRecords = transcriptUtterances.map(
          (u: { speaker: string; text: string; start: number; end: number }, index: number) => ({
            id: uuidv4(),
            transcriptId,
            recordingId: recording.id,
            speaker: u.speaker,
            text: u.text,
            startMs: u.start,
            endMs: u.end,
            sequenceIndex: index,
          })
        );

        // Insert in batches to avoid SQLite limits
        const batchSize = 100;
        for (let i = 0; i < utteranceRecords.length; i += batchSize) {
          const batch = utteranceRecords.slice(i, i + batchSize);
          await db.insert(utterances).values(batch);
        }
      }

      // Calculate duration from audio_duration or from utterances
      let durationInSeconds: number | null = null;
      
      // Try audio_duration first - it could be in seconds or milliseconds
      if (audio_duration) {
        // If value is > 10000, it's likely in milliseconds
        if (audio_duration > 10000) {
          durationInSeconds = Math.round(audio_duration / 1000);
        } else {
          // Otherwise assume it's already in seconds
          durationInSeconds = Math.round(audio_duration);
        }
      }
      
      // Fallback: calculate from last utterance end time
      if (!durationInSeconds && transcriptUtterances && transcriptUtterances.length > 0) {
        const lastUtterance = transcriptUtterances[transcriptUtterances.length - 1];
        // Utterance end times are in milliseconds
        durationInSeconds = Math.round(lastUtterance.end / 1000);
      }

      // Update recording status
      await db
        .update(recordings)
        .set({
          status: 'completed',
          durationSeconds: (durationInSeconds && durationInSeconds > 0) 
            ? durationInSeconds 
            : recording.durationSeconds,
          updatedAt: now,
        })
        .where(eq(recordings.id, recording.id));

      console.log('Transcription completed for recording:', recording.id);
    } else if (status === 'error') {
      await db
        .update(recordings)
        .set({
          status: 'failed',
          errorMessage: error || 'Transcription failed',
          updatedAt: new Date(),
        })
        .where(eq(recordings.id, recording.id));
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Transcription webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
