import { NextRequest, NextResponse } from 'next/server';
import { db, recordings, speakerLabels, utterances } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

/**
 * GET /api/recordings/[id]/speakers
 * Get all speaker labels for a recording
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify recording exists
    const recording = await db.query.recordings.findFirst({
      where: eq(recordings.id, id),
    });

    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      );
    }

    // Get all speaker labels
    const labels = await db.query.speakerLabels.findMany({
      where: eq(speakerLabels.recordingId, id),
    });

    // Get unique speakers from utterances
    const recordingUtterances = await db.query.utterances.findMany({
      where: eq(utterances.recordingId, id),
    });

    const uniqueSpeakers = [...new Set(recordingUtterances.map(u => u.speaker))];

    // Create a map of speaker labels
    const labelMap: Record<string, string> = {};
    labels.forEach(l => {
      labelMap[l.speakerId] = l.label;
    });

    // Return speakers with their labels
    const speakers = uniqueSpeakers.map(speaker => ({
      speakerId: speaker,
      label: labelMap[speaker] || null,
      utteranceCount: recordingUtterances.filter(u => u.speaker === speaker).length,
    }));

    return NextResponse.json({ speakers });
  } catch (error) {
    console.error('Error fetching speakers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch speakers' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/recordings/[id]/speakers
 * Update speaker labels for a recording
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { speakers } = body as { speakers: Array<{ speakerId: string; label: string }> };

    if (!speakers || !Array.isArray(speakers)) {
      return NextResponse.json(
        { error: 'speakers array is required' },
        { status: 400 }
      );
    }

    // Verify recording exists
    const recording = await db.query.recordings.findFirst({
      where: eq(recordings.id, id),
    });

    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      );
    }

    const now = new Date();

    // Update or create speaker labels
    for (const { speakerId, label } of speakers) {
      // Check if label exists
      const existing = await db.query.speakerLabels.findFirst({
        where: and(
          eq(speakerLabels.recordingId, id),
          eq(speakerLabels.speakerId, speakerId)
        ),
      });

      if (existing) {
        // Update existing label
        await db
          .update(speakerLabels)
          .set({ label })
          .where(eq(speakerLabels.id, existing.id));
      } else {
        // Create new label
        await db.insert(speakerLabels).values({
          id: uuidv4(),
          recordingId: id,
          speakerId,
          label,
          createdAt: now,
        });
      }

      // Also update utterances with this speaker
      await db
        .update(utterances)
        .set({ speakerLabel: label })
        .where(
          and(
            eq(utterances.recordingId, id),
            eq(utterances.speaker, speakerId)
          )
        );
    }

    // Fetch updated labels
    const updatedLabels = await db.query.speakerLabels.findMany({
      where: eq(speakerLabels.recordingId, id),
    });

    return NextResponse.json({ speakers: updatedLabels });
  } catch (error) {
    console.error('Error updating speakers:', error);
    return NextResponse.json(
      { error: 'Failed to update speakers' },
      { status: 500 }
    );
  }
}
