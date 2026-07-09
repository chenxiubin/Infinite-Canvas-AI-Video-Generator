# Standalone Timeline Editor Component

This directory contains the standalone timeline editor component extracted from the Infinite Canvas project. It is stripped of all ComfyUI node registrations and AI video generation triggers, leaving a clean, powerful canvas-based double-track (image/text + audio) timeline editor.

## Files

- [TimelineDirector.tsx](./TimelineDirector.tsx): The React TypeScript wrapper component.
- [ltx-timeline-core.js](./ltx-timeline-core.js): The adapted, standalone vanilla JS engine (canvas renderer, input handles, zoom/seek logic).

## Data Structure

The editor outputs the timeline state as a JSON-serializable object whenever changes occur:

```typescript
export interface ImageSegment {
  id: string;
  start: number;       // Start frame
  length: number;      // Duration in frames
  type: 'image' | 'text';
  prompt: string;      // Segment prompt
  imageFile?: string;  // Server path (if uploaded)
  imageB64?: string;   // Preview image URL (absolute URL or blob URL)
  guideStrength?: number; // Guide strength (0.0 to 1.0)
}

export interface AudioSegment {
  id: string;
  start: number;
  length: number;
  type: 'audio';
  audioFile?: string;
  fileName?: string;
  trimStart: number;
  audioDurationFrames: number;
  waveformPeaks?: number[]; // Audio waveform rendering data
}

export interface TimelineData {
  segments: ImageSegment[];
  audioSegments: AudioSegment[];
}
```

## Props

```typescript
export interface TimelineDirectorProps {
  durationFrames?: number; // Total timeline duration (default: 120)
  frameRate?: number;      // Frame rate (default: 24)
  initialData?: string;    // Serialized TimelineData JSON string to restore editor state
  onChange?: (data: TimelineData) => void; // Triggered on every update (drag, resize, upload, text edit)
  onUploadFile?: (file: File) => Promise<{ name: string; url: string; subfolder?: string }>;
  style?: React.CSSProperties;
  className?: string;
}
```

## How to Integrate

### 1. Simple Integration

Add it to your React components:

```tsx
import React, { useState } from 'react';
import { TimelineDirector, TimelineData } from './components/timeline-director/TimelineDirector';

function VideoEditor() {
  const [timeline, setTimeline] = useState<TimelineData>({ segments: [], audioSegments: [] });

  const handleUpload = async (file: File) => {
    // Implement your file upload logic here (e.g. POST to your backend, or return local Blob URL)
    const localUrl = URL.createObjectURL(file);
    return {
      name: file.name,
      url: localUrl
    };
  };

  return (
    <div className="video-editor">
      <TimelineDirector
        durationFrames={240}
        frameRate={24}
        onChange={(data) => {
          setTimeline(data);
          console.log("Timeline updated:", data);
        }}
        onUploadFile={handleUpload}
        style={{ height: 480 }}
      />
    </div>
  );
}
```

### 2. File Uploading

The vanilla timeline engine requires an async API to upload dropped or selected media. 
By default, the core engine attempts to POST to `/api/upload`. 
When you specify the `onUploadFile` prop, the wrapper registers a bridge `window.__ltxUploadBridge` which intercepts all upload requests in the core canvas engine, allowing full customization of file hosting (e.g. uploading to S3, Cloudinary, or a custom FastAPI backend).
