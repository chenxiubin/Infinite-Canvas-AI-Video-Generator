import React from 'react';
import { Handle, Position } from '@xyflow/react';

export const MergeNode: React.FC = () => (
  <div data-testid="merge-node" className="bg-[#111827] border border-purple-500/20 ring-1 ring-purple-500/10 rounded-xl p-4 w-40 relative">
    <Handle type="target" position={Position.Top} id="target" data-testid="merge-target-handle" style={{ background: '#3b82f6', width: 10, height: 10, border: '2px solid #60a5fa' }} title="合成输入" />
    {/* Downward arrow indicator */}
    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-purple-500/30 text-xs">▼</div>
    <div className="text-xs font-semibold text-gray-300 text-center">总合成</div>
    <div data-testid="merge-node-status" className="text-[8px] text-gray-600 text-center mt-1">等待全部分镜审核通过</div>
    <button data-testid="merge-node-download-current-shots" disabled className="w-full mt-2 text-[8px] bg-gray-800 text-gray-600 rounded px-2 py-1">一键下载</button>
  </div>
);