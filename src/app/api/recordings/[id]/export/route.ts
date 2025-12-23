import { NextRequest, NextResponse } from 'next/server';
import { db, recordings, transcripts, utterances, speakerLabels } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Header, Footer, PageNumber } from 'docx';
import { jsPDF } from 'jspdf';

// Case.dev brand color
const CASEDEV_ORANGE = '#E65100';
const CASEDEV_ORANGE_RGB = { r: 230, g: 81, b: 0 };

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
    console.error('Error details:', error instanceof Error ? error.stack : String(error));
    return NextResponse.json(
      { error: 'Failed to export transcript', details: error instanceof Error ? error.message : String(error) },
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

  // Title - Professional legal document style
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'OFFICIAL TRANSCRIPT',
          bold: true,
          size: 32,
          font: 'Helvetica',
        }),
      ],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Court Recording Transcription',
          size: 24,
          color: '333333',
          font: 'Helvetica',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // Double line separator (legal style)
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '═'.repeat(70) })],
      spacing: { after: 100 },
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '─'.repeat(70) })],
      spacing: { after: 300 },
    })
  );

  // Recording Information Header
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'RECORDING INFORMATION',
          bold: true,
          size: 22,
          font: 'Helvetica',
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // Metadata section with professional formatting
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'File: ', bold: true, size: 20, font: 'Helvetica' }),
        new TextRun({ text: recording.filename, size: 20, font: 'Helvetica' }),
      ],
      spacing: { after: 80 },
    })
  );

  if (recording.caseNumber) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Case Number: ', bold: true, size: 20, font: 'Helvetica' }),
          new TextRun({ text: recording.caseNumber, size: 20, font: 'Helvetica' }),
        ],
        spacing: { after: 80 },
      })
    );
  }

  if (recording.courtName) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Court: ', bold: true, size: 20, font: 'Helvetica' }),
          new TextRun({ text: recording.courtName, size: 20, font: 'Helvetica' }),
        ],
        spacing: { after: 80 },
      })
    );
  }

  if (recording.recordingDate) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Date: ', bold: true, size: 20, font: 'Helvetica' }),
          new TextRun({ text: recording.recordingDate, size: 20, font: 'Helvetica' }),
        ],
        spacing: { after: 80 },
      })
    );
  }

  if (recording.durationSeconds) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Duration: ', bold: true, size: 20, font: 'Helvetica' }),
          new TextRun({ text: formatDuration(recording.durationSeconds), size: 20, font: 'Helvetica' }),
        ],
        spacing: { after: 80 },
      })
    );
  }

  // Separator
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '─'.repeat(70), color: 'CCCCCC' })],
      spacing: { before: 300, after: 300 },
    })
  );

  // Transcript heading
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'TRANSCRIPT OF PROCEEDINGS',
          bold: true,
          size: 24,
          font: 'Helvetica',
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 },
    })
  );

  // Utterances with line numbers
  let lineNumber = 1;
  for (const utterance of utteranceList) {
    const speakerName = labelMap[utterance.speaker] || utterance.speakerLabel || `Speaker ${utterance.speaker}`;
    const timestamp = formatTimestamp(utterance.startMs);

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${lineNumber.toString().padStart(3, ' ')}  `,
            color: '999999',
            size: 18,
            font: 'Helvetica',
          }),
          new TextRun({
            text: `[${timestamp}] `,
            color: '666666',
            size: 18,
            font: 'Helvetica',
          }),
          new TextRun({
            text: `${speakerName.toUpperCase()}: `,
            bold: true,
            size: 20,
            font: 'Helvetica',
          }),
          new TextRun({
            text: utterance.text,
            size: 20,
            font: 'Helvetica',
          }),
        ],
        spacing: { after: 120 },
      })
    );
    lineNumber++;
  }

  // End of transcript marker
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '─'.repeat(70) })],
      spacing: { before: 400, after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'END OF TRANSCRIPT',
          bold: true,
          size: 20,
          font: 'Helvetica',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  );

  // Footer with certification-style text
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'This transcript was generated using automated speech recognition technology.',
          italics: true,
          size: 16,
          color: '666666',
          font: 'Helvetica',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Document generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
          italics: true,
          size: 16,
          color: '666666',
          font: 'Helvetica',
        }),
      ],
      alignment: AlignmentType.CENTER,
    })
  );

  // Create header with Case.dev watermark
  const header = new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: '◆ ',
            color: 'E65100',
            size: 16,
            font: 'Helvetica',
          }),
          new TextRun({
            text: 'Transcription generated through case.dev',
            color: 'E65100',
            size: 16,
            font: 'Helvetica',
          }),
        ],
      }),
    ],
  });

  // Create footer with page numbers
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'Page ',
            size: 18,
            color: '666666',
            font: 'Helvetica',
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            size: 18,
            color: '666666',
            font: 'Helvetica',
          }),
          new TextRun({
            text: ' of ',
            size: 18,
            color: '666666',
            font: 'Helvetica',
          }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            size: 18,
            color: '666666',
            font: 'Helvetica',
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        headers: {
          default: header,
        },
        footers: {
          default: footer,
        },
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
  const width = 72;

  // Case.dev watermark header
  lines.push('◆ Transcription generated through case.dev');
  lines.push('');
  lines.push('═'.repeat(width));
  lines.push('');

  // Title
  const title = 'OFFICIAL TRANSCRIPT';
  const subtitle = 'Court Recording Transcription';
  lines.push(' '.repeat(Math.floor((width - title.length) / 2)) + title);
  lines.push(' '.repeat(Math.floor((width - subtitle.length) / 2)) + subtitle);
  lines.push('');
  lines.push('═'.repeat(width));
  lines.push('─'.repeat(width));
  lines.push('');

  // Recording Information
  lines.push('RECORDING INFORMATION');
  lines.push('─'.repeat(30));
  lines.push('');
  lines.push(`  File:          ${recording.filename}`);
  
  if (recording.caseNumber) {
    lines.push(`  Case Number:   ${recording.caseNumber}`);
  }
  if (recording.courtName) {
    lines.push(`  Court:         ${recording.courtName}`);
  }
  if (recording.recordingDate) {
    lines.push(`  Date:          ${recording.recordingDate}`);
  }
  if (recording.durationSeconds) {
    lines.push(`  Duration:      ${formatDuration(recording.durationSeconds)}`);
  }

  lines.push('');
  lines.push('─'.repeat(width));
  lines.push('');
  lines.push('TRANSCRIPT OF PROCEEDINGS');
  lines.push('─'.repeat(30));
  lines.push('');

  // Utterances with line numbers
  let lineNumber = 1;
  for (const utterance of utteranceList) {
    const speakerName = labelMap[utterance.speaker] || utterance.speakerLabel || `Speaker ${utterance.speaker}`;
    const timestamp = formatTimestamp(utterance.startMs);
    const lineNum = lineNumber.toString().padStart(3, ' ');
    lines.push(`${lineNum}  [${timestamp}] ${speakerName.toUpperCase()}: ${utterance.text}`);
    lines.push('');
    lineNumber++;
  }

  // End of transcript
  lines.push('─'.repeat(width));
  lines.push('');
  const endText = 'END OF TRANSCRIPT';
  lines.push(' '.repeat(Math.floor((width - endText.length) / 2)) + endText);
  lines.push('');
  lines.push('─'.repeat(width));
  lines.push('');

  // Footer
  lines.push('This transcript was generated using automated speech recognition technology.');
  lines.push(`Document generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`);
  lines.push('');
  lines.push('═'.repeat(width));

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

// Helper function to draw the Case.dev logo on a jsPDF page
function drawCaseDevLogo(doc: jsPDF, x: number, y: number, size: number = 12) {
  // Draw briefcase body (orange rectangle with rounded corners)
  doc.setDrawColor(CASEDEV_ORANGE_RGB.r, CASEDEV_ORANGE_RGB.g, CASEDEV_ORANGE_RGB.b);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y + 2, size, size * 0.7, 1, 1, 'S');
  
  // Draw handle
  doc.roundedRect(x + size * 0.3, y, size * 0.4, 3, 0.5, 0.5, 'S');
  
  // Draw code brackets < >
  doc.setLineWidth(0.4);
  // Left bracket <
  doc.line(x + 3, y + 4, x + 1.5, y + 6);
  doc.line(x + 1.5, y + 6, x + 3, y + 8);
  // Right bracket >
  doc.line(x + size - 3, y + 4, x + size - 1.5, y + 6);
  doc.line(x + size - 1.5, y + 6, x + size - 3, y + 8);
}

// Helper function to draw page header with Case.dev branding
function drawPageHeader(doc: jsPDF, pageNumber: number, totalPages: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Draw Case.dev logo
  drawCaseDevLogo(doc, 15, 8, 12);
  
  // Draw watermark text
  doc.setFontSize(8);
  doc.setTextColor(CASEDEV_ORANGE_RGB.r, CASEDEV_ORANGE_RGB.g, CASEDEV_ORANGE_RGB.b);
  doc.text('Transcription generated through case.dev', 30, 14);
  
  // Draw page number on the right
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 15, 14, { align: 'right' });
  
  // Reset text color
  doc.setTextColor(0, 0, 0);
}

async function generatePDFDocument(
  recording: typeof recordings.$inferSelect,
  utteranceList: Array<typeof utterances.$inferSelect>,
  labelMap: Record<string, string>
): Promise<Buffer> {
  // Create new PDF document (Letter size: 215.9mm x 279.4mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);
  let y = 30; // Start below header area
  
  // We'll add headers after we know total pages
  const pages: number[] = [1];

  // Title - Professional legal document style
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('OFFICIAL TRANSCRIPT', pageWidth / 2, y, { align: 'center' });
  y += 8;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 51, 51);
  doc.text('Court Recording Transcription', pageWidth / 2, y, { align: 'center' });
  y += 12;
  
  // Double line separator (legal style)
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineWidth(0.3);
  doc.line(margin, y + 1.5, pageWidth - margin, y + 1.5);
  y += 10;

  // Recording Information Header
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('RECORDING INFORMATION', margin, y);
  y += 6;

  // Metadata section
  doc.setFontSize(9);
  const labelX = margin;
  const valueX = margin + 30;
  
  doc.setFont('helvetica', 'bold');
  doc.text('File:', labelX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(recording.filename, valueX, y);
  y += 5;

  if (recording.caseNumber) {
    doc.setFont('helvetica', 'bold');
    doc.text('Case Number:', labelX, y);
    doc.setFont('helvetica', 'normal');
    doc.text(recording.caseNumber, valueX, y);
    y += 5;
  }

  if (recording.courtName) {
    doc.setFont('helvetica', 'bold');
    doc.text('Court:', labelX, y);
    doc.setFont('helvetica', 'normal');
    doc.text(recording.courtName, valueX, y);
    y += 5;
  }

  if (recording.recordingDate) {
    doc.setFont('helvetica', 'bold');
    doc.text('Date:', labelX, y);
    doc.setFont('helvetica', 'normal');
    doc.text(recording.recordingDate, valueX, y);
    y += 5;
  }

  if (recording.durationSeconds) {
    doc.setFont('helvetica', 'bold');
    doc.text('Duration:', labelX, y);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDuration(recording.durationSeconds), valueX, y);
    y += 5;
  }

  y += 5;

  // Single line separator
  doc.setDrawColor(204, 204, 204);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Transcript heading
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('TRANSCRIPT OF PROCEEDINGS', margin, y);
  y += 8;

  // Utterances with professional formatting
  doc.setFontSize(9);
  let lineNumber = 1;
  
  for (const utterance of utteranceList) {
    const speakerName = labelMap[utterance.speaker] || utterance.speakerLabel || `Speaker ${utterance.speaker}`;
    const timestamp = formatTimestamp(utterance.startMs);
    
    // Build the text line
    const lineText = `[${timestamp}] ${speakerName.toUpperCase()}: ${utterance.text}`;
    
    // Split text to fit within content width
    const splitText = doc.splitTextToSize(lineText, contentWidth - 15);
    const textHeight = splitText.length * 4;

    // Check if we need a new page (leave room for footer)
    if (y + textHeight > pageHeight - 30) {
      doc.addPage();
      pages.push(pages.length + 1);
      y = 30;
      lineNumber = 1;
    }

    // Line number in margin (legal transcript style)
    doc.setFontSize(8);
    doc.setTextColor(153, 153, 153);
    doc.text(lineNumber.toString().padStart(3, ' '), margin - 8, y);
    
    // Main text
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.text(splitText, margin, y);
    
    y += textHeight + 3;
    lineNumber++;
  }

  // End of transcript marker
  y += 5;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('END OF TRANSCRIPT', pageWidth / 2, y, { align: 'center' });
  y += 8;

  // Footer with certification-style text
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(102, 102, 102);
  doc.text(
    'This transcript was generated using automated speech recognition technology.',
    pageWidth / 2, y, { align: 'center' }
  );
  y += 4;
  doc.text(
    `Document generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
    pageWidth / 2, y, { align: 'center' }
  );

  // Now add headers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawPageHeader(doc, i, totalPages);
  }

  // Convert to buffer
  const pdfOutput = doc.output('arraybuffer');
  return Buffer.from(pdfOutput);
}
