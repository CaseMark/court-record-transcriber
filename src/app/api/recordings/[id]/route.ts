import { NextRequest, NextResponse } from 'next/server';
import { db, recordings, transcripts, utterances, speakerLabels } from '@/lib/db';
import { casedev } from '@/lib/casedev';
import { eq } from 'drizzle-orm';

/**
 * GET /api/recordings/[id]
 * Get a single recording with its transcript and utterances
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

    // Fetch fresh download URL from vault (presigned URLs expire after 1 hour)
    let freshAudioUrl = recording.convertedAudioUrl;
    if (recording.vaultId && recording.vaultObjectId) {
      try {
        const objectInfo = await casedev.getObject(
          recording.vaultId,
          recording.vaultObjectId
        );
        freshAudioUrl = objectInfo.downloadUrl;
      } catch (e) {
        console.error('Failed to get fresh audio URL:', e);
        // Fall back to stored URL (may be expired)
      }
    }

    // Get transcript if exists
    const transcript = await db.query.transcripts.findFirst({
      where: eq(transcripts.recordingId, id),
    });

    // Get utterances if transcript exists
    let recordingUtterances: typeof utterances.$inferSelect[] = [];
    if (transcript) {
      recordingUtterances = await db.query.utterances.findMany({
        where: eq(utterances.recordingId, id),
        orderBy: (utterances, { asc }) => [asc(utterances.sequenceIndex)],
      });
    }

    // Get speaker labels
    const labels = await db.query.speakerLabels.findMany({
      where: eq(speakerLabels.recordingId, id),
    });

    // Create a map of speaker labels
    const speakerLabelMap: Record<string, string> = {};
    labels.forEach(label => {
      speakerLabelMap[label.speakerId] = label.label;
    });

    // Apply speaker labels to utterances
    const utterancesWithLabels = recordingUtterances.map(u => ({
      ...u,
      speakerLabel: speakerLabelMap[u.speaker] || u.speakerLabel,
    }));

    return NextResponse.json({
      recording: {
        ...recording,
        convertedAudioUrl: freshAudioUrl, // Use fresh URL instead of stored (expired) one
      },
      transcript,
      utterances: utterancesWithLabels,
      speakerLabels: labels,
    });
  } catch (error) {
    console.error('Error fetching recording:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recording' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/recordings/[id]
 * Delete a recording and all associated data
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

    // Delete recording (cascades to transcripts, utterances, speaker labels)
    await db.delete(recordings).where(eq(recordings.id, id));

    // TODO: Also delete from Case.dev vault if needed

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting recording:', error);
    return NextResponse.json(
      { error: 'Failed to delete recording' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/recordings/[id]
 * Update recording metadata
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { caseNumber, courtName, recordingDate, status } = body;

    const recording = await db.query.recordings.findFirst({
      where: eq(recordings.id, id),
    });

    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      );
    }

    const updateData: Partial<typeof recordings.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (caseNumber !== undefined) updateData.caseNumber = caseNumber;
    if (courtName !== undefined) updateData.courtName = courtName;
    if (recordingDate !== undefined) updateData.recordingDate = recordingDate;
    if (status !== undefined) updateData.status = status;

    const [updated] = await db
      .update(recordings)
      .set(updateData)
      .where(eq(recordings.id, id))
      .returning();

    return NextResponse.json({ recording: updated });
  } catch (error) {
    console.error('Error updating recording:', error);
    return NextResponse.json(
      { error: 'Failed to update recording' },
      { status: 500 }
    );
  }
}
