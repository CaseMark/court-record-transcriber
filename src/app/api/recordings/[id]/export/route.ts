import { NextRequest, NextResponse } from 'next/server';
import { db, recordings, transcripts, utterances, speakerLabels } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import PDFDocument from 'pdfkit';

/**
 * GET /api/recordings/[id]/export
 * Export transcript to Word document
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'docx';

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
        { error: 'Transcript not found' },
        { status: 404 }
      );
    }

    // Get utterances
    const recordingUtterances = await db.query.utterances.findMany({
      where: eq(utterances.recordingId, id),
      orderBy: (utterances, { asc }) => [asc(utterances.sequenceIndex)],
    });

    // Get speaker labels
    const labels = await db.query.speakerLabels.findMany({
      where: eq(speakerLabels.recordingId, id),
    });

    const labelMap: Record<string, string> = {};
    labels.forEach(l => {
      labelMap[l.speakerId] = l.label;
    });

    if (format === 'docx') {
      const docBuffer = await generateWordDocument(recording, recordingUtterances, labelMap);
      
      return new NextResponse(new Uint8Array(docBuffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${sanitizeFilename(recording.filename)}-transcript.docx"`,
        },
      });
    } else if (format === 'txt') {
      const textContent = generatePlainText(recording, recordingUtterances, labelMap);
      
      return new NextResponse(textContent, {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="${sanitizeFilename(recording.filename)}-transcript.txt"`,
        },
      });
    } else if (format === 'pdf') {
      const pdfBuffer = await generatePDFDocument(recording, recordingUtterances, labelMap);
      
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${sanitizeFilename(recording.filename)}-transcript.pdf"`,
        },
      });
    } else {
      return NextResponse.json(
        { error: 'Unsupported format. Use "docx", "txt", or "pdf"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error exporting transcript:', error);
    return NextResponse.json(
      { error: 'Failed to export transcript' },
      { status: 500 }
    );
  }
}

async function generateWordDocument(
  recording: typeof recordings.$inferSelect,
  utteranceList: Array<typeof utterances.$inferSelect>,
  labelMap: Record<string, string>
): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'COURT RECORDING TRANSCRIPT',
          bold: true,
          size: 32,
        }),
      ],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // Metadata section
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Recording: ', bold: true }),
        new TextRun({ text: recording.filename }),
      ],
      spacing: { after: 100 },
    })
  );

  if (recording.caseNumber) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Case Number: ', bold: true }),
          new TextRun({ text: recording.caseNumber }),
        ],
        spacing: { after: 100 },
      })
    );
  }

  if (recording.courtName) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Court: ', bold: true }),
          new TextRun({ text: recording.courtName }),
        ],
        spacing: { after: 100 },
      })
    );
  }

  if (recording.recordingDate) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Date: ', bold: true }),
          new TextRun({ text: recording.recordingDate }),
        ],
        spacing: { after: 100 },
      })
    );
  }

  if (recording.durationSeconds) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Duration: ', bold: true }),
          new TextRun({ text: formatDuration(recording.durationSeconds) }),
        ],
        spacing: { after: 100 },
      })
    );
  }

  // Separator
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '─'.repeat(50) })],
      spacing: { before: 200, after: 200 },
    })
  );

  // Transcript heading
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'TRANSCRIPT',
          bold: true,
          size: 28,
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 },
    })
  );

  // Utterances
  for (const utterance of utteranceList) {
    const speakerName = labelMap[utterance.speaker] || utterance.speakerLabel || `Speaker ${utterance.speaker}`;
    const timestamp = formatTimestamp(utterance.startMs);

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `[${timestamp}] `,
            color: '666666',
            size: 20,
          }),
          new TextRun({
            text: `${speakerName}: `,
            bold: true,
          }),
          new TextRun({
            text: utterance.text,
          }),
        ],
        spacing: { after: 150 },
      })
    );
  }

  // Footer
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '─'.repeat(50) })],
      spacing: { before: 400, after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated by Court Recording Transcriber on ${new Date().toLocaleDateString()}`,
          italics: true,
          size: 18,
          color: '888888',
        }),
      ],
      alignment: AlignmentType.CENTER,
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

function generatePlainText(
  recording: typeof recordings.$inferSelect,
  utteranceList: Array<typeof utterances.$inferSelect>,
  labelMap: Record<string, string>
): string {
  const lines: string[] = [];

  lines.push('COURT RECORDING TRANSCRIPT');
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Recording: ${recording.filename}`);
  
  if (recording.caseNumber) {
    lines.push(`Case Number: ${recording.caseNumber}`);
  }
  if (recording.courtName) {
    lines.push(`Court: ${recording.courtName}`);
  }
  if (recording.recordingDate) {
    lines.push(`Date: ${recording.recordingDate}`);
  }
  if (recording.durationSeconds) {
    lines.push(`Duration: ${formatDuration(recording.durationSeconds)}`);
  }

  lines.push('');
  lines.push('-'.repeat(50));
  lines.push('TRANSCRIPT');
  lines.push('-'.repeat(50));
  lines.push('');

  for (const utterance of utteranceList) {
    const speakerName = labelMap[utterance.speaker] || utterance.speakerLabel || `Speaker ${utterance.speaker}`;
    const timestamp = formatTimestamp(utterance.startMs);
    lines.push(`[${timestamp}] ${speakerName}: ${utterance.text}`);
    lines.push('');
  }

  lines.push('-'.repeat(50));
  lines.push(`Generated by Court Recording Transcriber on ${new Date().toLocaleDateString()}`);

  return lines.join('\n');
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\.[^.]+$/, '');
}

async function generatePDFDocument(
  recording: typeof recordings.$inferSelect,
  utteranceList: Array<typeof utterances.$inferSelect>,
  labelMap: Record<string, string>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('COURT RECORDING TRANSCRIPT', { align: 'center' });
    
    doc.moveDown(1.5);

    // Metadata section
    doc.fontSize(11).font('Helvetica');
    
    doc.font('Helvetica-Bold').text('Recording: ', { continued: true });
    doc.font('Helvetica').text(recording.filename);

    if (recording.caseNumber) {
      doc.font('Helvetica-Bold').text('Case Number: ', { continued: true });
      doc.font('Helvetica').text(recording.caseNumber);
    }

    if (recording.courtName) {
      doc.font('Helvetica-Bold').text('Court: ', { continued: true });
      doc.font('Helvetica').text(recording.courtName);
    }

    if (recording.recordingDate) {
      doc.font('Helvetica-Bold').text('Date: ', { continued: true });
      doc.font('Helvetica').text(recording.recordingDate);
    }

    if (recording.durationSeconds) {
      doc.font('Helvetica-Bold').text('Duration: ', { continued: true });
      doc.font('Helvetica').text(formatDuration(recording.durationSeconds));
    }

    doc.moveDown(1);

    // Separator line
    doc
      .strokeColor('#cccccc')
      .lineWidth(1)
      .moveTo(72, doc.y)
      .lineTo(540, doc.y)
      .stroke();

    doc.moveDown(1);

    // Transcript heading
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('TRANSCRIPT');
    
    doc.moveDown(0.5);

    // Utterances
    doc.fontSize(10).font('Helvetica');
    
    for (const utterance of utteranceList) {
      const speakerName = labelMap[utterance.speaker] || utterance.speakerLabel || `Speaker ${utterance.speaker}`;
      const timestamp = formatTimestamp(utterance.startMs);

      // Check if we need a new page
      if (doc.y > 680) {
        doc.addPage();
      }

      doc
        .fillColor('#666666')
        .text(`[${timestamp}] `, { continued: true });
      
      doc
        .fillColor('#000000')
        .font('Helvetica-Bold')
        .text(`${speakerName}: `, { continued: true });
      
      doc
        .font('Helvetica')
        .text(utterance.text);
      
      doc.moveDown(0.5);
    }

    // Footer
    doc.moveDown(1);
    doc
      .strokeColor('#cccccc')
      .lineWidth(1)
      .moveTo(72, doc.y)
      .lineTo(540, doc.y)
      .stroke();

    doc.moveDown(0.5);
    doc
      .fontSize(9)
      .fillColor('#888888')
      .font('Helvetica-Oblique')
      .text(
        `Generated by Court Recording Transcriber on ${new Date().toLocaleDateString()}`,
        { align: 'center' }
      );

    doc.end();
  });
}
