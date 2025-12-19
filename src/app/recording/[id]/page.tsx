'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect, use, useCallback } from 'react';
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
  highlights: Array<{ start: number; end: number }>;
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
  if (seconds === null || seconds === undefined || seconds === 0) return '—';
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

// Word-level highlighting component
function WordHighlightedText({ 
  text, 
  utteranceStartMs, 
  utteranceEndMs, 
  currentTimeMs, 
  isActive,
  searchHighlights,
}: { 
  text: string; 
  utteranceStartMs: number;
  utteranceEndMs: number;
  currentTimeMs: number;
  isActive: boolean;
  searchHighlights?: Array<{ start: number; end: number }>;
}) {
  const words = text.split(/(\s+)/);
  const utteranceDuration = utteranceEndMs - utteranceStartMs;
  const totalChars = text.length;
  
  // Calculate progress through the utterance
  const progress = isActive 
    ? Math.min(1, Math.max(0, (currentTimeMs - utteranceStartMs) / utteranceDuration))
    : 0;
  
  // Estimate which character we're at based on progress
  const currentCharIndex = Math.floor(progress * totalChars);
  
  let charCount = 0;
  
  return (
    <>
      {words.map((word, index) => {
        const wordStart = charCount;
        const wordEnd = charCount + word.length;
        charCount = wordEnd;
        
        // Check if this word is currently being spoken
        const isCurrentWord = isActive && wordStart <= currentCharIndex && currentCharIndex < wordEnd;
        
        // Check if this word is in search highlights
        let isSearchHighlighted = false;
        if (searchHighlights) {
          isSearchHighlighted = searchHighlights.some(
            h => (wordStart >= h.start && wordStart < h.end) || 
                 (wordEnd > h.start && wordEnd <= h.end) ||
                 (wordStart <= h.start && wordEnd >= h.end)
          );
        }
        
        // Check if word has already been spoken
        const hasBeenSpoken = isActive && wordEnd <= currentCharIndex;
        
        if (word.trim() === '') {
          return <span key={index}>{word}</span>;
        }
        
        return (
          <span
            key={index}
            className={`
              transition-all duration-100
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
    </>
  );
}

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
            Assign a name to Speaker {speaker} (e.g., "Judge Smith", "Defense Attorney")
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

// PDF Preview Dialog
function PDFExportDialog({ 
  recording, 
  utterances,
  getSpeakerLabel,
}: { 
  recording: Recording;
  utterances: Utterance[];
  getSpeakerLabel: (speaker: string, label: string | null) => string;
}) {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const generatePDFContent = () => {
    // Generate transcript content for preview
    let content = `TRANSCRIPT\n\n`;
    content += `File: ${recording.filename}\n`;
    if (recording.caseNumber) content += `Case Number: ${recording.caseNumber}\n`;
    if (recording.courtName) content += `Court: ${recording.courtName}\n`;
    if (recording.recordingDate) content += `Date: ${recording.recordingDate}\n`;
    content += `Duration: ${formatDuration(recording.durationSeconds)}\n`;
    content += `\n${'─'.repeat(50)}\n\n`;

    utterances.forEach((u) => {
      const speaker = getSpeakerLabel(u.speaker, u.speakerLabel);
      const timestamp = formatTimestamp(u.startMs);
      content += `[${timestamp}] ${speaker}:\n${u.text}\n\n`;
    });

    return content;
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/recordings/${recording.id}/export?format=pdf`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${recording.filename.replace(/\.[^/.]+$/, '')}_transcript.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('PDF exported successfully');
      setOpen(false);
    } catch (error) {
      toast.error('Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <FileDown className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>PDF Export Preview</DialogTitle>
          <DialogDescription>
            Preview your transcript before exporting
          </DialogDescription>
        </DialogHeader>
        <div className="border rounded-lg bg-white dark:bg-gray-900 p-6 max-h-[50vh] overflow-auto">
          <pre className="whitespace-pre-wrap font-mono text-sm">
            {generatePDFContent()}
          </pre>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleExportPDF} disabled={isExporting}>
            <FileDown className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Download PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RecordingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [userScrolledRecently, setUserScrolledRecently] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeUtteranceRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastAutoScrollTimeRef = useRef<number>(0);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recording', id],
    queryFn: () => fetchRecording(id),
  });

  // Detect user scroll and temporarily disable auto-scroll
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    // Find the actual scrollable viewport inside ScrollArea
    const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    if (!viewport) return;

    const handleUserScroll = () => {
      // Ignore if this scroll was triggered by auto-scroll (within 100ms)
      const now = Date.now();
      if (now - lastAutoScrollTimeRef.current < 150) return;

      // User is scrolling - disable auto-scroll
      if (autoScroll && isPlaying) {
        setAutoScroll(false);
        setUserScrolledRecently(true);
        
        // Clear any existing timeout
        if (userScrollTimeoutRef.current) {
          clearTimeout(userScrollTimeoutRef.current);
        }
        
        // Re-enable auto-scroll after 5 seconds of no user scrolling
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

  // Auto-scroll to active utterance with word-level precision
  useEffect(() => {
    if (activeUtteranceRef.current && isPlaying && autoScroll && !userScrolledRecently) {
      lastAutoScrollTimeRef.current = Date.now();
      activeUtteranceRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }
  }, [currentTimeMs, isPlaying, autoScroll, userScrolledRecently]);

  // Audio time update handler - use requestAnimationFrame for smoother word highlighting
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

    const handlePlay = () => {
      setIsPlaying(true);
      if (!isUpdating) {
        animationFrameId = requestAnimationFrame(updateTime);
      }
    };
    
    const handlePause = () => {
      setIsPlaying(false);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };

    const handleTimeUpdate = () => {
      // Fallback for when RAF isn't running
      if (!isUpdating) {
        setCurrentTimeMs(audio.currentTime * 1000);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [data?.recording.convertedAudioUrl]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const seekTo = (ms: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ms / 1000;
    setCurrentTimeMs(ms);
  };

  const skip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime + seconds);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchTranscript(id, searchQuery);
      setSearchResults(results.results);
      if (results.results.length === 0) {
        toast.info('No results found');
      }
    } catch (error) {
      toast.error('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleExport = async (format: 'docx' | 'txt') => {
    try {
      const response = await fetch(`/api/recordings/${id}/export?format=${format}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcript.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error('Export failed');
    }
  };

  // Create speaker color map
  const speakerColorMap: Record<string, string> = {};
  if (data?.utterances) {
    const uniqueSpeakers = [...new Set(data.utterances.map(u => u.speaker))];
    uniqueSpeakers.forEach((speaker, index) => {
      speakerColorMap[speaker] = SPEAKER_COLORS[index % SPEAKER_COLORS.length];
    });
  }

  // Get speaker label
  const getSpeakerLabel = useCallback((speaker: string, speakerLabel: string | null) => {
    if (speakerLabel) return speakerLabel;
    const label = data?.speakerLabels.find(l => l.speakerId === speaker);
    return label?.label || `Speaker ${speaker}`;
  }, [data?.speakerLabels]);

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

  return (
    <div className="space-y-6">
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
              {recording.durationSeconds && (
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
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <PDFExportDialog 
              recording={recording} 
              utterances={utterances}
              getSpeakerLabel={getSpeakerLabel}
            />
            <DropdownMenuItem onClick={() => handleExport('docx')}>
              <FileText className="h-4 w-4 mr-2" />
              Export as Word (.docx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('txt')}>
              <FileText className="h-4 w-4 mr-2" />
              Export as Text (.txt)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
                
                {/* Progress bar */}
                <div className="space-y-2">
                  <div 
                    className="h-2 bg-muted rounded-full cursor-pointer overflow-hidden"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const percent = (e.clientX - rect.left) / rect.width;
                      const duration = recording.durationSeconds || 0;
                      seekTo(percent * duration * 1000);
                    }}
                  >
                    <div 
                      className="h-full bg-primary transition-all"
                      style={{ 
                        width: `${recording.durationSeconds 
                          ? (currentTimeMs / (recording.durationSeconds * 1000)) * 100 
                          : 0}%` 
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{formatTimestamp(currentTimeMs)}</span>
                    <span>{formatTimestamp((recording.durationSeconds || 0) * 1000)}</span>
                  </div>
                </div>

                {/* Controls */}
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

                {/* Auto-scroll toggle */}
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
                <p className="text-sm">The converted audio file is not accessible</p>
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
                {/* Clickable search results list */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {searchResults.map((result, index) => (
                    <button
                      key={result.id}
                      className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors border border-transparent hover:border-primary/20"
                      onClick={() => {
                        seekTo(result.startMs);
                        // Scroll to the result in the transcript
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
            Click on any segment to jump to that point. Words highlight as they&apos;re spoken.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4" ref={scrollAreaRef}>
            {displayUtterances.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No transcript available</p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayUtterances.map((utterance) => {
                  const isActive = currentTimeMs >= utterance.startMs && currentTimeMs < utterance.endMs;
                  const speakerLabel = getSpeakerLabel(utterance.speaker, utterance.speakerLabel);
                  const searchHighlights = searchResults && 'highlights' in utterance 
                    ? (utterance as SearchResult).highlights 
                    : undefined;
                  
                  return (
                    <div
                      key={utterance.id}
                      id={`utterance-${utterance.id}`}
                      ref={isActive ? activeUtteranceRef : null}
                      className={`
                        p-3 rounded-lg cursor-pointer transition-all
                        ${isActive 
                          ? 'bg-primary/10 border-l-4 border-primary shadow-sm' 
                          : 'hover:bg-muted/50'
                        }
                      `}
                      onClick={() => seekTo(utterance.startMs)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant="secondary" 
                          className={speakerColorMap[utterance.speaker]}
                        >
                          <User className="h-3 w-3 mr-1" />
                          {speakerLabel}
                        </Badge>
                        <SpeakerLabelDialog
                          speaker={utterance.speaker}
                          currentLabel={speakerLabel}
                          recordingId={id}
                          onUpdate={() => refetch()}
                        />
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(utterance.startMs)}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed">
                        <WordHighlightedText
                          text={utterance.text}
                          utteranceStartMs={utterance.startMs}
                          utteranceEndMs={utterance.endMs}
                          currentTimeMs={currentTimeMs}
                          isActive={isActive}
                          searchHighlights={searchHighlights}
                        />
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
