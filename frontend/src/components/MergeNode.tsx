import React from 'react';
import { Handle, Position } from '@xyflow/react';

interface MergeNodeData { product_line?: string; shotCount?: number; canMerge?: boolean; mergeStatus?: string; onOpenDirector?: () => void; compositionPlan?: { segments?: any[] }; }

export const MergeNode: React.FC<{ data?: MergeNodeData }> = ({ data }) => {
  const canMerge = data?.canMerge || false;
  const status = data?.mergeStatus || '等待全部分镜审核通过';
  const planSegments = data?.compositionPlan?.segments?.length || 0;
  return (
  <div data-testid="merge-node" className={`bg-[#111827] border rounded-xl p-4 w-40 relative ${canMerge ? 'border-green-500/30 ring-1 ring-green-500/10' : 'border-purple-500/20 ring-1 ring-purple-500/10'}`}>
    <Handle type="target" position={Position.Top} id="target" data-testid="merge-target-handle" style={{ background: '#3b82f6', width: 10, height: 10, border: '2px solid #60a5fa' }} title="合成输入" />
    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-purple-500/30 text-xs">▼</div>
    <div className="text-xs font-semibold text-gray-300 text-center">总合成</div>
    <div data-testid="merge-node-status" className={`text-[8px] text-center mt-1 ${canMerge ? 'text-green-400' : 'text-gray-600'}`}>{status}</div>
    <button data-testid="merge-node-download-current-shots" disabled={!canMerge} className={`w-full mt-2 text-[8px] rounded px-2 py-1 ${canMerge ? 'bg-green-800/40 text-green-300' : 'bg-gray-800 text-gray-600'}`}>一键下载</button>
    <button
      data-testid="merge-node-open-director"
      onClick={() => data?.onOpenDirector?.()}
      className={`w-full mt-1 text-[8px] rounded px-2 py-1 ${
        canMerge
          ? 'bg-purple-800/40 text-purple-300 hover:bg-purple-700/50'
          : 'bg-purple-900/20 text-purple-400/60 hover:bg-purple-800/30'
      }`}
    >
      打开导演台
    </button>
    {planSegments > 0 && (
      <div data-testid="merge-node-plan-badge" className="text-[7px] text-purple-400/70 text-center mt-0.5">
        已编排 {planSegments} 个片段
      </div>
    )}
  </div>
)};