import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, RotateCcw, AlertCircle, Play, Pause, GripVertical } from 'lucide-react';
import { TimelineDirector } from './timeline-director/TimelineDirector';
import type { TimelineData, ImageSegment } from './timeline-director/TimelineDirector';
import { SHOT_KEYS_DESK, SHOT_KEYS_WALL, SHOT_NAMES_DESK, SHOT_NAMES_WALL } from '../lib/fixedWorkflowLayout';

interface VideoAssetVersion {
  id: string; shotKey: string; shotTitle: string; productLine: string;
  videoUrl: string; thumbnailUrl?: string; createdAt: number;
  versionLabel: string; reviewStatus: 'pending' | 'approved' | 'rejected';
  rejectReason?: string; source: 'single-generate' | 'full-demo' | 'history-restore';
}

export interface CompositionPlanSegment {
  id: string;
  shotKey: string;
  shotTitle: string;
  videoAssetId: string;
  videoUrl: string;
  startFrame: number;
  lengthFrames: number;
  order: number;
}

export interface CompositionPlan {
  productLine: string;
  updatedAt: number;
  segments: CompositionPlanSegment[];
  audioSegments: any[];
}

export function deriveCompositionPlan(
  timelineData: TimelineData | undefined,
  productLine: string,
): CompositionPlan | null {
  if (!timelineData || !timelineData.segments?.length) return null;
  return {
    productLine,
    updatedAt: Date.now(),
    segments: timelineData.segments.map((seg, i) => ({
      id: seg.id,
      shotKey: (seg as any).shotKey || '',
      shotTitle: (seg as any).shotTitle || seg.prompt || '',
      videoAssetId: (seg as any).videoAssetId || '',
      videoUrl: (seg as any).videoUrl || seg.imageB64 || '',
      startFrame: seg.start,
      lengthFrames: seg.length,
      order: i,
    })),
    audioSegments: timelineData.audioSegments || [],
  };
}

interface CompositionDirectorPanelProps {
  isOpen: boolean;
  productLine: 'desk_calendar' | 'wall_calendar';
  videoAssetsByShot: Record<string, VideoAssetVersion[]>;
  currentVideoByShot: Record<string, string>;
  savedTimelineData?: TimelineData;
  canMerge?: boolean;
  mergeStatus?: string;
  onClose: () => void;
  onChange: (data: TimelineData) => void;
}

const DEFAULT_LENGTH_FRAMES = 72;
const FRAME_RATE = 24;
const DEFAULT_TOTAL_SECONDS = 24;

function generateDefaultSegments(
  productLine: 'desk_calendar' | 'wall_calendar',
  videoAssetsByShot: Record<string, VideoAssetVersion[]>,
  currentVideoByShot: Record<string, string>,
): ImageSegment[] {
  const isWall = productLine === 'wall_calendar';
  const baseShotKeys = isWall ? SHOT_KEYS_WALL : SHOT_KEYS_DESK;
  const shotNames = isWall ? SHOT_NAMES_WALL : SHOT_NAMES_DESK;

  const allKeys = new Set(baseShotKeys);
  Object.keys(currentVideoByShot).forEach(sk => allKeys.add(sk));

  const orderedKeys = [
    ...baseShotKeys.filter(sk => allKeys.has(sk)),
    ...[...allKeys].filter(sk => !baseShotKeys.includes(sk)).sort(),
  ];

  const approved = orderedKeys.filter(sk => {
    const cid = currentVideoByShot[sk];
    if (!cid) return false;
    return (videoAssetsByShot[sk] || []).some(v => v.id === cid && v.reviewStatus === 'approved');
  });

  const perShotFrames = Math.floor(DEFAULT_TOTAL_SECONDS * FRAME_RATE / (approved.length || 1));

  return approved.map((sk, index) => {
    const cid = currentVideoByShot[sk];
    const video = (videoAssetsByShot[sk] || []).find(v => v.id === cid)!;
    return {
      id: `timeline-${sk}-${video.id.slice(-8)}`,
      start: index * perShotFrames,
      length: perShotFrames,
      type: 'image' as const,
      prompt: shotNames[sk] || sk,
      imageB64: video.thumbnailUrl || video.videoUrl,
      videoAssetId: video.id,
      videoUrl: video.videoUrl,
      shotKey: sk,
      shotTitle: shotNames[sk] || sk,
    };
  });
}

