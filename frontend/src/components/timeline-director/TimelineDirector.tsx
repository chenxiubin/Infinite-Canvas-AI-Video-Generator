/**
 * TimelineDirector.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * React wrapper for the LTX Director timeline editor.
 * Drop this component anywhere in the project to get a full-featured
 * timeline editor with image/audio/text segments, drag-and-drop, and playback.
 *
 * Usage:
 *   import { TimelineDirector } from './timeline-director/TimelineDirector';
 *
 *   <TimelineDirector
 *     durationFrames={120}
 *     frameRate={24}
 *     initialData={savedJsonString}   // optional: restore from saved state
 *     onChange={(data) => console.log(data)}
 *     onUploadFile={async (file) => ({ name: file.name, url: URL.createObjectURL(file) })}
 *     style={{ height: 520 }}
 *   />
 *
 * Props:
 *   durationFrames  - Total timeline length in frames (default: 120)
 *   frameRate       - FPS, e.g. 24 (default: 24)
 *   initialData     - JSON string to restore timeline state (optional)
 *   onChange        - Called whenever segments change; receives TimelineData
 *   onUploadFile    - Async function to handle file uploads; must return { name, url }
 *                     If omitted, falls back to posting to /api/upload
 *   style           - CSS style for the outer container div
 *   className       - CSS class for the outer container div
 *
 * Data format (TimelineData):
 *   {
 *     segments: Array<{
 *       id: string,
 *       start: number,       // frame index
 *       length: number,      // frames
 *       type: 'image'|'text',
 *       prompt: string,
 *       imageFile?: string,
 *       imageB64?: string,   // URL or data:image/...
 *       guideStrength?: number  // 0-1
 *     }>,
 *     audioSegments: Array<{
 *       id: string,
 *       start: number,
 *       length: number,
 *       type: 'audio',
 *       audioFile?: string,
 *       fileName?: string,
 *       trimStart: number,
 *       audioDurationFrames: number,
 *       waveformPeaks?: number[]
 *     }>
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useRef, useCallback, CSSProperties } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImageSegment {
  id: string;
  start: number;
  length: number;
  type: 'image' | 'text';
  prompt: string;
  imageFile?: string;
  imageB64?: string;
  guideStrength?: number;
  // 10J: Composition director — video asset back-reference metadata
  videoAssetId?: string;
  videoUrl?: string;
  shotKey?: string;
  shotTitle?: string;
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
  waveformPeaks?: number[];
}

export interface TimelineData {
  segments: ImageSegment[];
  audioSegments: AudioSegment[];
}

export interface UploadResult {
  name: string;
  url: string;
  subfolder?: string;
}

export interface TimelineDirectorProps {
  /** Total timeline duration in frames. Default: 120 */
  durationFrames?: number;
  /** Frames per second. Default: 24 */
  frameRate?: number;
  /** JSON string to restore previously saved timeline state */
  initialData?: string;
  /** Called whenever timeline data changes */
  onChange?: (data: TimelineData) => void;
  /** Custom file upload handler. If omitted, falls back to /api/upload */
  onUploadFile?: (file: File) => Promise<UploadResult>;
  style?: CSSProperties;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const TimelineDirector: React.FC<TimelineDirectorProps> = ({
  durationFrames = 120,
  frameRate = 24,
  initialData,
  onChange,
  onUploadFile,
  style,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // ── Bootstrap the upload bridge on window ──────────────────────────────────
  useEffect(() => {
    if (onUploadFile) {
      (window as any).__ltxUploadBridge = async (file: File): Promise<UploadResult> => {
        return onUploadFile(file);
      };
    } else {
      delete (window as any).__ltxUploadBridge;
    }
    return () => {
      delete (window as any).__ltxUploadBridge;
    };
  }, [onUploadFile]);

  // ── Load the core JS and instantiate TimelineEditor ───────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    const init = async () => {
      // Dynamically import the vanilla JS engine.
      // Vite will bundle it as a plain JS asset.
      await import('./ltx-timeline-core.js');

      if (cancelled || !containerRef.current) return;

      const TimelineEditorClass = (window as any).TimelineEditor;
      if (!TimelineEditorClass) {
        console.error('[TimelineDirector] TimelineEditor class not found on window after import');
        return;
      }

      // The "fake node" object that TimelineEditor reads from and writes to
      const fakeNode = {
        durationFrames,
        frameRate,
        ltxTimelineData: initialData || '{}',
        useCustomAudio: false,
        _onCanvasCommit: () => {
          if (editorRef.current && onChangeRef.current) {
            const data = editorRef.current.getTimelineData();
            onChangeRef.current(data);
          }
        },
      };

      try {
        editorRef.current = new TimelineEditorClass(fakeNode, containerRef.current);
      } catch (err) {
        console.error('[TimelineDirector] Failed to initialize TimelineEditor:', err);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (editorRef.current) {
        try { editorRef.current.destroy(); } catch (_) {}
        editorRef.current = null;
      }
    };
  // Only run on mount / unmount. Duration changes go through updateConfig below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync prop changes to the running editor ────────────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.node.durationFrames = durationFrames;
    editor.node.frameRate = frameRate;
    editor.render?.();
  }, [durationFrames, frameRate]);

  // ── Public imperative API (via ref) ───────────────────────────────────────
  // Consumers can access editor.current.getTimelineData() directly if needed.

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        minHeight: 420,
        background: '#1a1a1a',
        borderRadius: 8,
        overflow: 'hidden',
        padding: '8px',
        boxSizing: 'border-box',
        ...style,
      }}
    />
  );
};

export default TimelineDirector;
