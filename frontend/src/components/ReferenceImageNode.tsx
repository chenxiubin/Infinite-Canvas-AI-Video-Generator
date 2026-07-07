import React from 'react';

interface Props {
  id: string;
  data: { shot_key: string; shot_name: string; ref_index: number; role_label: string; product_line: string };
}

export const ReferenceImageNode: React.FC<Props> = ({ id, data }) => {
  const sk = data.shot_key; const idx = data.ref_index;
  return (
    <div data-testid={`reference-image-node-${sk}-${idx}`} className="bg-[#111827] border border-dashed border-white/10 rounded-xl p-3 w-32">
      <div data-testid={`reference-image-placeholder-${sk}-${idx}`} className="aspect-[3/4] bg-[#0a0f1a] rounded-lg flex flex-col items-center justify-center gap-1 border border-white/5">
        <span data-testid={`reference-image-label-${sk}-${idx}`} className="text-[9px] text-gray-500 text-center">{data.role_label}</span>
        <span className="text-[7px] text-gray-700">拖入参考图</span>
      </div>
      <div className="text-[8px] text-gray-600 mt-1 text-center truncate">{sk}</div>
    </div>
  );
};