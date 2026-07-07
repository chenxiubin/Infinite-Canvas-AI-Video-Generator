import React from 'react';

interface Props {
  id: string;
  data: { shot_key: string; shot_name: string; product_line: string };
}

export const FixedVideoResultNode: React.FC<Props> = ({ data }) => {
  const sk = data.shot_key;
  return (
    <div data-testid={`fixed-video-node-${sk}`} className="bg-[#111827] border border-white/10 rounded-xl p-3 w-36 relative">
      {/* Film-strip dots on left edge */}
      <div className="absolute left-1 top-2 bottom-2 flex flex-col gap-1.5">
        <div className="w-1 h-1 rounded-full bg-gray-700" />
        <div className="w-1 h-1 rounded-full bg-gray-700" />
        <div className="w-1 h-1 rounded-full bg-gray-700" />
        <div className="w-1 h-1 rounded-full bg-gray-700" />
      </div>
      <div className="text-[9px] text-gray-500 pl-2">{sk}</div>
      <div data-testid={`fixed-video-node-placeholder-${sk}`} className="aspect-video bg-[#0a0f1a] rounded-lg flex items-center justify-center border border-white/5 mt-1 relative">
        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full bg-black/50 border border-white/20 flex items-center justify-center">
            <span className="text-white/70 text-[10px] leading-none ml-0.5">▶</span>
          </div>
        </div>
        <span className="text-[8px] text-gray-600">等待生成</span>
      </div>
      <div data-testid={`fixed-video-node-status-${sk}`} className="text-[8px] text-gray-600 mt-1 text-center">未生成</div>
    </div>
  );
};