# Audio Playback Reference

wavesurfer.js patterns for synchronized audio playback with transcripts.

## Setup

### Installation
```bash
npm install wavesurfer.js
```

### Basic Component
```typescript
// components/AudioPlayer.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface AudioPlayerProps {
  audioUrl: string;
  onTimeUpdate?: (time: number) => void;
  onReady?: (duration: number) => void;
}

export function AudioPlayer({ audioUrl, onTimeUpdate, onReady }: AudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#4f46e5',
      progressColor: '#818cf8',
      cursorColor: '#1e1b4b',
      height: 80,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
    });

    ws.load(audioUrl);

    ws.on('ready', () => {
      const dur = ws.getDuration();
      setDuration(dur);
      onReady?.(dur);
    });

    ws.on('audioprocess', () => {
      const time = ws.getCurrentTime();
      setCurrentTime(time);
      onTimeUpdate?.(time);
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    wavesurferRef.current = ws;

    return () => ws.destroy();
  }, [audioUrl]);

  const togglePlayPause = () => {
    wavesurferRef.current?.playPause();
  };

  const seekTo = (time: number) => {
    if (wavesurferRef.current && duration > 0) {
      wavesurferRef.current.seekTo(time / duration);
    }
  };

  return (
    <div className="audio-player">
      <div ref={containerRef} className="waveform" />
      <div className="controls">
        <button onClick={togglePlayPause}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
      </div>
    </div>
  );
}
```

## Synchronized Transcript

### Click-to-Seek Pattern
```typescript
// components/TranscriptView.tsx
interface TranscriptViewProps {
  utterances: Utterance[];
  currentTime: number;
  onSeek: (time: number) => void;
  speakerMap: Record<string, string>;
}

export function TranscriptView({ 
  utterances, 
  currentTime, 
  onSeek,
  speakerMap 
}: TranscriptViewProps) {
  // Find active utterance
  const activeIdx = utterances.findIndex(
    u => currentTime >= u.startTime && currentTime <= u.endTime
  );

  return (
    <div className="transcript">
      {utterances.map((utterance, idx) => (
        <div
          key={utterance.id}
          className={cn(
            'utterance',
            idx === activeIdx && 'active'
          )}
          onClick={() => onSeek(utterance.startTime)}
        >
          <span className="speaker">
            {speakerMap[utterance.speaker] || utterance.speaker}
          </span>
          <span className="timestamp">
            {formatTime(utterance.startTime)}
          </span>
          <p className="text">{utterance.text}</p>
        </div>
      ))}
    </div>
  );
}
```

### Auto-scroll to Active
```typescript
const activeRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (activeRef.current) {
    activeRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }
}, [activeIdx]);

// In render:
<div
  ref={idx === activeIdx ? activeRef : null}
  // ...
>
```

## Playback Controls

### Keyboard Shortcuts
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        wavesurferRef.current?.playPause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        skipBackward(5);
        break;
      case 'ArrowRight':
        e.preventDefault();
        skipForward(5);
        break;
      case 'KeyJ':
        skipBackward(10);
        break;
      case 'KeyL':
        skipForward(10);
        break;
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

### Skip Functions
```typescript
const skipForward = (seconds: number) => {
  const ws = wavesurferRef.current;
  if (!ws) return;
  const newTime = Math.min(ws.getCurrentTime() + seconds, duration);
  ws.seekTo(newTime / duration);
};

const skipBackward = (seconds: number) => {
  const ws = wavesurferRef.current;
  if (!ws) return;
  const newTime = Math.max(ws.getCurrentTime() - seconds, 0);
  ws.seekTo(newTime / duration);
};
```

### Playback Speed
```typescript
const [playbackRate, setPlaybackRate] = useState(1);

const changeSpeed = (rate: number) => {
  wavesurferRef.current?.setPlaybackRate(rate);
  setPlaybackRate(rate);
};

// In controls:
<select 
  value={playbackRate} 
  onChange={(e) => changeSpeed(parseFloat(e.target.value))}
>
  <option value="0.5">0.5x</option>
  <option value="0.75">0.75x</option>
  <option value="1">1x</option>
  <option value="1.25">1.25x</option>
  <option value="1.5">1.5x</option>
  <option value="2">2x</option>
</select>
```

## Time Formatting

```typescript
export function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return parts[0] * 60 + parts[1];
}
```

## Search & Highlight

### Search Implementation
```typescript
const [searchTerm, setSearchTerm] = useState('');
const [searchResults, setSearchResults] = useState<number[]>([]);
const [currentResultIdx, setCurrentResultIdx] = useState(-1);

const handleSearch = (term: string) => {
  setSearchTerm(term);
  if (!term) {
    setSearchResults([]);
    return;
  }
  
  const results = utterances
    .map((u, idx) => u.text.toLowerCase().includes(term.toLowerCase()) ? idx : -1)
    .filter(idx => idx !== -1);
  
  setSearchResults(results);
  setCurrentResultIdx(results.length > 0 ? 0 : -1);
};

const navigateResults = (direction: 'next' | 'prev') => {
  if (searchResults.length === 0) return;
  
  let newIdx = direction === 'next' 
    ? (currentResultIdx + 1) % searchResults.length
    : (currentResultIdx - 1 + searchResults.length) % searchResults.length;
  
  setCurrentResultIdx(newIdx);
  onSeek(utterances[searchResults[newIdx]].startTime);
};
```

### Highlight Matches
```typescript
function highlightText(text: string, searchTerm: string) {
  if (!searchTerm) return text;
  
  const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part, i) => 
    regex.test(part) 
      ? <mark key={i} className="bg-yellow-200">{part}</mark>
      : part
  );
}
```

## Styling

```css
/* Waveform container */
.waveform {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 8px;
}

/* Active utterance */
.utterance.active {
  background: #e0e7ff;
  border-left: 3px solid #4f46e5;
}

/* Clickable utterances */
.utterance {
  cursor: pointer;
  padding: 8px 12px;
  transition: background 0.15s;
}

.utterance:hover {
  background: #f5f5f5;
}

/* Speaker label */
.speaker {
  font-weight: 600;
  color: #4f46e5;
}

/* Timestamp */
.timestamp {
  font-size: 0.75rem;
  color: #6b7280;
  font-family: monospace;
}
```
