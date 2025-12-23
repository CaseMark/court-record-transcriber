'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Upload, FileAudio, X, Loader2, CheckCircle } from 'lucide-react';

const ACCEPTED_FORMATS = {
  'audio/*': ['.ftr', '.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'],
  'video/*': ['.mp4', '.webm', '.mov'],
};

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  
  // Form fields
  const [caseNumber, setCaseNumber] = useState('');
  const [courtName, setCourtName] = useState('');
  const [recordingDate, setRecordingDate] = useState('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setStatus('idle');
      setUploadProgress(0);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FORMATS,
    maxFiles: 1,
    multiple: false,
  });

  const handleUpload = async () => {
    if (!file) return;

    try {
      setStatus('uploading');
      setUploadProgress(0);

      // Step 1: Create recording and get upload URL
      const createResponse = await fetch('/api/recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          fileSizeBytes: file.size,
          caseNumber: caseNumber || null,
          courtName: courtName || null,
          recordingDate: recordingDate || null,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create recording');
      }

      const { recording, uploadUrl } = await createResponse.json();
      setRecordingId(recording.id);

      // Step 2: Upload file to presigned URL (or simulate for dev)
      if (uploadUrl) {
        // Real upload to S3
        const xhr = new XMLHttpRequest();
        
        await new Promise<void>((resolve, reject) => {
          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100);
              setUploadProgress(progress);
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          });

          xhr.addEventListener('error', () => reject(new Error('Upload failed')));

          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          xhr.send(file);
        });
      } else {
        // Simulate upload progress for development
        for (let i = 0; i <= 100; i += 10) {
          await new Promise(resolve => setTimeout(resolve, 100));
          setUploadProgress(i);
        }
      }

      // Step 3: Trigger processing
      setStatus('processing');
      
      const processResponse = await fetch(`/api/recordings/${recording.id}/process`, {
        method: 'POST',
      });

      if (!processResponse.ok) {
        const error = await processResponse.json();
        console.warn('Processing may not have started:', error);
        // Don't fail - the recording is created, processing can be retried
      }

      setStatus('complete');
      toast.success('Recording uploaded successfully!', {
        description: 'Transcription will begin shortly.',
      });

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/');
      }, 2000);

    } catch (error) {
      console.error('Upload error:', error);
      setStatus('error');
      toast.error('Upload failed', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  };

  const clearFile = () => {
    setFile(null);
    setStatus('idle');
    setUploadProgress(0);
    setRecordingId(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload Recording</h1>
        <p className="text-muted-foreground">
          Upload FTR court recordings or standard audio files for transcription
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select File</CardTitle>
          <CardDescription>
            Supported formats: FTR, MP3, WAV, M4A, FLAC, MP4, WebM
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!file ? (
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
                transition-colors
                ${isDragActive 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted-foreground/25 hover:border-primary/50'
                }
              `}
            >
              <input {...getInputProps()} />
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              {isDragActive ? (
                <p className="text-lg font-medium">Drop the file here...</p>
              ) : (
                <>
                  <p className="text-lg font-medium mb-1">
                    Drag & drop a recording here
                  </p>
                  <p className="text-sm text-muted-foreground">
                    or click to browse files
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                    <FileAudio className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-medium">{file.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </div>
                  </div>
                </div>
                {status === 'idle' && (
                  <Button variant="ghost" size="icon" onClick={clearFile}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
                {status === 'complete' && (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                )}
              </div>

              {(status === 'uploading' || status === 'processing') && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {status === 'uploading' ? 'Uploading...' : 'Processing...'}
                    </span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={status === 'processing' ? 100 : uploadProgress} />
                  {status === 'processing' && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Starting transcription pipeline...
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recording Details</CardTitle>
          <CardDescription>
            Optional metadata to help organize your transcripts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="caseNumber" className="text-sm font-medium">
                Case Number
              </label>
              <Input
                id="caseNumber"
                placeholder="e.g., 2024-CV-12345"
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                disabled={status !== 'idle'}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="courtName" className="text-sm font-medium">
                Court Name
              </label>
              <Input
                id="courtName"
                placeholder="e.g., Superior Court of California"
                value={courtName}
                onChange={(e) => setCourtName(e.target.value)}
                disabled={status !== 'idle'}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="recordingDate" className="text-sm font-medium">
              Recording Date
            </label>
            <Input
              id="recordingDate"
              type="date"
              value={recordingDate}
              onChange={(e) => setRecordingDate(e.target.value)}
              disabled={status !== 'idle'}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => router.push('/')}>
          Cancel
        </Button>
        <Button
          onClick={handleUpload}
          disabled={!file || status !== 'idle'}
        >
          {status === 'uploading' && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          {status === 'idle' && 'Upload & Transcribe'}
          {status === 'uploading' && 'Uploading...'}
          {status === 'processing' && 'Processing...'}
          {status === 'complete' && 'Complete!'}
          {status === 'error' && 'Try Again'}
        </Button>
      </div>
    </div>
  );
}
