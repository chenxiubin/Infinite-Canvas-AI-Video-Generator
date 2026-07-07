import React from 'react';

interface Props {
  id: string;
  data: { shot_key: string; shot_name: string; product_line: string };
}

export const FixedVideoResultNode: React.FC<Props> = ({ data }) => {
  const sk = data.shot_key;
  return (
    <div data-testid={`fixed-video-node-${sk}`} className="bg-[#111827] border border-white/10 rounded-xl p-3 w-36">
      <div className="text-[9px] text-gray-500">{sk}</div>
      <div data-testid={`fixed-video-node-placeholder-${sk}`} className="aspect-video bg-[#0a0f1a] rounded-lg flex items-center justify-center border border-white/5 mt-1">
        <span className="text-[8px] text-gray-600">等待生成</span>
      </div>
      <div data-testid={`fixed-video-node-status-${sk}`} className="text-[8px] text-gray-600 mt-1 text-center">未生成</div>
    </div>
  );
};