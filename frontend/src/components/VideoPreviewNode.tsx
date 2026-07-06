import React from 'react';
import { Play } from 'lucide-react';

interface VideoPreviewNodeData {
  shot_key: string;
  shot_name: string;
  video_url?: string;
  cover_url?: string;
  status: string;
  review_status?: string;
  onSelect?: (item: any) => void;
  onRegenerate?: (item: any) => void;
  reject_reason?: string;
}

interface VideoPreviewNodeProps {
  id: string;
  data: VideoPreviewNodeData;
}

export const VideoPreviewNode: React.FC<VideoPreviewNodeProps> = ({ id, data }) => {
  const { shot_key, shot_name, cover_url, status, review_status, onSelect, onRegenerate, reject_reason } = data;

  const getReviewBadge = () => {
    if (review_status === 'approved') {
      return 'text-green-400 bg-green-900/30 border-green-500/30';
    }
    if (review_status === 'rejected') {
      return 'text-red-400 bg-red-900/30 border-red-500/30';
    }
    // pending or empty
    return 'text-amber-400 bg-amber-900/20 border-amber-500/30';
  };

  const getReviewLabel = () => {
    if (review_status === 'approved') return '已通过，可合成';
    if (review_status === 'rejected') return '已驳回';
    return '待审核';
  };

  const handleCardClick = () => {
    onSelect?.(data);
  };

  const handleOpenInspector = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(data);
  };

  const handleRegenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRegenerate?.(data);
  };

  const showRegenerate = status === 'failed' || review_status === 'rejected';

  return (
    <div
      data-testid={`video-preview-node-${shot_key}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      className="bg-[#111827] border border-white/10 rounded-xl p-3 w-40 cursor-pointer"
    >
      {/* Shot name */}
      <div
        className="text-xs text-gray-300 truncate mb-2"
        title={shot_name}
      >
        {shot_name}
      </div>

      {/* Cover thumbnail area */}
      <div
        data-testid={`video-preview-thumbnail-${shot_key}`}
        className="w-full h-16 rounded-lg overflow-hidden mb-2 bg-[#1e293b] flex items-center justify-center"
      >
        {cover_url ? (
          <img
            src={cover_url}
            alt={shot_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-500">
            <Play className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">视频结果</span>
          </div>
        )}
      </div>

      {/* Status and review badges row */}
      <div className="flex items-center gap-1 mb-2">
        <span
          data-testid={`video-preview-node-status-${shot_key}`}
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize"
          style={{
            color: status === 'success' ? '#4ade80' : status === 'failed' ? '#f87171' : status === 'generating' ? '#60a5fa' : '#9ca3af',
            backgroundColor: status === 'success' ? '#14532d' : status === 'failed' ? '#7f1d1d' : status === 'generating' ? '#1e3a5f' : '#374151',
          }}
        >
          {status === 'success' ? '已完成' : status === 'failed' ? '失败' : status === 'generating' ? '生成中' : '待处理'}
        </span>
        <span
          data-testid={`video-preview-node-review-${shot_key}`}
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${getReviewBadge()}`}
        >
          {getReviewLabel()}
        </span>
      </div>

      {/* Rejected reason */}
      {review_status === 'rejected' && reject_reason && (
        <div
          data-testid={`video-preview-node-rejected-reason-${shot_key}`}
          className="text-[9px] text-red-400 truncate mb-2"
          title={reject_reason}
        >
          {reject_reason}
        </div>
      )}

      {/* Merge ready label */}
      {review_status === 'approved' && (
        <div
          data-testid={`video-preview-node-merge-ready-${shot_key}`}
          className="text-[9px] text-green-400 mb-2"
        >
          已通过，可合成
        </div>
      )}

      {/* Regenerate button (only for rejected or failed) */}
      {showRegenerate && (
        <button
          data-testid={`video-preview-node-regenerate-${shot_key}`}
          onClick={handleRegenerate}
          className="w-full text-[9px] text-orange-300 bg-orange-900/20 hover:bg-orange-900/40 rounded py-1 transition-colors mb-1.5"
        >
          重新生成
        </button>
      )}

      {/* Open in inspector button */}
      <button
        data-testid={`video-preview-node-open-inspector-${shot_key}`}
        onClick={handleOpenInspector}
        className="w-full text-[8px] text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded py-1 transition-colors"
      >
        在右侧查看
      </button>
    </div>
  );
};
