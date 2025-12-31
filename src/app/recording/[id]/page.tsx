'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect, use, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Search, 
  Download, 
  FileText,
  Clock,
  User,
  ChevronLeft,
  Volume2,
  Edit,
  FileDown,
  X,
  UserPlus,
  Users,
  MoreVertical,
  Undo2,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';

interface Utterance {
  id: string;
  speaker: string;
  speakerLabel: string | null;
  text: string;
  startMs: number;
  endMs: number;
  sequenceIndex: number;
}

interface Recording {
  id: string;
  filename: string;
  originalFormat: string;
  fileSizeBytes: number;
  durationSeconds: number | null;
  status: string;
  caseNumber: string | null;
  courtName: string | null;
  recordingDate: string | null;
  convertedAudioUrl: string | null;
  createdAt: string;
}

interface RecordingData {
  recording: Recording;
  transcript: {
    id: string;
    fullText: string;
    confidence: number | null;
  } | null;
  utterances: Utterance[];
  speakerLabels: Array<{ speakerId: string; label: string }>;
}

interface SearchResult {
  id: string;
  speaker: string;
  speakerLabel: string | null;
  text: string;
  startMs: number;
  endMs: number;
  sequenceIndex: number;
  highlights: Array<{ start: number; end: number }>;
}

// Text segment with speaker attribution (for partial text changes)
interface TextSegment {
  text: string;
  speaker: string;
  speakerLabel: string | null;
  startCharIndex: number;
  endCharIndex: number;
}

// Edit that tracks text splits within an utterance
interface UtteranceEdit {
  utteranceId: string;
  segments: TextSegment[];
  deletedSegmentIndices?: number[]; // Track which segments have been deleted
}

// Selection state for text highlighting
interface TextSelection {
  utteranceId: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  position: { x: number; y: number };
}

async function fetchRecording(id: string): Promise<RecordingData> {
  const response = await fetch(`/api/recordings/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch recording');
  }
  return response.json();
}

async function searchTranscript(id: string, query: string): Promise<{ results: SearchResult[] }> {
  const response = await fetch(`/api/recordings/${id}/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error('Search failed');
  }
  return response.json();
}

