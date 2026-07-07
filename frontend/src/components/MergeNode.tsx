import React from 'react';

export const MergeNode: React.FC = () => (
  <div data-testid="merge-node" className="bg-[#111827] border border-white/10 rounded-xl p-4 w-40">
    <div className="text-xs font-semibold text-gray-300 text-center">总合成</div>
    <div data-testid="merge-node-status" className="text-[8px] text-gray-600 text-center mt-1">等待全部分镜审核通过</div>
    <button data-testid="merge-node-download-current-shots" disabled className="w-full mt-2 text-[8px] bg-gray-800 text-gray-600 rounded px-2 py-1">一键下载</button>
  </div>
);