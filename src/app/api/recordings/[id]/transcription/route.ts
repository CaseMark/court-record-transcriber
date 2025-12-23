import { NextRequest, NextResponse } from 'next/server';
import { db, recordings, transcripts, utterances } from '@/lib/db';
import { eq } from 'drizzle-orm';

/**
 * DELETE /api/recordings/[id]/transcription
 * Delete the transcription for a recording (allows re-transcription)
 * This keeps the recording but removes the transcript and utterances
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if recording exists
    const recording = await db.query.recordings.findFirst({
      where: eq(recordings.id, id),
    });

    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      );
    }

    // Check if transcript exists
    const transcript = await db.query.transcripts.findFirst({
      where: eq(transcripts.recordingId, id),
    });

    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcription found for this recording' },
        { status: 404 }
      );
    }

    // Delete utterances first (foreign key constraint)
    await db.delete(utterances).where(eq(utterances.recordingId, id));

    // Delete transcript
    await db.delete(transcripts).where(eq(transcripts.recordingId, id));

    // Reset recording status to allow re-transcription
    await db
      .update(recordings)
      .set({
        status: 'uploading', // Reset to initial state
        transcriptionJobId: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(recordings.id, id));

    console.log('Transcription deleted for recording:', id);

    return NextResponse.json({
      success: true,
      message: 'Transcription deleted. You can now re-transcribe this recording.',
      recordingId: id,
    });
  } catch (error) {
    console.error('Error deleting transcription:', error);
    return NextResponse.json(
      { error: 'Failed to delete transcription' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/recordings/[id]/transcription
 * Get just the transcription data for a recording
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if recording exists
    const recording = await db.query.recordings.findFirst({
      where: eq(recordings.id, id),
    });

    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      );
    }

    // Get transcript
    const transcript = await db.query.transcripts.findFirst({
      where: eq(transcripts.recordingId, id),
    });

    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcription found for this recording' },
        { status: 404 }
      );
    }

    // Get utterances
    const recordingUtterances = await db.query.utterances.findMany({
      where: eq(utterances.recordingId, id),
      orderBy: (utterances, { asc }) => [asc(utterances.sequenceIndex)],
    });

    return NextResponse.json({
      transcript,
      utterances: recordingUtterances,
      stats: {
        utteranceCount: recordingUtterances.length,
        speakerCount: new Set(recordingUtterances.map(u => u.speaker)).size,
        wordCount: transcript.fullText?.split(/\s+/).length || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching transcription:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcription' },
      { status: 500 }
    );
  }
}
