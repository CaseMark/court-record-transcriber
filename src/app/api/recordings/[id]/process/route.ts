import { NextRequest, NextResponse } from 'next/server';
import { db, recordings, transcripts, utterances } from '@/lib/db';
import { casedev } from '@/lib/casedev';
import { LEGAL_TRANSCRIPTION_CONFIG } from '@/lib/legal-vocabulary';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * POST /api/recordings/[id]/process
 * Trigger conversion (if FTR) and transcription pipeline
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get recording
    const recording = await db.query.recordings.findFirst({
      where: eq(recordings.id, id),
    });

    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      );
    }

    if (!recording.vaultId || !recording.vaultObjectId) {
      return NextResponse.json(
        { error: 'Recording not uploaded to vault yet' },
        { status: 400 }
      );
    }

    const isFTR = recording.originalFormat.toLowerCase() === 'ftr';

    if (isFTR) {
      // Step 1: Convert FTR to M4A
      try {
        // Get the source URL from vault
        const objectInfo = await casedev.getObject(
          recording.vaultId,
          recording.vaultObjectId
        );

        const convertJob = await casedev.convertFTR(
          objectInfo.downloadUrl,
          `${APP_URL}/api/webhooks/convert`,
          { output_format: 'm4a', preserve_channels: false }
        );

        // Update recording with convert job ID
        await db
          .update(recordings)
          .set({
            convertJobId: convertJob.id,
            status: 'converting',
            updatedAt: new Date(),
          })
          .where(eq(recordings.id, id));

        return NextResponse.json({
          success: true,
          status: 'converting',
          convertJobId: convertJob.id,
          message: 'FTR conversion started. Transcription will begin after conversion.',
        });
      } catch (convertError) {
        console.error('Convert error:', convertError);
        
        // Update status to failed
        await db
          .update(recordings)
          .set({
            status: 'failed',
            errorMessage: `Conversion failed: ${convertError instanceof Error ? convertError.message : 'Unknown error'}`,
            updatedAt: new Date(),
          })
          .where(eq(recordings.id, id));

        return NextResponse.json(
          { error: 'Failed to start conversion' },
          { status: 500 }
        );
      }
    } else {
      // Non-FTR file - go directly to transcription
      try {
        const objectInfo = await casedev.getObject(
          recording.vaultId,
          recording.vaultObjectId
        );

        const transcriptionJob = await casedev.createTranscription({
          audio_url: objectInfo.downloadUrl,
          ...LEGAL_TRANSCRIPTION_CONFIG,
          webhook_url: `${APP_URL}/api/webhooks/transcribe`,
        });

        // Update recording with transcription job ID
        await db
          .update(recordings)
          .set({
            transcriptionJobId: transcriptionJob.id,
            convertedAudioUrl: objectInfo.downloadUrl,
            status: 'transcribing',
            updatedAt: new Date(),
          })
          .where(eq(recordings.id, id));

        return NextResponse.json({
          success: true,
          status: 'transcribing',
          transcriptionJobId: transcriptionJob.id,
          message: 'Transcription started.',
        });
      } catch (transcribeError) {
        console.error('Transcription error:', transcribeError);
        
        await db
          .update(recordings)
          .set({
            status: 'failed',
            errorMessage: `Transcription failed: ${transcribeError instanceof Error ? transcribeError.message : 'Unknown error'}`,
            updatedAt: new Date(),
          })
          .where(eq(recordings.id, id));

        return NextResponse.json(
          { error: 'Failed to start transcription' },
          { status: 500 }
        );
      }
    }
  } catch (error) {
    console.error('Error processing recording:', error);
    return NextResponse.json(
      { error: 'Failed to process recording' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/recordings/[id]/process
 * Check processing status and sync results if completed
 * This handles the case where webhooks can't reach localhost
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const recording = await db.query.recordings.findFirst({
      where: eq(recordings.id, id),
    });

    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      );
    }

    // If we have job IDs, check their status
    let convertStatus = null;
    let transcriptionStatus = null;
    let synced = false;

    if (recording.convertJobId) {
      try {
        const convertJob = await casedev.getConvertJob(recording.convertJobId);
        convertStatus = {
          id: convertJob.id,
          status: convertJob.status,
          metadata: convertJob.metadata,
        };
      } catch (e) {
        console.error('Error fetching convert job:', e);
      }
    }

    if (recording.transcriptionJobId) {
      try {
        const transcriptionJob = await casedev.getTranscription(recording.transcriptionJobId);
        transcriptionStatus = {
          id: transcriptionJob.id,
          status: transcriptionJob.status,
          confidence: transcriptionJob.confidence,
        };

        // If transcription is completed but recording status is still 'transcribing',
        // sync the results (handles localhost webhook issue)
        if (transcriptionJob.status === 'completed' && recording.status === 'transcribing') {
          console.log('Syncing completed transcription results for recording:', recording.id);
          
          const now = new Date();

          // Check if transcript already exists
          const existingTranscript = await db.query.transcripts.findFirst({
            where: eq(transcripts.recordingId, recording.id),
          });

          if (!existingTranscript) {
            // Create transcript record
            const transcriptId = uuidv4();
            await db.insert(transcripts).values({
              id: transcriptId,
              recordingId: recording.id,
              fullText: transcriptionJob.text || '',
              confidence: transcriptionJob.confidence,
              language: 'en',
              summary: transcriptionJob.summary || null,
              chaptersJson: transcriptionJob.chapters ? JSON.stringify(transcriptionJob.chapters) : null,
              createdAt: now,
            });

            // Create utterance records
            if (transcriptionJob.utterances && transcriptionJob.utterances.length > 0) {
              const utteranceRecords = transcriptionJob.utterances.map(
                (u, index) => ({
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

            synced = true;
          }

          // Update recording status
          // Calculate duration from audio_duration or from utterances
          let durationInSeconds: number | null = null;
          
          // Try audio_duration first - it could be in seconds or milliseconds
          if (transcriptionJob.audio_duration) {
            // If value is > 10000, it's likely in milliseconds
            if (transcriptionJob.audio_duration > 10000) {
              durationInSeconds = Math.round(transcriptionJob.audio_duration / 1000);
            } else {
              // Otherwise assume it's already in seconds
              durationInSeconds = Math.round(transcriptionJob.audio_duration);
            }
          }
          
          // Fallback: calculate from last utterance end time
          if (!durationInSeconds && transcriptionJob.utterances && transcriptionJob.utterances.length > 0) {
            const lastUtterance = transcriptionJob.utterances[transcriptionJob.utterances.length - 1];
            // Utterance end times are in milliseconds
            durationInSeconds = Math.round(lastUtterance.end / 1000);
          }
          
          await db
            .update(recordings)
            .set({
              status: 'completed',
              // Only update duration if we got a valid value > 0
              durationSeconds: (durationInSeconds && durationInSeconds > 0) 
                ? durationInSeconds 
                : recording.durationSeconds,
              updatedAt: now,
            })
            .where(eq(recordings.id, recording.id));

          console.log('Transcription results synced for recording:', recording.id);
        }
      } catch (e) {
        console.error('Error fetching transcription job:', e);
      }
    }

    return NextResponse.json({
      recording: {
        id: recording.id,
        status: synced ? 'completed' : recording.status,
        errorMessage: recording.errorMessage,
      },
      convertStatus,
      transcriptionStatus,
      synced,
    });
  } catch (error) {
    console.error('Error checking status:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
