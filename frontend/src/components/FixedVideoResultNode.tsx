import React, { useRef, useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';

interface Props {
  id: string;
  data: { shot_key: string; shot_name: string; product_line: string; currentVideo?: any; generating?: boolean; generationProgress?: number };
}

const hasVideo = (cv: any) => cv && typeof cv.videoUrl === 'string' && cv.videoUrl.length > 0;

export const FixedVideoResultNode: React.FC<Props> = ({ data }) => {
  const sk = data.shot_key;
  const cv = data.currentVideo;
  const showVideo = hasVideo(cv);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const handleLoaded = useCallback(() => {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return;
    // Seek to first frame for poster display
    v.currentTime = Math.min(0.1, v.duration || 0.1);
    v.pause();
  }, []);

  const handlePlayPause = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  return (
    <div data-testid={`fixed-video-node-${sk}`} className="bg-[#111827] border border-white/10 rounded-xl p-3 w-36 relative">
      <Handle type="target" position={Position.Top} id="target" data-testid={`video-target-handle-${sk}`} style={{ background: '#3b82f6', width: 10, height: 10, border: '2px solid #60a5fa' }} title="视频输入" />
      <Handle type="source" position={Position.Bottom} id="source" data-testid={`video-source-handle-${sk}`} style={{ background: '#3b82f6', width: 10, height: 10, border: '2px solid #60a5fa' }} title="合成输出" />
      <div className="absolute left-1 top-2 bottom-2 flex flex-col gap-1.5">
        <div className={`w-1 h-1 rounded-full ${cv ? 'bg-blue-400' : 'bg-gray-700'}`} />
        <div className={`w-1 h-1 rounded-full ${cv ? 'bg-blue-400' : 'bg-gray-700'}`} />
        <div className={`w-1 h-1 rounded-full ${cv ? 'bg-blue-400' : 'bg-gray-700'}`} />
        <div className={`w-1 h-1 rounded-full ${cv ? 'bg-blue-400' : 'bg-gray-700'}`} />
      </div>
      <div className="text-[9px] text-gray-500 pl-2">{sk}</div>
      <div data-testid={`fixed-video-node-placeholder-${sk}`} className="aspect-video bg-[#0a0f1a] rounded-lg flex items-center justify-center border border-white/5 mt-1 relative overflow-hidden">
        {/* Real video layer */}
        {showVideo && (
          <video
            ref={videoRef}
            key={cv.id}
            data-testid={`fixed-video-preview-${sk}`}
            src={cv.videoUrl}
            preload="metadata"
            muted
            playsInline
            className="nodrag nowheel absolute inset-0 w-full h-full object-cover"
            onLoadedMetadata={handleLoaded}
            onLoadedData={handleLoaded}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        )}
        {/* Play button overlay */}
        {showVideo ? (
          <button
            data-testid={`fixed-video-play-${sk}`}
            className="nodrag nowheel absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors cursor-pointer z-10"
            onClick={handlePlayPause}
            title={playing ? '暂停' : '播放'}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${playing ? 'bg-white/10 border border-white/30' : 'bg-purple-500/40 border border-purple-400/40'}`}>
              <span className="text-white/90 text-[10px] leading-none ml-0.5">{playing ? '⏸' : '▶'}</span>
            </div>
          </button>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full bg-black/50 border border-white/20 flex items-center justify-center">
              <span className="text-white/70 text-[10px] leading-none ml-0.5">▶</span>
            </div>
          </div>
        )}
        {/* Version label */}
        {showVideo && (
          <span data-testid={`fixed-video-node-label-${sk}`} className="absolute bottom-1 left-1 text-[6px] text-purple-300 z-20">{cv.versionLabel}</span>
        )}
        {/* Waiting text when no video */}
        {!showVideo && (
          <span className="text-[8px] text-gray-600">等待生成</span>
        )}
      </div>
      <div data-testid={`fixed-video-node-status-${sk}`} className="text-[8px] mt-1 text-center">
        {data.generating ? (
          <span data-testid={`fixed-video-node-review-status-${sk}`} className="text-blue-400">
            {data.generationProgress != null ? `生成中 ${data.generationProgress}%` : '生成中'}
          </span>
        ) : showVideo ? (
          <span data-testid={`fixed-video-node-review-status-${sk}`} className={cv.reviewStatus === 'approved' ? 'text-green-400' : cv.reviewStatus === 'rejected' ? 'text-red-400' : 'text-amber-400'}>
            {cv.reviewStatus === 'approved' ? '已通过，可合成' : cv.reviewStatus === 'rejected' ? '已驳回' : '待审核'} · {cv.versionLabel}
          </span>
        ) : (
          <span data-testid={`fixed-video-node-review-status-${sk}`} className="text-gray-600">未生成</span>
        )}
      </div>
    </div>
  );
};
