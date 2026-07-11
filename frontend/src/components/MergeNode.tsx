import React from 'react';
import { Handle, Position } from '@xyflow/react';

interface MergeNodeData { product_line?: string; shotCount?: number; canMerge?: boolean; mergeStatus?: string; blockedShots?: { shotKey: string; reason: string }[]; }

export const MergeNode: React.FC<{ data?: MergeNodeData }> = ({ data }) => {
  const canMerge = data?.canMerge || false;
  const status = data?.mergeStatus || '等待全部分镜审核通过';
  const blockedShots = data?.blockedShots || [];
  return (
  <div data-testid="merge-node" className={`bg-[#111827] border rounded-xl p-4 w-40 relative ${canMerge ? 'border-green-500/30 ring-1 ring-green-500/10' : 'border-purple-500/20 ring-1 ring-purple-500/10'}`}>
    <Handle type="target" position={Position.Top} id="target" data-testid="merge-target-handle" style={{ background: '#3b82f6', width: 10, height: 10, border: '2px solid #60a5fa' }} title="合成输入" />
    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-purple-500/30 text-xs">▼</div>
    <div className="text-xs font-semibold text-gray-300 text-center">总合成</div>
    <div data-testid="merge-node-status" className={`text-[8px] text-center mt-1 ${canMerge ? 'text-green-400' : 'text-gray-600'}`}>
      {canMerge ? <span data-testid="merge-node-ready">{status}</span> : status}
    </div>
    {!canMerge && blockedShots.length > 0 && (
      <div data-testid="merge-node-blocked-list" className="mt-1.5 pt-1.5 border-t border-white/5 space-y-1">
        {blockedShots.map(b => (
          <div key={b.shotKey} data-testid={`merge-node-blocked-${b.shotKey}`} className="text-[7px] text-gray-500 flex flex-col">
            <span className="text-amber-400/80">{b.shotKey}</span>
            <span className="text-gray-600">{b.reason}</span>
          </div>
        ))}
      </div>
    )}
    <button data-testid="open-director-console" onClick={() => window.dispatchEvent(new CustomEvent('open-director-console'))} className="w-full mt-1 text-[8px] rounded px-2 py-1 bg-purple-800/30 text-purple-300 border border-purple-500/20" title="打开导演台">导演台</button>
    <button data-testid="merge-node-download-current-shots" disabled={!canMerge} className={`w-full mt-1 text-[8px] rounded px-2 py-1 ${canMerge ? 'bg-green-800/40 text-green-300' : 'bg-gray-800 text-gray-600'}`}>一键下载</button>
  </div>
)};