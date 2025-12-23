import { NextRequest, NextResponse } from 'next/server';
import { db, recordings } from '@/lib/db';
import { casedev } from '@/lib/casedev';
import { v4 as uuidv4 } from 'uuid';
import { desc } from 'drizzle-orm';

// App vault ID - in production, this would be stored in env or created on first use
const APP_VAULT_NAME = 'Court Recording Transcriber';

/**
 * GET /api/recordings
 * List all recordings
 */
export async function GET() {
  try {
    const allRecordings = await db.query.recordings.findMany({
      orderBy: [desc(recordings.createdAt)],
    });

    return NextResponse.json({ recordings: allRecordings });
  } catch (error) {
    console.error('Error fetching recordings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recordings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/recordings
 * Create a new recording and get upload URL
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename, fileSizeBytes, caseNumber, courtName, recordingDate } = body;

    if (!filename || !fileSizeBytes) {
      return NextResponse.json(
        { error: 'filename and fileSizeBytes are required' },
        { status: 400 }
      );
    }

    // Get file extension to determine format
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    const contentType = getContentType(extension);

    // Get or create app vault
    let vaultId: string;
    try {
      const vaults = await casedev.listVaults();
      const existingVault = vaults.vaults.find(v => v.name === APP_VAULT_NAME);
      
      if (existingVault) {
        vaultId = existingVault.id;
      } else {
        const newVault = await casedev.createVault({
          name: APP_VAULT_NAME,
          description: 'Storage for court recording transcriptions',
          enableGraph: false,
        });
        vaultId = newVault.id;
      }
    } catch (vaultError) {
      console.error('Vault error:', vaultError);
      const errorMessage = vaultError instanceof Error ? vaultError.message : 'Unknown vault error';
      return NextResponse.json(
        { error: `Failed to access vault: ${errorMessage}` },
        { status: 500 }
      );
    }

    // Get presigned upload URL from Case.dev
    let uploadUrl: string;
    let vaultObjectId: string;

    try {
      const uploadResponse = await casedev.getUploadUrl(vaultId, {
        filename,
        contentType,
        auto_index: false, // We'll trigger manually after conversion
        metadata: {
          case_number: caseNumber,
          court_name: courtName,
          recording_date: recordingDate,
        },
      });
      uploadUrl = uploadResponse.uploadUrl;
      vaultObjectId = uploadResponse.objectId;
    } catch (uploadError) {
      console.error('Upload URL error:', uploadError);
      const errorMessage = uploadError instanceof Error ? uploadError.message : 'Unknown upload error';
      return NextResponse.json(
        { error: `Failed to get upload URL: ${errorMessage}` },
        { status: 500 }
      );
    }

    // Create recording record in database
    const recordingId = uuidv4();
    const now = new Date();

    const [newRecording] = await db.insert(recordings).values({
      id: recordingId,
      filename,
      originalFormat: extension,
      fileSizeBytes,
      vaultId,
      vaultObjectId,
      status: 'uploading',
      caseNumber,
      courtName,
      recordingDate,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return NextResponse.json({
      recording: newRecording,
      uploadUrl,
      vaultObjectId,
    });
  } catch (error) {
    console.error('Error creating recording:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to create recording: ${errorMessage}` },
      { status: 500 }
    );
  }
}

function getContentType(extension: string): string {
  const contentTypes: Record<string, string> = {
    ftr: 'application/octet-stream',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
  };
  return contentTypes[extension] || 'application/octet-stream';
}
