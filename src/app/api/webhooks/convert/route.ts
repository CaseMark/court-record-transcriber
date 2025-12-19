import { NextRequest, NextResponse } from 'next/server';
import { db, recordings } from '@/lib/db';
import { casedev } from '@/lib/casedev';
import { LEGAL_TRANSCRIPTION_CONFIG } from '@/lib/legal-vocabulary';
import { eq } from 'drizzle-orm';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * POST /api/webhooks/convert
 * Webhook handler for Case.dev Convert API completion
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { job_id, status, output_url, output_urls, metadata, error } = body;

    console.log('Convert webhook received:', { job_id, status });

    // Find recording by convert job ID
    const recording = await db.query.recordings.findFirst({
      where: eq(recordings.convertJobId, job_id),
    });

    if (!recording) {
      console.error('Recording not found for convert job:', job_id);
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    if (status === 'completed') {
      // Get the output URL (use first channel if multi-channel)
      const audioUrl = output_url || (output_urls && output_urls[0]);

      if (!audioUrl) {
        await db
          .update(recordings)
          .set({
            status: 'failed',
            errorMessage: 'Conversion completed but no output URL provided',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(recordings.id, recording.id));

        return NextResponse.json({ received: true, error: 'No output URL' });
      }

      // Update recording with converted file info
      await db
        .update(recordings)
        .set({
          convertedAudioUrl: audioUrl,
          durationSeconds: metadata?.duration_seconds,
          channelCount: metadata?.channels,
          status: 'transcribing',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(recordings.id, recording.id));

      // Trigger transcription with enhanced accuracy settings
      try {
        const transcriptionJob = await casedev.createTranscription({
          audio_url: audioUrl,
          ...LEGAL_TRANSCRIPTION_CONFIG,
          webhook_url: `${APP_URL}/api/webhooks/transcribe`,
        });

        await db
          .update(recordings)
          .set({
            transcriptionJobId: transcriptionJob.id,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(recordings.id, recording.id));

        console.log('Transcription started for recording:', recording.id);
      } catch (transcribeError) {
        console.error('Failed to start transcription:', transcribeError);
        
        await db
          .update(recordings)
          .set({
            status: 'failed',
            errorMessage: `Transcription failed to start: ${transcribeError instanceof Error ? transcribeError.message : 'Unknown error'}`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(recordings.id, recording.id));
      }
    } else if (status === 'failed') {
      await db
        .update(recordings)
        .set({
          status: 'failed',
          errorMessage: error || 'Conversion failed',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(recordings.id, recording.id));
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Convert webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
