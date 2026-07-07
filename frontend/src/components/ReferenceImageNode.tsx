import React from 'react';

interface Props {
  id: string;
  data: { shot_key: string; shot_name: string; ref_index: number; role_label: string; product_line: string };
}

export const ReferenceImageNode: React.FC<Props> = ({ id, data }) => {
  const sk = data.shot_key; const idx = data.ref_index;
  return (
    <div data-testid={`reference-image-node-${sk}-${idx}`} className="bg-[#111827] border-dashed border-gray-700/50 rounded-xl p-3 w-32 border">
      <div data-testid={`reference-image-placeholder-${sk}-${idx}`} className="aspect-[3/4] bg-[#0a0f1a] rounded-lg flex flex-col items-center justify-center gap-1 border border-white/5 relative overflow-hidden">
        <div className="absolute inset-4 rounded bg-[#1a2030] opacity-50" />
        <svg className="w-5 h-5 text-gray-600 mb-0.5 relative" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
        <span data-testid={`reference-image-label-${sk}-${idx}`} className="text-[9px] text-gray-500 text-center relative">{data.role_label}</span>
        <span className="text-[7px] text-gray-700 relative">IMG</span>
      </div>
      <div className="text-[8px] text-gray-600 mt-1 text-center truncate">{sk}</div>
    </div>
  );
};