export const CompositionDirectorPanel: React.FC<CompositionDirectorPanelProps> = ({
  isOpen,
  productLine,
  videoAssetsByShot,
  currentVideoByShot,
  savedTimelineData,
  canMerge,
  mergeStatus,
  onClose,
  onChange,
}) => {
  const [resetCounter, setResetCounter] = useState(0);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [totalDurationSeconds, setTotalDurationSeconds] = useState(DEFAULT_TOTAL_SECONDS);
  const videoRef = useRef<HTMLVideoElement>(null);

  const currentDefaults = useMemo(
    () => generateDefaultSegments(productLine, videoAssetsByShot, currentVideoByShot),
    [productLine, videoAssetsByShot, currentVideoByShot],
  );

  const activeSegments = savedTimelineData?.segments?.length
    ? savedTimelineData.segments
    : currentDefaults;
  const segmentCount = activeSegments.length;
  const hasSegments = segmentCount > 0;
  const totalFrames = totalDurationSeconds * FRAME_RATE;

  useEffect(() => {
    if (isOpen) {
      setCurrentPreviewIndex(0);
      setIsPreviewPlaying(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !savedTimelineData) {
      const defaults: TimelineData = { segments: currentDefaults, audioSegments: [] };
      onChange(defaults);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = () => {
    setTotalDurationSeconds(DEFAULT_TOTAL_SECONDS);
    const defaults: TimelineData = {
      segments: generateDefaultSegments(productLine, videoAssetsByShot, currentVideoByShot),
      audioSegments: [],
    };
    onChange(defaults);
    setResetCounter(c => c + 1);
    setCurrentPreviewIndex(0);
    setIsPreviewPlaying(false);
  };

  const handleAverageAllocation = () => {
    if (!hasSegments) return;
    const perShotFrames = Math.floor(totalFrames / segmentCount);
    const updated = activeSegments.map((seg, i) => ({
      ...seg,
      start: i * perShotFrames,
      length: perShotFrames,
    }));
    onChange({ segments: updated, audioSegments: savedTimelineData?.audioSegments || [] });
    setResetCounter(c => c + 1);
  };

  const handleSegmentClick = useCallback((index: number) => {
    setCurrentPreviewIndex(index);
    setIsPreviewPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPreviewPlaying(p => {
      const next = !p;
      if (videoRef.current) {
        if (next) videoRef.current.play().catch(() => {});
        else videoRef.current.pause();
      }
      return next;
    });
  }, []);

  // Drag sort
  const dragIndexRef = useRef<number>(-1);
  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent, _index: number) => {
    e.preventDefault();
  }, []);
  const handleDrop = useCallback((dropIndex: number) => {
    const dragIndex = dragIndexRef.current;
    if (dragIndex < 0 || dragIndex === dropIndex) return;
    const reordered = [...activeSegments];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    // Recalculate start positions
    const updated = reordered.map((seg, i) => ({ ...seg, start: i * (seg.length || DEFAULT_LENGTH_FRAMES), order: i }));
    onChange({ segments: updated, audioSegments: savedTimelineData?.audioSegments || [] });
    setCurrentPreviewIndex(dropIndex);
    dragIndexRef.current = -1;
  }, [activeSegments, savedTimelineData, onChange]);

  // Trim segment duration
  const FRAMES_PER_HALF_SEC = 12; // 0.5s at 24fps
  const handleTrimSegment = useCallback((segIndex: number, delta: number) => {
    const updated = activeSegments.map((seg, i) => {
      if (i !== segIndex) return seg;
      const newLength = Math.max(FRAMES_PER_HALF_SEC, (seg.length || DEFAULT_LENGTH_FRAMES) + delta);
      return { ...seg, length: newLength };
    });
    // Recalculate start positions
    let currentStart = 0;
    const repositioned = updated.map((seg, i) => {
      const s = { ...seg, start: currentStart, order: i };
      currentStart += seg.length || DEFAULT_LENGTH_FRAMES;
      return s;
    });
    onChange({ segments: repositioned, audioSegments: savedTimelineData?.audioSegments || [] });
  }, [activeSegments, savedTimelineData, onChange]);

  if (!isOpen) return null;

  const currentSegment = hasSegments ? activeSegments[currentPreviewIndex] : null;
  const mediaUrl = (currentSegment as any)?.videoUrl || currentSegment?.imageB64 || '';
  const segmentTitle = (currentSegment as any)?.shotTitle || currentSegment?.prompt || '';
  const segmentShotKey = (currentSegment as any)?.shotKey || '';

  const initialString = JSON.stringify(
    savedTimelineData || { segments: currentDefaults, audioSegments: [] },
  );

  // Format seconds from frame count
  const formatSeconds = (frames: number) => (frames / FRAME_RATE).toFixed(1) + 's';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-[#0d1117] border border-white/10 rounded-xl shadow-2xl w-[95vw] max-w-[1400px] h-[92vh] flex flex-col overflow-hidden">
        {/* ── Header ── */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-[#111827]">
          <div className="flex items-center gap-3">
            <h2 data-testid="director-title" className="text-sm font-semibold text-gray-200">总合成导演台</h2>
            <span className="text-[10px] text-gray-500">
              {productLine === 'wall_calendar' ? '挂历' : '台历'} · {segmentCount} 个片段 · 总时长 {totalDurationSeconds}s
            </span>
            {mergeStatus && (
              <span className={`text-[9px] ${canMerge ? 'text-green-400' : 'text-amber-400'}`}>{mergeStatus}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasSegments && (
              <button data-testid="director-reset-button" onClick={handleReset}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-200 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors">
                <RotateCcw className="w-3 h-3" />重置为当前分镜顺序
              </button>
            )}
            <button data-testid="director-close-button" onClick={onClose}
              className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-white/5 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Large Preview Stage ── */}
        <div data-testid="composition-preview-stage"
          className="flex-shrink-0 border-b border-white/5 bg-black relative"
          style={{ minHeight: 300, maxHeight: 420 }}>
          {!hasSegments ? (
            <div data-testid="composition-preview-empty" className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-2">
              <AlertCircle className="w-8 h-8 text-gray-600" />
              <div className="text-sm">暂无预览</div>
              <div className="text-[10px] text-gray-600">请先运行完整演示，或生成并审核全部分镜视频</div>
            </div>
          ) : (
            <>
              {/* Media */}
              <div className="absolute inset-0 flex items-center justify-center">
                {mediaUrl ? (
                  (currentSegment as any)?.videoUrl ? (
                    <video ref={videoRef} data-testid="composition-preview-media"
                      src={mediaUrl} className="max-w-full max-h-full object-contain" muted loop />
                  ) : (
                    <img data-testid="composition-preview-media"
                      src={mediaUrl} alt={segmentTitle} className="max-w-full max-h-full object-contain" />
                  )
                ) : (
                  <span className="text-gray-600 text-sm">无画面</span>
                )}
              </div>
              {/* Overlay info bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 flex items-center justify-between">
                <div>
                  <div data-testid="composition-preview-title" className="text-sm font-medium text-white">
                    {segmentShotKey && <span className="text-purple-400 mr-2">{segmentShotKey}</span>}
                    {segmentTitle}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {currentSegment ? formatSeconds(currentSegment.length) : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button data-testid="composition-preview-play-toggle" onClick={togglePlay}
                    className="text-white bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors"
                    title={isPreviewPlaying ? '暂停' : '播放'}>
                    {isPreviewPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                  <span data-testid="composition-preview-counter" className="text-[11px] text-gray-300">
                    {currentPreviewIndex + 1} / {segmentCount}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Duration Settings ── */}
        <div data-testid="composition-duration-settings"
          className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-[#0a0f1a] border-b border-white/5">
          <span className="text-[10px] text-gray-500">总时长：</span>
          {[24, 30, 60].map(s => (
            <button key={s} data-testid={`duration-preset-${s}`}
              onClick={() => setTotalDurationSeconds(s)}
              className={`text-[10px] px-2.5 py-1 rounded transition-colors ${
                totalDurationSeconds === s ? 'bg-purple-800/40 text-purple-300' : 'bg-white/5 text-gray-400 hover:text-gray-200'
              }`}>{s}秒</button>
          ))}
          <input data-testid="duration-custom-input" type="number" min={1} max={300} value={totalDurationSeconds}
            onChange={e => setTotalDurationSeconds(Number(e.target.value) || DEFAULT_TOTAL_SECONDS)}
            className="w-16 text-[10px] bg-[#111827] border border-white/10 rounded px-2 py-1 text-gray-300 text-center" />
          <span className="text-[9px] text-gray-600">秒 · {totalFrames} 帧</span>
          <button data-testid="duration-average-button" onClick={handleAverageAllocation}
            className="text-[10px] bg-purple-800/30 hover:bg-purple-700/40 text-purple-300 px-3 py-1 rounded transition-colors">
            平均分配到所有分镜
          </button>
        </div>

        {/* ── Shot Timeline Track ── */}
        {hasSegments && (
          <div data-testid="composition-shot-timeline-track"
            className="flex-shrink-0 border-b border-white/5 bg-[#0a0f1a] px-4 py-2 overflow-x-auto">
            <div className="text-[9px] text-gray-500 mb-1.5">分镜视频轨道</div>
            <div className="flex gap-1.5 min-w-max">
              {activeSegments.map((seg: any, i: number) => (
                <div key={seg.id} data-testid={`composition-shot-segment-${seg.shotKey || i}`}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={() => handleDrop(i)}
                  onClick={() => handleSegmentClick(i)}
                  className={`flex-shrink-0 rounded-lg border px-2.5 py-1.5 cursor-pointer transition-colors min-w-[120px] ${
                    i === currentPreviewIndex
                      ? 'bg-purple-900/30 border-purple-500/40 ring-1 ring-purple-500/20'
                      : 'bg-[#111827] border-white/10 hover:border-white/20'
                  }`}>
                  <div className="flex items-center gap-1.5">
                    <GripVertical className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-medium text-gray-200 truncate">
                        {seg.shotKey || `片段 ${i + 1}`}
                      </div>
                      <div className="text-[8px] text-gray-500 truncate">
                        {seg.shotTitle || seg.prompt || ''}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <button
                          data-testid={`composition-segment-trim-minus-${seg.shotKey || i}`}
                          onClick={(e) => { e.stopPropagation(); handleTrimSegment(i, -FRAMES_PER_HALF_SEC); }}
                          className="text-[9px] text-gray-500 hover:text-gray-200 bg-white/5 hover:bg-white/10 rounded px-1 leading-none"
                          title="减少0.5秒"
                        >−</button>
                        <span data-testid={`composition-shot-segment-duration-${seg.shotKey || i}`}
                          className="text-[7px] text-gray-500 min-w-[28px] text-center">
                          {formatSeconds(seg.length || 0)}
                        </span>
                        <button
                          data-testid={`composition-segment-trim-plus-${seg.shotKey || i}`}
                          onClick={(e) => { e.stopPropagation(); handleTrimSegment(i, FRAMES_PER_HALF_SEC); }}
                          className="text-[9px] text-gray-500 hover:text-gray-200 bg-white/5 hover:bg-white/10 rounded px-1 leading-none"
                          title="增加0.5秒"
                        >+</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Audio Track ── */}
        <div data-testid="composition-audio-track"
          className="flex-shrink-0 border-b border-white/5 bg-[#0a0f1a] px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-gray-500">音频轨道</span>
            <label data-testid="composition-audio-add-button"
              className="text-[9px] text-purple-400 hover:text-purple-300 cursor-pointer bg-purple-900/20 hover:bg-purple-800/30 px-2 py-0.5 rounded transition-colors">
              添加背景音乐
              <input type="file" accept="audio/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const url = URL.createObjectURL(file);
                  const newAudio = {
                    id: `audio-${Date.now()}`,
                    start: 0,
                    length: Math.round(file.duration || 60) * FRAME_RATE,
                    type: 'audio' as const,
                    fileName: file.name,
                    audioFile: url,
                    trimStart: 0,
                    audioDurationFrames: Math.round((file.duration || 60) * FRAME_RATE),
                    waveformPeaks: [],
                  };
                  const updated = {
                    segments: activeSegments,
                    audioSegments: [...(savedTimelineData?.audioSegments || []), newAudio],
                  };
                  onChange(updated);
                }}
              />
            </label>
          </div>
          {(savedTimelineData?.audioSegments || []).length === 0 ? (
            <div data-testid="composition-audio-empty" className="text-[10px] text-gray-600 py-3 text-center">
              暂无音频
            </div>
          ) : (
            <div className="flex gap-1.5 mt-1.5 min-w-max">
              {(savedTimelineData?.audioSegments || []).map((aseg: any) => (
                <div key={aseg.id} data-testid={`composition-audio-segment-${aseg.id}`}
                  className="flex-shrink-0 rounded border border-purple-500/20 bg-purple-900/10 px-2 py-1 text-[9px] text-purple-300">
                  {aseg.fileName || '音频片段'}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Timeline Area ── */}
        <div className="flex-1 min-h-0 p-4" data-testid="composition-timeline-area">
          {!hasSegments ? (
            <div data-testid="director-empty-state" className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
              <AlertCircle className="w-8 h-8 text-gray-600" />
              <div className="text-sm">暂无可编排视频</div>
              <div className="text-[11px] text-gray-600 text-center max-w-xs">请先运行完整演示，或生成并审核全部分镜视频</div>
            </div>
          ) : (
            <TimelineDirector
              key={resetCounter}
              durationFrames={Math.max(totalFrames, segmentCount * DEFAULT_LENGTH_FRAMES)}
              frameRate={FRAME_RATE}
              initialData={initialString}
              onChange={onChange}
              onUploadFile={async (file: File) => ({
                name: file.name,
                url: URL.createObjectURL(file),
              })}
              style={{ height: '100%', minHeight: 0 }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default CompositionDirectorPanel;
