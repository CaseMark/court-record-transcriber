import { NextRequest, NextResponse } from 'next/server';
import { db, recordings, transcripts, utterances } from '@/lib/db';
import { getAccuracyAssessment } from '@/lib/legal-vocabulary';
import { eq, sql } from 'drizzle-orm';

/**
 * GET /api/recordings/[id]/accuracy
 * Get detailed accuracy report for a transcription
 */
export async function GET(
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

    // Get transcript
    const transcript = await db.query.transcripts.findFirst({
      where: eq(transcripts.recordingId, id),
    });

    if (!transcript) {
      return NextResponse.json(
        { error: 'Transcript not found - recording may still be processing' },
        { status: 404 }
      );
    }

    // Get utterance statistics
    const utteranceStats = await db
      .select({
        totalUtterances: sql<number>`count(*)`,
        uniqueSpeakers: sql<number>`count(distinct ${utterances.speaker})`,
        avgUtteranceLength: sql<number>`avg(length(${utterances.text}))`,
        totalWords: sql<number>`sum(length(${utterances.text}) - length(replace(${utterances.text}, ' ', '')) + 1)`,
      })
      .from(utterances)
      .where(eq(utterances.recordingId, id));

    const stats = utteranceStats[0] || {
      totalUtterances: 0,
      uniqueSpeakers: 0,
      avgUtteranceLength: 0,
      totalWords: 0,
    };

    // Calculate words per minute if duration is available
    const wordsPerMinute = recording.durationSeconds && stats.totalWords
      ? Math.round((stats.totalWords / recording.durationSeconds) * 60)
      : null;

    // Get accuracy rating
    const confidence = transcript.confidence || 0;
    const accuracyRating = getAccuracyAssessment(confidence);

    // Build accuracy report
    const accuracyReport = {
      recordingId: recording.id,
      filename: recording.filename,
      status: recording.status,
      
      // Core accuracy metrics
      accuracy: {
        confidence: confidence,
        confidencePercent: `${(confidence * 100).toFixed(1)}%`,
        ...accuracyRating,
      },
      
      // Transcript statistics
      statistics: {
        durationSeconds: recording.durationSeconds,
        durationFormatted: recording.durationSeconds
          ? `${Math.floor(recording.durationSeconds / 60)}:${(recording.durationSeconds % 60).toString().padStart(2, '0')}`
          : null,
        totalUtterances: stats.totalUtterances,
        uniqueSpeakers: stats.uniqueSpeakers,
        estimatedWordCount: stats.totalWords,
        wordsPerMinute,
        averageUtteranceLength: Math.round(stats.avgUtteranceLength || 0),
      },
      
      // Content analysis
      content: {
        hasFullText: !!transcript.fullText && transcript.fullText.length > 0,
        textLength: transcript.fullText?.length || 0,
        hasSummary: !!transcript.summary,
        hasChapters: !!transcript.chaptersJson,
        language: transcript.language,
      },
      
      // Metadata
      metadata: {
        caseNumber: recording.caseNumber,
        courtName: recording.courtName,
        recordingDate: recording.recordingDate,
        originalFormat: recording.originalFormat,
        transcribedAt: transcript.createdAt,
      },
      
      // Quality indicators
      qualityIndicators: {
        speakerDiarization: stats.uniqueSpeakers > 1,
        timestampsAvailable: stats.totalUtterances > 0,
        chaptersGenerated: !!transcript.chaptersJson,
        summaryGenerated: !!transcript.summary,
      },
    };

    return NextResponse.json(accuracyReport);
  } catch (error) {
    console.error('Error generating accuracy report:', error);
    return NextResponse.json(
      { error: 'Failed to generate accuracy report' },
      { status: 500 }
    );
  }
}
