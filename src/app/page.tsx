'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { toast } from 'sonner';
import { 
  Plus, 
  FileAudio, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  LayoutList, 
  LayoutGrid,
  MoreHorizontal,
  Eye,
  Trash2
} from 'lucide-react';

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
  createdAt: string;
}

async function fetchRecordings(): Promise<{ recordings: Recording[] }> {
  const response = await fetch('/api/recordings');
  if (!response.ok) {
    throw new Error('Failed to fetch recordings');
  }
  return response.json();
}

// Sync transcription status for recordings that are still processing
async function syncProcessingRecordings(recordings: Recording[]): Promise<void> {
  const processingRecordings = recordings.filter(
    r => r.status === 'transcribing' || r.status === 'converting'
  );
  
  // Sync each processing recording in parallel
  await Promise.all(
    processingRecordings.map(async (recording) => {
      try {
        await fetch(`/api/recordings/${recording.id}/process`);
      } catch (e) {
        console.error(`Failed to sync recording ${recording.id}:`, e);
      }
    })
  );
}

async function deleteRecording(id: string): Promise<void> {
  const response = await fetch(`/api/recordings/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete recording');
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined || seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
    uploading: { variant: 'secondary', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    converting: { variant: 'secondary', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    transcribing: { variant: 'secondary', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    completed: { variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
    failed: { variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
  };

  const { variant, icon } = variants[status] || { variant: 'outline' as const, icon: null };

  return (
    <Badge variant={variant} className="flex items-center gap-1">
      {icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function RecordingCard({ recording, onDelete }: { recording: Recording; onDelete: (recording: Recording) => void }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
              <FileAudio className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <div className="font-medium line-clamp-1">{recording.filename}</div>
              <div className="text-sm text-muted-foreground">
                {formatFileSize(recording.fileSizeBytes)} • {recording.originalFormat.toUpperCase()}
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <Link href={`/recording/${recording.id}`}>
                <DropdownMenuItem>
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
              </Link>
              <DropdownMenuItem 
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(recording)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="mt-4 space-y-2">
          {recording.caseNumber && (
            <div className="text-sm">
              <span className="text-muted-foreground">Case:</span>{' '}
              <span className="font-medium">{recording.caseNumber}</span>
            </div>
          )}
          {recording.courtName && (
            <div className="text-sm text-muted-foreground line-clamp-1">
              {recording.courtName}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <StatusBadge status={recording.status} />
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDuration(recording.durationSeconds)}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
          Uploaded {formatDistanceToNow(new Date(recording.createdAt), { addSuffix: true })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recordingToDelete, setRecordingToDelete] = useState<Recording | null>(null);
  
  const queryClient = useQueryClient();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['recordings'],
    queryFn: async () => {
      const result = await fetchRecordings();
      // Sync any processing recordings with Case.dev to check for completion
      // This handles the case where webhooks can't reach localhost
      await syncProcessingRecordings(result.recordings);
      // Refetch to get updated statuses after sync
      const updatedResult = await fetchRecordings();
      return updatedResult;
    },
    refetchInterval: 5000, // Poll every 5 seconds for status updates
  });

  // Calculate dynamic height based on number of recordings
  // Each row is approximately 72px, header is 40px, min 200px, max 600px
  const recordingCount = data?.recordings.length || 0;
  const calculatedHeight = Math.min(600, Math.max(200, recordingCount * 72 + 40));

  const deleteMutation = useMutation({
    mutationFn: deleteRecording,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recordings'] });
      toast.success('Recording deleted successfully');
      setDeleteDialogOpen(false);
      setRecordingToDelete(null);
    },
    onError: (error: Error) => {
      toast.error('Failed to delete recording', {
        description: error.message,
      });
    },
  });

  const handleDeleteClick = (recording: Recording) => {
    setRecordingToDelete(recording);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (recordingToDelete) {
      deleteMutation.mutate(recordingToDelete.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Court Recordings</h1>
          <p className="text-muted-foreground">
            Upload and transcribe court recordings with speaker identification
          </p>
        </div>
        <Link href="/upload">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Upload Recording
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Recordings</CardTitle>
              <CardDescription>
                View and manage your transcribed court recordings
              </CardDescription>
            </div>
            <div className="flex items-center gap-1 border rounded-lg p-1">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="h-8 px-2"
              >
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('card')}
                className="h-8 px-2"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-12 rounded" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p>Failed to load recordings</p>
            </div>
          ) : data?.recordings.length === 0 ? (
            <div className="text-center py-12">
              <FileAudio className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No recordings yet</h3>
              <p className="text-muted-foreground mb-4">
                Upload your first court recording to get started
              </p>
              <Link href="/upload">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Upload Recording
                </Button>
              </Link>
            </div>
          ) : viewMode === 'list' ? (
            <ScrollArea style={{ height: `${calculatedHeight}px` }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recording</TableHead>
                    <TableHead>Case</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.recordings.map((recording) => (
                    <TableRow key={recording.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                            <FileAudio className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="font-medium">{recording.filename}</div>
                            <div className="text-sm text-muted-foreground">
                              {formatFileSize(recording.fileSizeBytes)} • {recording.originalFormat.toUpperCase()}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {recording.caseNumber ? (
                          <div>
                            <div className="font-medium">{recording.caseNumber}</div>
                            {recording.courtName && (
                              <div className="text-sm text-muted-foreground">{recording.courtName}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {formatDuration(recording.durationSeconds)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={recording.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(recording.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/recording/${recording.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </Link>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDeleteClick(recording)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <ScrollArea style={{ height: `${calculatedHeight}px` }}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data?.recordings.map((recording) => (
                  <RecordingCard 
                    key={recording.id} 
                    recording={recording} 
                    onDelete={handleDeleteClick}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Recording</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{recordingToDelete?.filename}&quot;? 
              This will permanently remove the recording and all associated transcripts. 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