async function updateSpeakerLabel(recordingId: string, speakerId: string, label: string) {
  const response = await fetch(`/api/recordings/${recordingId}/speakers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ speakerId, label }),
  });
  if (!response.ok) {
    throw new Error('Failed to update speaker label');
  }
  return response.json();
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

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
}

// Speaker colors for visual distinction
const SPEAKER_COLORS = [
  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
];

// Speaker Label Dialog
function SpeakerLabelDialog({ 
  speaker, 
  currentLabel, 
  recordingId,
  onUpdate,
}: { 
  speaker: string; 
  currentLabel: string;
  recordingId: string;
  onUpdate: () => void;
}) {
  const [label, setLabel] = useState(currentLabel);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => updateSpeakerLabel(recordingId, speaker, label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recording', recordingId] });
      toast.success('Speaker label updated');
      setOpen(false);
      onUpdate();
    },
    onError: () => {
      toast.error('Failed to update speaker label');
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-1">
          <Edit className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Speaker Label</DialogTitle>
          <DialogDescription>
            Assign a name to Speaker {speaker} (e.g., &quot;Judge Smith&quot;, &quot;Defense Attorney&quot;)
          </DialogDescription>
        </DialogHeader>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Enter speaker name..."
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Change Entire Segment Speaker Dialog (for header button)
function ChangeSegmentSpeakerDialog({
  utterance,
  existingSpeakers,
  speakerLabels,
  onChangeSpeaker,
  getSpeakerLabel,
  speakerColorMap,
}: {
  utterance: Utterance;
  existingSpeakers: string[];
  speakerLabels: Array<{ speakerId: string; label: string }>;
  onChangeSpeaker: (newSpeaker: string, newLabel: string | null) => void;
  getSpeakerLabel: (speaker: string, label: string | null) => string;
  speakerColorMap: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const handleSelectExisting = (speaker: string) => {
    const label = speakerLabels.find(l => l.speakerId === speaker)?.label || null;
    onChangeSpeaker(speaker, label);
    setOpen(false);
    toast.success('Segment speaker changed');
  };

  const handleCreateNew = () => {
    if (!newSpeakerName.trim()) {
      toast.error('Please enter a speaker name');
      return;
    }
    const newSpeakerId = `new_${Date.now()}`;
    onChangeSpeaker(newSpeakerId, newSpeakerName.trim());
    setOpen(false);
    setNewSpeakerName('');
    setIsCreatingNew(false);
    toast.success('Segment assigned to new speaker');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-1" title="Change entire segment speaker">
          <Users className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Segment Speaker</DialogTitle>
          <DialogDescription>
            Reassign this entire segment to a different speaker.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Current speaker */}
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Current speaker:</p>
            <Badge className={speakerColorMap[utterance.speaker] || SPEAKER_COLORS[0]}>
              <User className="h-3 w-3 mr-1" />
              {getSpeakerLabel(utterance.speaker, utterance.speakerLabel)}
            </Badge>
          </div>

          {/* Existing speakers */}
          {!isCreatingNew && (
            <div>
              <p className="text-sm font-medium mb-2">Select speaker:</p>
              <div className="flex flex-wrap gap-2">
                {existingSpeakers
                  .filter(s => s !== utterance.speaker)
                  .map(speaker => (
                    <Button
                      key={speaker}
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectExisting(speaker)}
                      className="gap-1"
                    >
                      <Badge variant="secondary" className={speakerColorMap[speaker] || SPEAKER_COLORS[0]}>
                        <User className="h-3 w-3 mr-1" />
                        {getSpeakerLabel(speaker, speakerLabels.find(l => l.speakerId === speaker)?.label || null)}
                      </Badge>
                    </Button>
                  ))}
              </div>
            </div>
          )}

          {/* Create new speaker */}
          <div className="border-t pt-4">
            {!isCreatingNew ? (
              <Button
                variant="outline"
                onClick={() => setIsCreatingNew(true)}
                className="w-full gap-2"
              >
                <UserPlus className="h-4 w-4" />
                Create New Speaker
              </Button>
            ) : (
              <div className="space-y-2">
                <Input
                  value={newSpeakerName}
                  onChange={(e) => setNewSpeakerName(e.target.value)}
                  placeholder="Enter new speaker name..."
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsCreatingNew(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button onClick={handleCreateNew} className="flex-1">
                    Create & Assign
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Floating Selection Popover for changing speaker attribution of highlighted text
function SelectionPopover({
  selection,
  existingSpeakers,
  speakerLabels,
  onChangeSpeaker,
  onClose,
  getSpeakerLabel,
  speakerColorMap,
  currentSpeaker,
}: {
  selection: TextSelection;
  existingSpeakers: string[];
  speakerLabels: Array<{ speakerId: string; label: string }>;
  onChangeSpeaker: (newSpeaker: string, newLabel: string | null) => void;
  onClose: () => void;
  getSpeakerLabel: (speaker: string, label: string | null) => string;
  speakerColorMap: Record<string, string>;
  currentSpeaker: string;
}) {
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleSelectExisting = (speaker: string) => {
    const label = speakerLabels.find(l => l.speakerId === speaker)?.label || null;
    onChangeSpeaker(speaker, label);
    onClose();
    toast.success('Speaker attribution changed for selected text');
  };

  const handleCreateNew = () => {
    if (!newSpeakerName.trim()) {
      toast.error('Please enter a speaker name');
      return;
    }
    const newSpeakerId = `new_${Date.now()}`;
    onChangeSpeaker(newSpeakerId, newSpeakerName.trim());
    onClose();
    toast.success('Selected text assigned to new speaker');
  };

  // Calculate position - ensure it stays within viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(Math.max(10, selection.position.x), window.innerWidth - 320),
    top: Math.min(selection.position.y + 10, window.innerHeight - 300),
    zIndex: 100,
  };

  return (
    <div
      ref={popoverRef}
      style={style}
      className="bg-background border rounded-lg shadow-xl p-3 w-[300px] animate-in fade-in-0 zoom-in-95"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Change Speaker</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Selected text preview */}
      <div className="bg-muted/50 rounded p-2 mb-3 text-xs text-muted-foreground max-h-16 overflow-hidden">
        &quot;{selection.selectedText.length > 80 
          ? selection.selectedText.substring(0, 80) + '...' 
          : selection.selectedText}&quot;
      </div>

      {!isCreatingNew ? (
        <>
          {/* Existing speakers */}
          <div className="space-y-1 mb-3">
            <p className="text-xs text-muted-foreground mb-1">Assign selected text to:</p>
            <div className="flex flex-wrap gap-1">
              {existingSpeakers.map(speaker => (
                <Button
                  key={speaker}
                  variant={speaker === currentSpeaker ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => handleSelectExisting(speaker)}
                  className="h-7 text-xs gap-1"
                  disabled={speaker === currentSpeaker}
                >
                  <div className={`w-2 h-2 rounded-full ${speakerColorMap[speaker]?.split(' ')[0] || 'bg-gray-400'}`} />
                  {getSpeakerLabel(speaker, speakerLabels.find(l => l.speakerId === speaker)?.label || null)}
                </Button>
              ))}
            </div>
          </div>

          {/* Create new speaker button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCreatingNew(true)}
            className="w-full h-7 text-xs gap-1"
          >
            <UserPlus className="h-3 w-3" />
            New Speaker
          </Button>
        </>
      ) : (
        <div className="space-y-2">
          <Input
            value={newSpeakerName}
            onChange={(e) => setNewSpeakerName(e.target.value)}
            placeholder="Enter speaker name..."
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateNew();
              }
            }}
          />
          <div className="flex gap-1">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsCreatingNew(false)}
              className="flex-1 h-7 text-xs"
            >
              Cancel
            </Button>
            <Button 
              size="sm" 
              onClick={handleCreateNew}
              className="flex-1 h-7 text-xs"
            >
              Create
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Segmented text display component - shows text with different speaker attributions
function SegmentedText({
  segments,
  utteranceStartMs,
  utteranceEndMs,
  currentTimeMs,
  isActive,
  searchHighlights,
  speakerColorMap,
  getSpeakerLabel,
}: {
  segments: TextSegment[];
  utteranceStartMs: number;
  utteranceEndMs: number;
  currentTimeMs: number;
  isActive: boolean;
  searchHighlights?: Array<{ start: number; end: number }>;
  speakerColorMap: Record<string, string>;
  getSpeakerLabel: (speaker: string, label: string | null) => string;
}) {
  const utteranceDuration = utteranceEndMs - utteranceStartMs;
  const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0);
  
  const progress = isActive 
    ? Math.min(1, Math.max(0, (currentTimeMs - utteranceStartMs) / utteranceDuration))
    : 0;
  
  const currentCharIndex = Math.floor(progress * totalChars);
  
  return (
    <>
      {segments.map((segment, segIndex) => {
        const isFirstSegment = segIndex === 0;
        const segmentColor = speakerColorMap[segment.speaker]?.split(' ')[0] || 'bg-gray-200';
        
        // Split segment text into words for highlighting
        const words = segment.text.split(/(\s+)/);
        let charCount = segment.startCharIndex;
        
        return (
          <span key={segIndex} className="relative">
            {/* Show speaker badge for non-first segments */}
            {!isFirstSegment && (
              <Badge 
                variant="outline" 
                className={`inline-flex items-center mx-1 text-[10px] py-0 px-1 ${segmentColor} border-0`}
              >
                {getSpeakerLabel(segment.speaker, segment.speakerLabel)}
              </Badge>
            )}
            {words.map((word, wordIndex) => {
              const wordStart = charCount;
              const wordEnd = charCount + word.length;
              charCount = wordEnd;
              
              const isCurrentWord = isActive && wordStart <= currentCharIndex && currentCharIndex < wordEnd;
              const hasBeenSpoken = isActive && wordEnd <= currentCharIndex;
              
              let isSearchHighlighted = false;
              if (searchHighlights) {
                isSearchHighlighted = searchHighlights.some(
                  h => (wordStart >= h.start && wordStart < h.end) || 
                       (wordEnd > h.start && wordEnd <= h.end) ||
                       (wordStart <= h.start && wordEnd >= h.end)
                );
              }
              
              if (word.trim() === '') {
                return <span key={wordIndex}>{word}</span>;
              }
              
              return (
                <span
                  key={wordIndex}
                  className={`
                    transition-all duration-100
                    ${!isFirstSegment ? `border-b-2 ${segmentColor.replace('bg-', 'border-')}` : ''}
                    ${isCurrentWord ? 'bg-yellow-300 dark:bg-yellow-600 px-0.5 rounded font-medium' : ''}
                    ${hasBeenSpoken && !isCurrentWord ? 'text-foreground' : ''}
                    ${!hasBeenSpoken && !isCurrentWord && isActive ? 'text-muted-foreground' : ''}
                    ${isSearchHighlighted ? 'bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded' : ''}
                  `}
                >
                  {word}
                </span>
              );
            })}
          </span>
        );
      })}
    </>
  );
}

// Constants for document preview pagination
const LINES_PER_PAGE = 25; // Standard legal transcript has ~25 lines per page
const CHARS_PER_LINE = 65; // Approximate characters that fit on a line

// Helper to split text into lines for proper line numbering
function splitTextIntoLines(text: string, charsPerLine: number = CHARS_PER_LINE): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= charsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  return lines;
}

// Process segments into lines with proper numbering
interface DocumentLine {
  lineNumber: number;
  type: 'header' | 'metadata' | 'content' | 'separator' | 'footer';
  speaker?: string;
  speakerLabel?: string | null;
  timestamp?: string;
  text: string;
  isContinuation?: boolean;
}

function processSegmentsIntoLines(
  segments: Array<{
    speaker: string;
    speakerLabel: string | null;
    text: string;
    startMs: number;
  }>,
  getSpeakerLabel: (speaker: string, label: string | null) => string
): DocumentLine[] {
  const lines: DocumentLine[] = [];
  let lineNumber = 1;
  
  for (const segment of segments) {
    const speaker = getSpeakerLabel(segment.speaker, segment.speakerLabel);
    const timestamp = formatTimestamp(segment.startMs);
    const prefix = `[${timestamp}] ${speaker.toUpperCase()}: `;
    const prefixLength = prefix.length;
    
    // Split the text into lines, accounting for the prefix on the first line
    const firstLineChars = CHARS_PER_LINE - prefixLength;
    const textLines = splitTextIntoLines(segment.text, CHARS_PER_LINE);
    
    // Re-split considering prefix
    const allLines: string[] = [];
    let remainingText = segment.text;
    
    // First line has less space due to prefix
    const firstWords: string[] = [];
    let firstLineLength = 0;
    const words = remainingText.split(' ');
    let wordIndex = 0;
    
    while (wordIndex < words.length) {
      const word = words[wordIndex];
      const testLength = firstLineLength + (firstLineLength > 0 ? 1 : 0) + word.length;
      if (testLength <= Math.max(firstLineChars, 30)) {
        firstWords.push(word);
        firstLineLength = testLength;
        wordIndex++;
      } else {
        break;
      }
    }
    
    allLines.push(firstWords.join(' '));
    remainingText = words.slice(wordIndex).join(' ');
    
    // Remaining lines have full width
    if (remainingText) {
      const remainingLines = splitTextIntoLines(remainingText, CHARS_PER_LINE);
      allLines.push(...remainingLines);
    }
    
    // Create document lines
    allLines.forEach((lineText, idx) => {
      lines.push({
        lineNumber: lineNumber++,
        type: 'content',
        speaker: idx === 0 ? segment.speaker : undefined,
        speakerLabel: idx === 0 ? segment.speakerLabel : undefined,
        timestamp: idx === 0 ? timestamp : undefined,
        text: lineText,
        isContinuation: idx > 0,
      });
    });
  }
  
  return lines;
}

// Paginate lines into pages
interface DocumentPage {
  pageNumber: number;
  lines: DocumentLine[];
}

function paginateLines(lines: DocumentLine[], linesPerPage: number = LINES_PER_PAGE): DocumentPage[] {
  const pages: DocumentPage[] = [];
  let currentPage: DocumentLine[] = [];
  let pageNumber = 1;
  
  for (const line of lines) {
    currentPage.push(line);
    if (currentPage.length >= linesPerPage) {
      pages.push({ pageNumber: pageNumber++, lines: currentPage });
      currentPage = [];
    }
  }
  
  if (currentPage.length > 0) {
    pages.push({ pageNumber: pageNumber, lines: currentPage });
  }
  
  return pages;
}

// Shared Document Preview Component
function DocumentPreview({
  recording,
  segments,
  getSpeakerLabel,
  title,
  subtitle,
  format,
}: {
  recording: Recording;
  segments: Array<{
    speaker: string;
    speakerLabel: string | null;
    text: string;
    startMs: number;
    endMs: number;
  }>;
  getSpeakerLabel: (speaker: string, label: string | null) => string;
  title: string;
  subtitle: string;
  format: 'pdf' | 'docx' | 'txt';
}) {
  // Process all segments into lines with proper line numbering
  const documentLines = useMemo(() => {
    return processSegmentsIntoLines(segments, getSpeakerLabel);
  }, [segments, getSpeakerLabel]);
  
  // Paginate the lines
  const pages = useMemo(() => {
    return paginateLines(documentLines);
  }, [documentLines]);
  
  const totalPages = pages.length;
  
  if (format === 'txt') {
    // Plain text preview
    return (
      <div className="font-mono text-xs bg-gray-900 text-gray-100 rounded-lg overflow-hidden">
        <ScrollArea className="h-[55vh]">
          <div className="p-4 space-y-0">
            {/* Header */}
            <div className="text-amber-400 mb-2">◆ Transcription generated through case.dev</div>
            <div className="text-gray-500 mb-4">{'═'.repeat(72)}</div>
            
            {/* Title */}
            <div className="text-center mb-2">
              <div className="text-white font-bold">{title}</div>
              <div className="text-gray-400">{subtitle}</div>
            </div>
            <div className="text-gray-500 mb-4">{'═'.repeat(72)}</div>
            
            {/* Metadata */}
            <div className="mb-4">
              <div className="text-white font-bold mb-1">RECORDING INFORMATION</div>
              <div className="text-gray-500 mb-2">{'─'.repeat(30)}</div>
              <div className="text-gray-300">  File:          {recording.filename}</div>
              {recording.caseNumber && <div className="text-gray-300">  Case Number:   {recording.caseNumber}</div>}
              {recording.courtName && <div className="text-gray-300">  Court:         {recording.courtName}</div>}
              {recording.recordingDate && <div className="text-gray-300">  Date:          {recording.recordingDate}</div>}
              {recording.durationSeconds && <div className="text-gray-300">  Duration:      {formatDuration(recording.durationSeconds)}</div>}
            </div>
            
            <div className="text-gray-500 mb-4">{'─'.repeat(72)}</div>
            <div className="text-white font-bold mb-2">TRANSCRIPT OF PROCEEDINGS</div>
            <div className="text-gray-500 mb-4">{'─'.repeat(30)}</div>
            
            {/* Content with pages */}
            {pages.map((page, pageIdx) => (
              <div key={page.pageNumber} className="relative">
                {pageIdx > 0 && (
                  <div className="border-t-2 border-dashed border-gray-600 my-6 relative">
                    <span className="absolute left-1/2 -translate-x-1/2 -top-3 bg-gray-900 px-3 text-gray-500 text-xs">
                      Page {page.pageNumber} of {totalPages}
                    </span>
                  </div>
                )}
                {page.lines.map((line) => (
                  <div key={line.lineNumber} className="flex">
                    <span className="text-gray-600 w-8 text-right mr-3 select-none">
                      {line.lineNumber.toString().padStart(3, ' ')}
                    </span>
                    <span className="flex-1">
                      {line.timestamp && (
                        <span className="text-gray-500">[{line.timestamp}] </span>
                      )}
                      {line.speaker && (
                        <span className="text-cyan-400">
                          {getSpeakerLabel(line.speaker, line.speakerLabel).toUpperCase()}:{' '}
                        </span>
                      )}
                      <span className="text-gray-200">{line.text}</span>
                    </span>
                  </div>
                ))}
              </div>
            ))}
            
            {/* Footer */}
            <div className="text-gray-500 mt-6">{'─'.repeat(72)}</div>
            <div className="text-center text-gray-400 mt-2">END OF TRANSCRIPT</div>
            <div className="text-gray-500 mt-4">{'─'.repeat(72)}</div>
            <div className="text-center text-gray-500 mt-2 italic text-[10px]">
              This transcript was generated using automated speech recognition technology.
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }
  
  // PDF/DOCX preview (visual document format)
  return (
    <div className="bg-gray-200 rounded-lg overflow-hidden">
      <ScrollArea className="h-[55vh]">
        <div className="p-6 space-y-6">
          {pages.map((page, pageIdx) => (
            <div 
              key={page.pageNumber}
              className="bg-white shadow-lg mx-auto relative"
              style={{ 
                fontFamily: 'Helvetica, Arial, sans-serif',
                width: '8.5in',
                minHeight: '11in',
                padding: '0.75in',
                boxSizing: 'border-box',
              }}
            >
              {/* Page header */}
              <div className="flex items-center justify-between mb-4 pb-2" style={{ borderBottom: '1px solid #ccc' }}>
                <span style={{ color: '#E65100', fontSize: 9 }}>
                  ◆ Transcription generated through case.dev
                </span>
                <span style={{ color: '#666', fontSize: 9 }}>
                  Page {page.pageNumber} of {totalPages}
                </span>
              </div>
              
              {/* First page header content */}
              {pageIdx === 0 && (
                <>
                  {/* Title Section */}
                  <div className="text-center mb-6">
                    <h1 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 4, color: '#000' }}>
                      {title || 'OFFICIAL TRANSCRIPT'}
                    </h1>
                    <p style={{ fontSize: 13, color: '#333' }}>
                      {subtitle || 'Court Recording Transcription'}
                    </p>
                  </div>

                  {/* Double line separator */}
                  <div className="mb-4">
                    <div style={{ borderTop: '2px solid #000', marginBottom: 2 }} />
                    <div style={{ borderTop: '1px solid #000' }} />
                  </div>

                  {/* Recording Information */}
                  <div className="mb-4">
                    <h2 style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 8, color: '#000' }}>
                      RECORDING INFORMATION
                    </h2>
                    <div style={{ fontSize: 10 }}>
                      <div className="flex gap-2 mb-1">
                        <span style={{ fontWeight: 'bold', width: 90, color: '#000' }}>File:</span>
                        <span style={{ color: '#333' }}>{recording.filename}</span>
                      </div>
                      {recording.caseNumber && (
                        <div className="flex gap-2 mb-1">
                          <span style={{ fontWeight: 'bold', width: 90, color: '#000' }}>Case Number:</span>
                          <span style={{ color: '#333' }}>{recording.caseNumber}</span>
                        </div>
                      )}
                      {recording.courtName && (
                        <div className="flex gap-2 mb-1">
                          <span style={{ fontWeight: 'bold', width: 90, color: '#000' }}>Court:</span>
                          <span style={{ color: '#333' }}>{recording.courtName}</span>
                        </div>
                      )}
                      {recording.recordingDate && (
                        <div className="flex gap-2 mb-1">
                          <span style={{ fontWeight: 'bold', width: 90, color: '#000' }}>Date:</span>
                          <span style={{ color: '#333' }}>{recording.recordingDate}</span>
                        </div>
                      )}
                      {recording.durationSeconds && (
                        <div className="flex gap-2 mb-1">
                          <span style={{ fontWeight: 'bold', width: 90, color: '#000' }}>Duration:</span>
                          <span style={{ color: '#333' }}>{formatDuration(recording.durationSeconds)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Separator */}
                  <div style={{ borderTop: '1px solid #ccc', marginBottom: 16 }} />

                  {/* Transcript heading */}
                  <h2 style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 12, color: '#000' }}>
                    TRANSCRIPT OF PROCEEDINGS
                  </h2>
                </>
              )}
              
              {/* Continuation header for subsequent pages */}
              {pageIdx > 0 && (
                <div className="mb-4">
                  <h2 style={{ fontSize: 10, color: '#666', fontStyle: 'italic' }}>
                    TRANSCRIPT OF PROCEEDINGS (continued)
                  </h2>
                </div>
              )}
              
              {/* Lines with line numbers */}
              <div style={{ fontSize: 10 }}>
                {page.lines.map((line) => (
                  <div key={line.lineNumber} className="flex mb-0.5" style={{ minHeight: '1.4em' }}>
                    <span style={{ 
                      color: '#888', 
                      width: 30, 
                      flexShrink: 0, 
                      fontFamily: 'monospace', 
                      fontSize: 9,
                      textAlign: 'right',
                      paddingRight: 8,
                    }}>
                      {line.lineNumber}
                    </span>
                    <div className="flex-1" style={{ color: '#000' }}>
                      {line.timestamp && (
                        <span style={{ color: '#666' }}>[{line.timestamp}] </span>
                      )}
                      {line.speaker && (
                        <span style={{ fontWeight: 'bold' }}>
                          {getSpeakerLabel(line.speaker, line.speakerLabel).toUpperCase()}:{' '}
                        </span>
                      )}
                      {line.isContinuation && !line.speaker && (
                        <span style={{ paddingLeft: 8 }}></span>
                      )}
                      <span>{line.text}</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Last page footer */}
              {pageIdx === pages.length - 1 && (
                <div className="mt-8">
                  <div style={{ borderTop: '1px solid #000', marginBottom: 8 }} />
                  <p className="text-center" style={{ fontSize: 11, fontWeight: 'bold', color: '#000' }}>
                    END OF TRANSCRIPT
                  </p>
                  <div className="mt-6 text-center" style={{ fontSize: 9, color: '#666', fontStyle: 'italic' }}>
                    <p>This transcript was generated using automated speech recognition technology.</p>
                    <p>Document generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
                  </div>
                </div>
              )}
              
              {/* Page footer */}
              <div 
                className="absolute bottom-6 left-0 right-0 text-center"
                style={{ fontSize: 9, color: '#666' }}
              >
                Page {page.pageNumber} of {totalPages}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// Generic Export Dialog Component
function ExportDialog({ 
  recording, 
  utterances,
  utteranceEdits,
  getSpeakerLabel,
  format,
  formatLabel,
  formatIcon: FormatIcon,
}: { 
  recording: Recording;
  utterances: Utterance[];
  utteranceEdits: UtteranceEdit[];
  getSpeakerLabel: (speaker: string, label: string | null) => string;
  format: 'pdf' | 'docx' | 'txt';
  formatLabel: string;
  formatIcon: React.ElementType;
}) {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [title, setTitle] = useState('OFFICIAL TRANSCRIPT');
  const [subtitle, setSubtitle] = useState('Court Recording Transcription');

  // Process utterances with edits and merge adjacent same-speaker segments
  const processedSegments = useMemo(() => {
    const allSegments: Array<{
      speaker: string;
      speakerLabel: string | null;
      text: string;
      startMs: number;
      endMs: number;
    }> = [];

    for (const utterance of utterances) {
      const edit = utteranceEdits.find(e => e.utteranceId === utterance.id);
      
      if (edit && edit.segments.length > 0) {
        // Use edited segments
        for (const segment of edit.segments) {
          allSegments.push({
            speaker: segment.speaker,
            speakerLabel: segment.speakerLabel,
            text: segment.text,
            startMs: utterance.startMs,
            endMs: utterance.endMs,
          });
        }
      } else {
        // Use original utterance
        allSegments.push({
          speaker: utterance.speaker,
          speakerLabel: utterance.speakerLabel,
          text: utterance.text,
          startMs: utterance.startMs,
          endMs: utterance.endMs,
        });
      }
    }

    // Merge adjacent segments with same speaker
    const merged: typeof allSegments = [];
    for (const segment of allSegments) {
      const last = merged[merged.length - 1];
      if (last && last.speaker === segment.speaker) {
        merged[merged.length - 1] = {
          ...last,
          text: last.text + ' ' + segment.text,
          endMs: segment.endMs,
        };
      } else {
        merged.push({ ...segment });
      }
    }
    
    return merged;
  }, [utterances, utteranceEdits]);

  const editCount = utteranceEdits.length;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({
        format: format,
        title: title,
        subtitle: subtitle,
      });
      const response = await fetch(`/api/recordings/${recording.id}/export?${params}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${recording.filename.replace(/\.[^/.]+$/, '')}_transcript.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`${formatLabel} exported successfully`);
      setOpen(false);
    } catch (error) {
      toast.error(`Failed to export ${formatLabel}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Calculate document stats
  const documentLines = useMemo(() => {
    return processSegmentsIntoLines(processedSegments, getSpeakerLabel);
  }, [processedSegments, getSpeakerLabel]);
  
  const pages = useMemo(() => {
    return paginateLines(documentLines);
  }, [documentLines]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <FormatIcon className="h-4 w-4 mr-2" />
          Export as {formatLabel}
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[95vh] w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FormatIcon className="h-5 w-5" />
            {formatLabel} Export Preview
          </DialogTitle>
          <DialogDescription className="flex items-center gap-4">
            <span>Customize and preview your transcript before exporting</span>
            <span className="text-muted-foreground">
              {pages.length} page{pages.length !== 1 ? 's' : ''} • {documentLines.length} lines
            </span>
            {editCount > 0 && (
              <span className="text-primary">
                ({editCount} segment{editCount !== 1 ? 's' : ''} edited)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        
        {/* Editable Title and Subtitle */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label htmlFor={`${format}-title`} className="text-sm font-medium">
              Document Title
            </label>
            <Input
              id={`${format}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter document title..."
              className="font-medium"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`${format}-subtitle`} className="text-sm font-medium">
              Subtitle
            </label>
            <Input
              id={`${format}-subtitle`}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Enter subtitle..."
            />
          </div>
        </div>

        {/* Document Preview */}
        <DocumentPreview
          recording={recording}
          segments={processedSegments}
          getSpeakerLabel={getSpeakerLabel}
          title={title}
          subtitle={subtitle}
          format={format}
        />

        <DialogFooter className="gap-2 sm:gap-0">
          <div className="flex-1 text-xs text-muted-foreground">
            {format === 'pdf' && 'PDF format preserves formatting for printing'}
            {format === 'docx' && 'Word format allows editing in Microsoft Word'}
            {format === 'txt' && 'Plain text format for maximum compatibility'}
          </div>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            <FileDown className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : `Download ${formatLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Floating Playback Bar Component
function FloatingPlaybackBar({
  isPlaying,
  currentTimeMs,
  durationMs,
  onTogglePlayPause,
  onSkip,
  onSeek,
  hasAudio,
}: {
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  onTogglePlayPause: () => void;
  onSkip: (seconds: number) => void;
  onSeek: (ms: number) => void;
  hasAudio: boolean;
}) {
  if (!hasAudio) return null;

  const progress = durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-background/95 backdrop-blur-sm border rounded-full shadow-lg px-4 py-2 flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-full"
          onClick={() => onSkip(-10)}
          title="Skip back 10 seconds"
        >
          <SkipBack className="h-4 w-4" />
        </Button>

        <Button 
          size="icon" 
          className="h-10 w-10 rounded-full"
          onClick={onTogglePlayPause}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </Button>

        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-full"
          onClick={() => onSkip(10)}
          title="Skip forward 10 seconds"
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2 text-sm min-w-[140px]">
          <span className="text-muted-foreground w-12 text-right">
            {formatTimestamp(currentTimeMs)}
          </span>
          
          <div 
            className="w-24 h-1.5 bg-muted rounded-full cursor-pointer overflow-hidden"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              onSeek(percent * durationMs);
            }}
          >
            <div 
              className="h-full bg-black transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <span className="text-muted-foreground w-12">
            {formatTimestamp(durationMs)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function RecordingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [userScrolledRecently, setUserScrolledRecently] = useState(false);
  const [utteranceEdits, setUtteranceEdits] = useState<UtteranceEdit[]>([]);
  const [textSelection, setTextSelection] = useState<TextSelection | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeUtteranceRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastAutoScrollTimeRef = useRef<number>(0);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recording', id],
    queryFn: () => fetchRecording(id),
  });

  // Handle text selection in transcript
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (!transcriptRef.current?.contains(e.target as Node)) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        return;
      }

      const selectedText = selection.toString().trim();
      if (selectedText.length < 3) return;

      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      
      // Walk up to find the utterance element
      let utteranceElement: HTMLElement | null = null;
      let current: Node | null = container;
      while (current && current !== transcriptRef.current) {
        if (current instanceof HTMLElement && current.id?.startsWith('utterance-')) {
          utteranceElement = current;
          break;
        }
        current = current.parentNode;
      }

      if (utteranceElement) {
        const utteranceId = utteranceElement.id.replace('utterance-', '');
        const rect = range.getBoundingClientRect();
        
        // Find the text content element and calculate offsets
        const textElement = utteranceElement.querySelector('[data-text-content]');
        if (textElement) {
          // Get the full text and find where the selection starts/ends
          const fullText = textElement.textContent || '';
          const startOffset = fullText.indexOf(selectedText);
          const endOffset = startOffset + selectedText.length;
          
          if (startOffset >= 0) {
            setTextSelection({
              utteranceId,
              selectedText,
              startOffset,
              endOffset,
              position: {
                x: rect.left + rect.width / 2 - 150,
                y: rect.bottom,
              },
            });
          }
        }
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Detect user scroll and temporarily disable auto-scroll
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    if (!viewport) return;

    const handleUserScroll = () => {
      const now = Date.now();
      if (now - lastAutoScrollTimeRef.current < 150) return;

      if (autoScroll && isPlaying) {
        setAutoScroll(false);
        setUserScrolledRecently(true);
        
        if (userScrollTimeoutRef.current) {
          clearTimeout(userScrollTimeoutRef.current);
        }
        
        userScrollTimeoutRef.current = setTimeout(() => {
          setUserScrolledRecently(false);
        }, 5000);
      }
    };

    viewport.addEventListener('scroll', handleUserScroll, { passive: true });
    
    return () => {
      viewport.removeEventListener('scroll', handleUserScroll);
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, [autoScroll, isPlaying]);

  // Auto-scroll to active utterance
  useEffect(() => {
    if (activeUtteranceRef.current && isPlaying && autoScroll && !userScrolledRecently) {
      lastAutoScrollTimeRef.current = Date.now();
      activeUtteranceRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }
  }, [currentTimeMs, isPlaying, autoScroll, userScrolledRecently]);

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (textSelection) {
          setTextSelection(null);
        } else if (autoScroll) {
          setAutoScroll(false);
        }
      }
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        togglePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [autoScroll, textSelection]);

  // Audio time update handler and duration detection
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let animationFrameId: number;
    let isUpdating = false;

    const updateTime = () => {
      if (audio && !audio.paused) {
        setCurrentTimeMs(audio.currentTime * 1000);
        animationFrameId = requestAnimationFrame(updateTime);
      }
      isUpdating = audio && !audio.paused;
    };

    const handleLoadedMetadata = () => {
      // Get duration from audio element when metadata loads
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setAudioDurationMs(audio.duration * 1000);
      }
    };

    const handleDurationChange = () => {
      // Also listen for duration changes
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setAudioDurationMs(audio.duration * 1000);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      if (!isUpdating) {
        animationFrameId = requestAnimationFrame(updateTime);
      }
    };
    
    const handlePause = () => {
      setIsPlaying(false);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };

    const handleTimeUpdate = () => {
      if (!isUpdating) setCurrentTimeMs(audio.currentTime * 1000);
    };

    // Check if duration is already available
    if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
      setAudioDurationMs(audio.duration * 1000);
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [data?.recording.convertedAudioUrl]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play();
  }, [isPlaying]);

  const seekTo = useCallback((ms: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ms / 1000;
    setCurrentTimeMs(ms);
  }, []);

  const skip = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime + seconds);
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchTranscript(id, searchQuery);
      setSearchResults(results.results);
      if (results.results.length === 0) toast.info('No results found');
    } catch (error) {
      toast.error('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  // Handle partial text speaker change (from selection)
  const handlePartialSpeakerChange = useCallback((
    utteranceId: string,
    startOffset: number,
    endOffset: number,
    newSpeaker: string,
    newLabel: string | null
  ) => {
    if (!data) return;
    
    const utterance = data.utterances.find(u => u.id === utteranceId);
    if (!utterance) return;

    setUtteranceEdits(prev => {
      const existingEdit = prev.find(e => e.utteranceId === utteranceId);
      const currentSegments = existingEdit?.segments || [{
        text: utterance.text,
        speaker: utterance.speaker,
        speakerLabel: utterance.speakerLabel,
        startCharIndex: 0,
        endCharIndex: utterance.text.length,
      }];

      // Split segments based on the new selection
      const newSegments: TextSegment[] = [];
      let charIndex = 0;

      for (const segment of currentSegments) {
        const segmentStart = charIndex;
        const segmentEnd = charIndex + segment.text.length;
        
        // Check if selection overlaps with this segment
        const overlapStart = Math.max(startOffset, segmentStart);
        const overlapEnd = Math.min(endOffset, segmentEnd);
        
        if (overlapStart < overlapEnd) {
          // Selection overlaps with this segment - split it
          
          // Part before selection (if any)
          if (overlapStart > segmentStart) {
            const beforeText = segment.text.substring(0, overlapStart - segmentStart);
            newSegments.push({
              text: beforeText,
              speaker: segment.speaker,
              speakerLabel: segment.speakerLabel,
              startCharIndex: segmentStart,
              endCharIndex: overlapStart,
            });
          }
          
          // The selected part with new speaker
          const selectedText = segment.text.substring(overlapStart - segmentStart, overlapEnd - segmentStart);
          newSegments.push({
            text: selectedText,
            speaker: newSpeaker,
            speakerLabel: newLabel,
            startCharIndex: overlapStart,
            endCharIndex: overlapEnd,
          });
          
          // Part after selection (if any)
          if (overlapEnd < segmentEnd) {
            const afterText = segment.text.substring(overlapEnd - segmentStart);
            newSegments.push({
              text: afterText,
              speaker: segment.speaker,
              speakerLabel: segment.speakerLabel,
              startCharIndex: overlapEnd,
              endCharIndex: segmentEnd,
            });
          }
        } else {
          // No overlap - keep segment as is
          newSegments.push({
            ...segment,
            startCharIndex: segmentStart,
            endCharIndex: segmentEnd,
          });
        }
        
        charIndex = segmentEnd;
      }

      // Merge adjacent segments with same speaker
      const mergedSegments: TextSegment[] = [];
      for (const segment of newSegments) {
        const last = mergedSegments[mergedSegments.length - 1];
        if (last && last.speaker === segment.speaker) {
          mergedSegments[mergedSegments.length - 1] = {
            ...last,
            text: last.text + segment.text,
            endCharIndex: segment.endCharIndex,
          };
        } else {
          mergedSegments.push(segment);
        }
      }

      // Update or add the edit
      const filtered = prev.filter(e => e.utteranceId !== utteranceId);
      
      // Only add edit if segments differ from original
      const isModified = mergedSegments.length > 1 || 
        mergedSegments[0]?.speaker !== utterance.speaker;
      
      if (isModified) {
        return [...filtered, { utteranceId, segments: mergedSegments }];
      }
      return filtered;
    });
  }, [data]);

  // Handle entire segment speaker change (from header button)
  const handleEntireSegmentSpeakerChange = useCallback((
    utteranceId: string,
    newSpeaker: string,
    newLabel: string | null
  ) => {
    if (!data) return;
    
    const utterance = data.utterances.find(u => u.id === utteranceId);
    if (!utterance) return;

    setUtteranceEdits(prev => {
      const filtered = prev.filter(e => e.utteranceId !== utteranceId);
      
      // If changing back to original speaker, just remove the edit
      if (newSpeaker === utterance.speaker) {
        return filtered;
      }
      
      // Replace entire segment with new speaker
      return [...filtered, {
        utteranceId,
        segments: [{
          text: utterance.text,
          speaker: newSpeaker,
          speakerLabel: newLabel,
          startCharIndex: 0,
          endCharIndex: utterance.text.length,
        }],
      }];
    });
  }, [data]);

  // Get segments for an utterance (considering edits)
  const getUtteranceSegments = useCallback((utterance: Utterance): TextSegment[] => {
    const edit = utteranceEdits.find(e => e.utteranceId === utterance.id);
    if (edit) return edit.segments;
    
    return [{
      text: utterance.text,
      speaker: utterance.speaker,
      speakerLabel: utterance.speakerLabel,
      startCharIndex: 0,
      endCharIndex: utterance.text.length,
    }];
  }, [utteranceEdits]);

  // Get unique speakers including any new ones from edits
  const allSpeakers = useMemo(() => {
    const speakers = new Set<string>();
    data?.utterances.forEach(u => speakers.add(u.speaker));
    utteranceEdits.forEach(e => e.segments.forEach(s => speakers.add(s.speaker)));
    return Array.from(speakers);
  }, [data?.utterances, utteranceEdits]);

  // Create speaker color map
  const speakerColorMap: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {};
    allSpeakers.forEach((speaker, index) => {
      map[speaker] = SPEAKER_COLORS[index % SPEAKER_COLORS.length];
    });
    return map;
  }, [allSpeakers]);

  // Get speaker label
  const getSpeakerLabel = useCallback((speaker: string, speakerLabel: string | null) => {
    // Check edits for new speaker labels
    for (const edit of utteranceEdits) {
      for (const segment of edit.segments) {
        if (segment.speaker === speaker && segment.speakerLabel) {
          return segment.speakerLabel;
        }
      }
    }
    
    if (speakerLabel) return speakerLabel;
    const label = data?.speakerLabels.find(l => l.speakerId === speaker);
    return label?.label || `Speaker ${speaker}`;
  }, [data?.speakerLabels, utteranceEdits]);

  // Get primary speaker for an utterance (first segment's speaker)
  const getPrimarySpeaker = useCallback((utterance: Utterance) => {
    const segments = getUtteranceSegments(utterance);
    return segments[0] || { speaker: utterance.speaker, speakerLabel: utterance.speakerLabel };
  }, [getUtteranceSegments]);

  // Get current speaker for selected utterance
  const getSelectedUtteranceSpeaker = useCallback(() => {
    if (!textSelection || !data) return '';
    const utterance = data.utterances.find(u => u.id === textSelection.utteranceId);
    if (!utterance) return '';
    return getPrimarySpeaker(utterance).speaker;
  }, [textSelection, data, getPrimarySpeaker]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load recording</p>
        <Link href="/">
          <Button variant="outline" className="mt-4">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const { recording, utterances } = data;
  const displayUtterances = searchResults || utterances;
  const editCount = utteranceEdits.length;

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{recording.filename}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {recording.caseNumber && <span>Case: {recording.caseNumber}</span>}
              {recording.courtName && <span>{recording.courtName}</span>}
              {recording.durationSeconds !== null && recording.durationSeconds > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatDuration(recording.durationSeconds)}
                </span>
              )}
              {data.transcript?.confidence && (
                <Badge variant="outline">
                  {(data.transcript.confidence * 100).toFixed(1)}% accuracy
                </Badge>
              )}
              {editCount > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Edit className="h-3 w-3" />
                  {editCount} edit{editCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editCount > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setUtteranceEdits([]);
                toast.success('All edits cleared');
              }}
            >
              <X className="h-4 w-4 mr-1" />
              Clear Edits
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <ExportDialog 
                recording={recording} 
                utterances={utterances}
                utteranceEdits={utteranceEdits}
                getSpeakerLabel={getSpeakerLabel}
                format="pdf"
                formatLabel="PDF"
                formatIcon={FileDown}
              />
              <ExportDialog 
                recording={recording} 
                utterances={utterances}
                utteranceEdits={utteranceEdits}
                getSpeakerLabel={getSpeakerLabel}
                format="docx"
                formatLabel="Word (.docx)"
                formatIcon={FileText}
              />
              <ExportDialog 
                recording={recording} 
                utterances={utterances}
                utteranceEdits={utteranceEdits}
                getSpeakerLabel={getSpeakerLabel}
                format="txt"
                formatLabel="Text (.txt)"
                formatIcon={FileText}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Audio Player */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Audio Player
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recording.convertedAudioUrl ? (
              <>
                <audio
                  ref={audioRef}
                  src={recording.convertedAudioUrl}
                  preload="metadata"
                />
                
                <div className="space-y-2">
                  <div 
                    className="h-2 bg-muted rounded-full cursor-pointer overflow-hidden"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const percent = (e.clientX - rect.left) / rect.width;
                      seekTo(percent * audioDurationMs);
                    }}
                  >
                    <div 
                      className="h-full bg-black transition-all"
                      style={{ 
                        width: `${audioDurationMs > 0
                          ? (currentTimeMs / audioDurationMs) * 100 
                          : 0}%` 
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{formatTimestamp(currentTimeMs)}</span>
                    <span>{formatTimestamp(audioDurationMs)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-4">
                  <Button variant="outline" size="icon" onClick={() => skip(-10)}>
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <Button size="lg" onClick={togglePlayPause}>
                    {isPlaying ? (
                      <Pause className="h-6 w-6" />
                    ) : (
                      <Play className="h-6 w-6 ml-1" />
                    )}
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => skip(10)}>
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center justify-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    id="autoScroll"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="autoScroll" className="text-muted-foreground">
                    Auto-scroll with playback
                  </label>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Volume2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Audio not available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Search */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Transcript
            </CardTitle>
            <CardDescription>
              Find specific words or phrases in the transcript
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder='Search for "objection", "sustained", etc.'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={isSearching}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {searchResults && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                  </span>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setSearchResults(null);
                      setSearchQuery('');
                    }}
                  >
                    Clear
                  </Button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {searchResults.map((result, index) => (
                    <button
                      key={result.id}
                      className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors border border-transparent hover:border-primary/20"
                      onClick={() => {
                        seekTo(result.startMs);
                        const element = document.getElementById(`utterance-${result.id}`);
                        if (element) {
                          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <span className="font-medium text-primary">#{index + 1}</span>
                        <span>{formatTimestamp(result.startMs)}</span>
                        <Badge variant="outline" className="text-xs py-0">
                          {getSpeakerLabel(result.speaker, result.speakerLabel)}
                        </Badge>
                      </div>
                      <p className="text-sm line-clamp-2">
                        {result.text.substring(0, 100)}{result.text.length > 100 ? '...' : ''}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transcript */}
      <Card>
        <CardHeader>
          <CardTitle>Transcript</CardTitle>
          <CardDescription>
            Click on any segment to jump to that point. <strong>Highlight text</strong> to change speaker for just that portion, or use the <Users className="h-3 w-3 inline" /> button to change the entire segment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4" ref={scrollAreaRef}>
            <div ref={transcriptRef}>
              {displayUtterances.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No transcript available</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {displayUtterances.map((utterance) => {
                    const isActive = currentTimeMs >= utterance.startMs && currentTimeMs < utterance.endMs;
                    const segments = getUtteranceSegments(utterance);
                    const hasEdit = utteranceEdits.some(e => e.utteranceId === utterance.id);
                    const searchHighlights = searchResults && 'highlights' in utterance 
                      ? (utterance as SearchResult).highlights 
                      : undefined;
                    
                    // If there are multiple segments (edited), render each as a separate block
                    if (segments.length > 1) {
                      // Helper to change speaker for a specific segment
                      const handleSegmentSpeakerChange = (segIndex: number, newSpeaker: string, newLabel: string | null) => {
                        setUtteranceEdits(prev => {
                          const existingEdit = prev.find(e => e.utteranceId === utterance.id);
                          if (!existingEdit) return prev;
                          
                          const newSegments = [...existingEdit.segments];
                          newSegments[segIndex] = {
                            ...newSegments[segIndex],
                            speaker: newSpeaker,
                            speakerLabel: newLabel,
                          };
                          
                          // Merge adjacent segments with same speaker
                          const mergedSegments: TextSegment[] = [];
                          for (const seg of newSegments) {
                            const last = mergedSegments[mergedSegments.length - 1];
                            if (last && last.speaker === seg.speaker) {
                              mergedSegments[mergedSegments.length - 1] = {
                                ...last,
                                text: last.text + seg.text,
                                endCharIndex: seg.endCharIndex,
                              };
                            } else {
                              mergedSegments.push(seg);
                            }
                          }
                          
                          // Check if we're back to original
                          if (mergedSegments.length === 1 && mergedSegments[0].speaker === utterance.speaker) {
                            return prev.filter(e => e.utteranceId !== utterance.id);
                          }
                          
                          return prev.map(e => 
                            e.utteranceId === utterance.id 
                              ? { ...e, segments: mergedSegments }
                              : e
                          );
                        });
                        toast.success('Segment speaker changed');
                      };

                      // Helper to delete a specific segment
                      const handleDeleteSegment = (segIndex: number) => {
                        setUtteranceEdits(prev => {
                          const existingEdit = prev.find(e => e.utteranceId === utterance.id);
                          if (!existingEdit) return prev;
                          
                          const newSegments = existingEdit.segments.filter((_, i) => i !== segIndex);
                          
                          // If no segments left, remove the edit entirely
                          if (newSegments.length === 0) {
                            return prev.filter(e => e.utteranceId !== utterance.id);
                          }
                          
                          // Recalculate char indices
                          let charIndex = 0;
                          const reindexedSegments = newSegments.map(seg => {
                            const newSeg = {
                              ...seg,
                              startCharIndex: charIndex,
                              endCharIndex: charIndex + seg.text.length,
                            };
                            charIndex += seg.text.length;
                            return newSeg;
                          });
                          
                          return prev.map(e => 
                            e.utteranceId === utterance.id 
                              ? { ...e, segments: reindexedSegments }
                              : e
                          );
                        });
                        toast.success('Segment deleted');
                      };

                      // Helper to revert all edits for this utterance
                      const handleRevertUtterance = () => {
                        setUtteranceEdits(prev => prev.filter(e => e.utteranceId !== utterance.id));
                        toast.success('Edits reverted');
                      };

                      return (
                        <div key={utterance.id} id={`utterance-${utterance.id}`} className="space-y-2">
                          {segments.map((segment, segIndex) => {
                            const segmentSpeakerLabel = getSpeakerLabel(segment.speaker, segment.speakerLabel);
                            // Calculate if this segment is active based on character progress
                            const utteranceDuration = utterance.endMs - utterance.startMs;
                            const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0);
                            const segmentStartChar = segments.slice(0, segIndex).reduce((sum, s) => sum + s.text.length, 0);
                            const segmentEndChar = segmentStartChar + segment.text.length;
                            const progress = isActive 
                              ? Math.min(1, Math.max(0, (currentTimeMs - utterance.startMs) / utteranceDuration))
                              : 0;
                            const currentCharIndex = Math.floor(progress * totalChars);
                            const isSegmentActive = isActive && currentCharIndex >= segmentStartChar && currentCharIndex < segmentEndChar;
                            
                            // Word-by-word highlighting for this segment
                            const words = segment.text.split(/(\s+)/);
                            let segmentCharCount = segmentStartChar;
                            
                            return (
                              <div
                                key={`${utterance.id}-seg-${segIndex}`}
                                ref={isSegmentActive ? activeUtteranceRef : null}
                                className={`
                                  p-3 rounded-lg cursor-pointer transition-all select-text
                                  ${isSegmentActive 
                                    ? 'bg-primary/10 border-l-4 border-primary shadow-sm' 
                                    : 'hover:bg-muted/50'
                                  }
                                `}
                                onClick={(e) => {
                                  const selection = window.getSelection();
                                  if (!selection || selection.isCollapsed) {
                                    seekTo(utterance.startMs);
                                  }
                                }}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <Badge 
                                      variant="secondary" 
                                      className={speakerColorMap[segment.speaker]}
                                    >
                                      <User className="h-3 w-3 mr-1" />
                                      {segmentSpeakerLabel}
                                    </Badge>
                                    <SpeakerLabelDialog
                                      speaker={segment.speaker}
                                      currentLabel={segmentSpeakerLabel}
                                      recordingId={id}
                                      onUpdate={() => refetch()}
                                    />
                                    {/* Change speaker button for edited segments */}
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-6 px-1" title="Change segment speaker">
                                          <Users className="h-3 w-3" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="start">
                                        {allSpeakers
                                          .filter(s => s !== segment.speaker)
                                          .map(speaker => (
                                            <DropdownMenuItem
                                              key={speaker}
                                              onClick={() => {
                                                const label = data.speakerLabels.find(l => l.speakerId === speaker)?.label || null;
                                                handleSegmentSpeakerChange(segIndex, speaker, label);
                                              }}
                                            >
                                              <div className={`w-2 h-2 rounded-full mr-2 ${speakerColorMap[speaker]?.split(' ')[0] || 'bg-gray-400'}`} />
                                              {getSpeakerLabel(speaker, data.speakerLabels.find(l => l.speakerId === speaker)?.label || null)}
                                            </DropdownMenuItem>
                                          ))}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                    <span className="text-xs text-muted-foreground">
                                      {formatTimestamp(utterance.startMs)}
                                    </span>
                                    {segIndex === 0 && hasEdit && (
                                      <Badge variant="outline" className="text-xs py-0 text-primary">
                                        edited
                                      </Badge>
                                    )}
                                  </div>
                                  {/* Three-dot menu for segment actions */}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                        <MoreVertical className="h-3 w-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {segIndex === 0 && (
                                        <DropdownMenuItem onClick={handleRevertUtterance}>
                                          <Undo2 className="h-4 w-4 mr-2" />
                                          Revert All Changes
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem 
                                        onClick={() => handleDeleteSegment(segIndex)}
                                        className="text-destructive focus:text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete Segment
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                                {/* Word-by-word tracking highlight */}
                                <p className="text-sm leading-relaxed" data-text-content>
                                  {words.map((word, wordIndex) => {
                                    const wordStart = segmentCharCount;
                                    const wordEnd = segmentCharCount + word.length;
                                    segmentCharCount = wordEnd;
                                    
                                    const isCurrentWord = isActive && wordStart <= currentCharIndex && currentCharIndex < wordEnd;
                                    const hasBeenSpoken = isActive && wordEnd <= currentCharIndex;
                                    
                                    if (word.trim() === '') {
                                      return <span key={wordIndex}>{word}</span>;
                                    }
                                    
                                    return (
                                      <span
                                        key={wordIndex}
                                        className={`
                                          transition-all duration-100
                                          ${isCurrentWord ? 'bg-yellow-300 dark:bg-yellow-600 px-0.5 rounded font-medium' : ''}
                                          ${hasBeenSpoken && !isCurrentWord ? 'text-foreground' : ''}
                                          ${!hasBeenSpoken && !isCurrentWord && isActive ? 'text-muted-foreground' : ''}
                                        `}
                                      >
                                        {word}
                                      </span>
                                    );
                                  })}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }
                    
                    // Single segment (no edits or single speaker) - render as before
                    const primarySpeaker = segments[0];
                    const speakerDisplayLabel = getSpeakerLabel(primarySpeaker.speaker, primarySpeaker.speakerLabel);
                    
                    // Helper to delete entire utterance (mark as deleted)
                    const handleDeleteUtterance = () => {
                      setUtteranceEdits(prev => {
                        // Add an edit with empty segments to mark as deleted
                        const filtered = prev.filter(e => e.utteranceId !== utterance.id);
                        return [...filtered, { utteranceId: utterance.id, segments: [] }];
                      });
                      toast.success('Block deleted');
                    };

                    // Helper to revert edits for this utterance
                    const handleRevertUtterance = () => {
                      setUtteranceEdits(prev => prev.filter(e => e.utteranceId !== utterance.id));
                      toast.success('Edits reverted');
                    };

                    // Check if this utterance is marked as deleted
                    const isDeleted = utteranceEdits.find(e => e.utteranceId === utterance.id)?.segments.length === 0;
                    if (isDeleted) {
                      return (
                        <div
                          key={utterance.id}
                          id={`utterance-${utterance.id}`}
                          className="p-3 rounded-lg bg-muted/30 border border-dashed border-muted-foreground/30"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground italic">
                              Block deleted
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleRevertUtterance}
                              className="h-6 text-xs"
                            >
                              <Undo2 className="h-3 w-3 mr-1" />
                              Restore
                            </Button>
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <div
                        key={utterance.id}
                        id={`utterance-${utterance.id}`}
                        ref={isActive ? activeUtteranceRef : null}
                        className={`
                          p-3 rounded-lg cursor-pointer transition-all select-text
                          ${isActive 
                            ? 'bg-primary/10 border-l-4 border-primary shadow-sm' 
                            : 'hover:bg-muted/50'
                          }
                          ${hasEdit ? 'ring-2 ring-primary/30' : ''}
                        `}
                        onClick={(e) => {
                          const selection = window.getSelection();
                          if (!selection || selection.isCollapsed) {
                            seekTo(utterance.startMs);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant="secondary" 
                              className={speakerColorMap[primarySpeaker.speaker]}
                            >
                              <User className="h-3 w-3 mr-1" />
                              {speakerDisplayLabel}
                            </Badge>
                            <SpeakerLabelDialog
                              speaker={primarySpeaker.speaker}
                              currentLabel={speakerDisplayLabel}
                              recordingId={id}
                              onUpdate={() => refetch()}
                            />
                            <ChangeSegmentSpeakerDialog
                              utterance={utterance}
                              existingSpeakers={allSpeakers}
                              speakerLabels={data.speakerLabels}
                              onChangeSpeaker={(newSpeaker, newLabel) => 
                                handleEntireSegmentSpeakerChange(utterance.id, newSpeaker, newLabel)
                              }
                              getSpeakerLabel={getSpeakerLabel}
                              speakerColorMap={speakerColorMap}
                            />
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(utterance.startMs)}
                            </span>
                            {hasEdit && (
                              <Badge variant="outline" className="text-xs py-0 text-primary">
                                edited
                              </Badge>
                            )}
                          </div>
                          {/* Three-dot menu for block actions */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {hasEdit && (
                                <DropdownMenuItem onClick={handleRevertUtterance}>
                                  <Undo2 className="h-4 w-4 mr-2" />
                                  Revert Changes
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem 
                                onClick={handleDeleteUtterance}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Block
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="text-sm leading-relaxed" data-text-content>
                          <SegmentedText
                            segments={segments}
                            utteranceStartMs={utterance.startMs}
                            utteranceEndMs={utterance.endMs}
                            currentTimeMs={currentTimeMs}
                            isActive={isActive}
                            searchHighlights={searchHighlights}
                            speakerColorMap={speakerColorMap}
                            getSpeakerLabel={getSpeakerLabel}
                          />
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Text Selection Popover */}
      {textSelection && (
        <SelectionPopover
          selection={textSelection}
          existingSpeakers={allSpeakers}
          speakerLabels={data.speakerLabels}
          onChangeSpeaker={(newSpeaker, newLabel) => {
            handlePartialSpeakerChange(
              textSelection.utteranceId,
              textSelection.startOffset,
              textSelection.endOffset,
              newSpeaker,
              newLabel
            );
          }}
          onClose={() => {
            setTextSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
          getSpeakerLabel={getSpeakerLabel}
          speakerColorMap={speakerColorMap}
          currentSpeaker={getSelectedUtteranceSpeaker()}
        />
      )}

      {/* Floating Playback Bar */}
      <FloatingPlaybackBar
        isPlaying={isPlaying}
        currentTimeMs={currentTimeMs}
        durationMs={audioDurationMs}
        onTogglePlayPause={togglePlayPause}
        onSkip={skip}
        onSeek={seekTo}
        hasAudio={!!recording.convertedAudioUrl}
      />
    </div>
  );
}
