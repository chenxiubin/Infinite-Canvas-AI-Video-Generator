import React from 'react';
import { Play, AlertTriangle } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';

interface Props {
  id: string;
  data: {
    shot_key: string; shot_name: string; product_line: string;
    onSelectShot?: (sk: string) => void;
    onGenerate?: (nodeId: string, shotKey: string) => void;
    nodeId?: string;
    hasStartFrame?: boolean;
    disabledReason?: string;
    generating?: boolean;
    connectingAssetId?: string | null;
    onConnectBinding?: (shotKey: string, frameType: string, assetId: string) => void;
    nodeStatus?: string;
    nodeReviewStatus?: string;
    // 10E: Derived reference images for this shot
    shotReferences?: { id: string; sourceNodeId: string; imageUrl?: string; fileName?: string; kind: string; status: string; order: number }[];
  };
}

export const ShotControlNode: React.FC<Props> = ({ data }) => {
  const sk = data.shot_key;
  const nodeId = data.nodeId || '';
  const hasStartFrame = data.hasStartFrame !== false;
  const disabled = !nodeId || !hasStartFrame;
  const disabledReason = data.disabledReason || (!nodeId ? '请先生成批次' : '缺少首帧');
  const generating = data.generating || false;
  const isConnecting = !!data.connectingAssetId;

  const handleFrameClick = (frameType: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConnecting && data.connectingAssetId) {
      data.onConnectBinding?.(sk, frameType, data.connectingAssetId);
    }
  };

  return (
    <div data-testid={`shot-control-node-${sk}`} onClick={() => data.onSelectShot?.(sk)}
      className={`nodrag bg-[#1a1f2e] border border-white/10 border-l-2 border-l-purple-500/40 hover:border-purple-500/30 rounded-xl p-3 w-44 cursor-pointer transition-colors ${isConnecting ? 'border-purple-400/50 ring-2 ring-purple-500/20' : ''}`}>
      {/* Reference image input — purple, left-center */}
      <Handle type="target" position={Position.Left} id="target" data-testid={`shot-reference-target-handle-${sk}`} style={{ background: '#8b5cf6', width: 10, height: 10, border: '2px solid #a78bfa' }} title="参考图输入" />
      {/* Video output — blue, right-center */}
      <Handle type="source" position={Position.Right} id="source" data-testid={`shot-video-source-handle-${sk}`} style={{ background: '#3b82f6', width: 10, height: 10, border: '2px solid #60a5fa' }} title="视频生成输出" />

      <div className="text-xs font-semibold text-gray-200 truncate">{sk}</div>
      <div className="text-[9px] text-gray-500 mt-0.5">{data.shot_name}</div>
      {/* 10E: Dynamic reference strip from shotReferences */}
      <div data-testid={`shot-control-reference-strip-${sk}`} className="flex gap-1 mt-2 flex-wrap">
        {(() => {
          const refs = (data as any).shotReferences || [] as any[];
          const ready = refs.filter((r: any) => r.status === 'ready');
          if (ready.length === 0) {
            return <div className="w-8 h-10 bg-[#0a0f1a] rounded border border-white/5 flex items-center justify-center text-[7px] text-gray-600">缺图</div>;
          }
          const maxShow = 2;
          return (
            <>
              {ready.slice(0, maxShow).map((r: any, i: number) => (
                <div key={r.id} data-testid={`shot-ref-thumb-${sk}-${i}`} className="w-8 h-10 bg-[#0a0f1a] rounded border border-white/5 flex items-center justify-center overflow-hidden relative group">
                  {r.imageUrl ? (
                    <img src={r.imageUrl} className="w-full h-full object-cover" alt={r.fileName || ''} />
                  ) : (
                    <span className="text-[7px] text-gray-700">IMG</span>
                  )}
                  <span className="absolute bottom-0 left-0 right-0 text-[5px] text-gray-400 bg-black/50 text-center truncate px-0.5">
                    {ready.length <= 2
                      ? (i === 0 ? '首帧' : '尾帧')
                      : `参考图 ${i+1}`
                    }
                  </span>
                </div>
              ))}
              {ready.length > maxShow && (
                <div data-testid={`shot-ref-extra-${sk}`} className="w-8 h-10 bg-[#0a0f1a] rounded border border-white/5 flex items-center justify-center text-[7px] text-purple-400">
                  +{ready.length - maxShow}
                </div>
              )}
            </>
          );
        })()}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span data-testid={`shot-control-status-${sk}`} className="text-[8px] text-gray-500">{generating ? '生成中...' : disabled ? disabledReason : '待生成'}</span>
        <button
          data-testid={`shot-control-generate-${sk}`}
          disabled={disabled || generating}
          onClick={(e) => { e.stopPropagation(); console.log('SHOT_GENERATE_CLICK', { nodeId, shotKey: sk, disabled, generating }); data.onGenerate?.(nodeId, sk); }}
          className="text-[8px] bg-purple-600/50 hover:bg-purple-600/70 text-purple-200 rounded px-2 py-0.5 flex items-center gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={disabled ? disabledReason : '生成'}
        >
          {generating ? (
            <><span className="inline-block w-2 h-2 border border-purple-400 border-t-transparent rounded-full animate-spin" />生成中</>
          ) : (
            <><Play className="w-2 h-2" />生成</>
          )}
        </button>
      </div>
      {/* Click-to-connect buttons (shown when an asset is in connecting mode) */}
      {isConnecting && (
        <div className="flex gap-1 mt-1.5">
          <button data-testid={`shot-node-click-start-frame-${sk}`} onClick={handleFrameClick('startFrame')} className="flex-1 text-[7px] bg-green-900/50 hover:bg-green-700 text-green-300 rounded px-1 py-0.5 border border-green-500/40">首帧</button>
          <button data-testid={`shot-node-click-end-frame-${sk}`} onClick={handleFrameClick('endFrame')} className="flex-1 text-[7px] bg-blue-900/50 hover:bg-blue-700 text-blue-300 rounded px-1 py-0.5 border border-blue-500/40">尾帧</button>
          <button data-testid={`shot-node-click-reference-${sk}`} onClick={handleFrameClick('reference')} className="flex-1 text-[7px] bg-yellow-900/50 hover:bg-yellow-700 text-yellow-300 rounded px-1 py-0.5 border border-yellow-500/40">参考</button>
        </div>
      )}
      {/* Hidden spans for backward-compatible testids (canvas-node-status / canvas-node-review / node-status) */}
      <span data-testid={`node-status-${sk}`} style={{display:'none'}}>{data.nodeStatus || 'pending'}</span>
      <span data-testid={`canvas-node-status-${sk}`} style={{display:'none'}}>状态: {data.nodeStatus || 'pending'}</span>
      <span data-testid={`canvas-node-review-${sk}`} style={{display:'none'}}>审核: {data.nodeReviewStatus || '-'}</span>
    </div>
  );
};