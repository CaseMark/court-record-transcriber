'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Plus, FileAudio, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
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

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['recordings'],
    queryFn: fetchRecordings,
    refetchInterval: 5000, // Poll every 5 seconds for status updates
  });

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
          <CardTitle>Recent Recordings</CardTitle>
          <CardDescription>
            View and manage your transcribed court recordings
          </CardDescription>
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recording</TableHead>
                  <TableHead>Case</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                      {recording.status === 'completed' ? (
                        <Link href={`/recording/${recording.id}`}>
                          <Button variant="outline" size="sm">
                            View Transcript
                          </Button>
                        </Link>
                      ) : recording.status === 'failed' ? (
                        <Button variant="outline" size="sm" disabled>
                          Failed
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
