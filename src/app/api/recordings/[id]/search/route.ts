import { NextRequest, NextResponse } from 'next/server';
import { db, recordings, utterances, searchHistory } from '@/lib/db';
import { eq, like, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

/**
 * GET /api/recordings/[id]/search
 * Search within a recording's transcript
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
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

    // Search utterances using LIKE (case-insensitive)
    const searchPattern = `%${query.toLowerCase()}%`;
    
    // Get all utterances for this recording that match
    const allUtterances = await db.query.utterances.findMany({
      where: eq(utterances.recordingId, id),
      orderBy: (utterances, { asc }) => [asc(utterances.sequenceIndex)],
    });

    // Filter by search query (case-insensitive)
    const matchingUtterances = allUtterances.filter(u => 
      u.text.toLowerCase().includes(query.toLowerCase())
    );

    // Save search to history
    await db.insert(searchHistory).values({
      id: uuidv4(),
      recordingId: id,
      query,
      resultCount: matchingUtterances.length,
      createdAt: new Date().toISOString(),
    });

    // Format results with highlighted matches
    const results = matchingUtterances.map(u => ({
      id: u.id,
      speaker: u.speaker,
      speakerLabel: u.speakerLabel,
      text: u.text,
      startMs: u.startMs,
      endMs: u.endMs,
      sequenceIndex: u.sequenceIndex,
      // Add highlight info
      highlights: findHighlights(u.text, query),
    }));

    return NextResponse.json({
      query,
      resultCount: results.length,
      results,
    });
  } catch (error) {
    console.error('Error searching transcript:', error);
    return NextResponse.json(
      { error: 'Failed to search transcript' },
      { status: 500 }
    );
  }
}

/**
 * Find all occurrences of a search term in text
 */
function findHighlights(text: string, query: string): Array<{ start: number; end: number }> {
  const highlights: Array<{ start: number; end: number }> = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  let startIndex = 0;
  while (true) {
    const index = lowerText.indexOf(lowerQuery, startIndex);
    if (index === -1) break;
    
    highlights.push({
      start: index,
      end: index + query.length,
    });
    
    startIndex = index + 1;
  }
  
  return highlights;
}
