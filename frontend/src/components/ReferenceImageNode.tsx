import React, { useState, useCallback } from 'react';
import { Upload, Image } from 'lucide-react';

interface Props {
  id: string;
  data: {
    shot_key: string; shot_name: string; ref_index: number; role_label: string; product_line: string;
    imageUrl?: string;
    isHovered?: boolean;
    onHoverStart?: (nodeId: string) => void;
    onHoverEnd?: (nodeId: string) => void;
    onDropImage?: (nodeId: string, file: File) => void;
  };
}

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export const ReferenceImageNode: React.FC<Props> = ({ id, data }) => {
  const sk = data.shot_key; const idx = data.ref_index;
  const hasImage = !!data.imageUrl;
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragValid, setIsDragValid] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const hasImage = e.dataTransfer.types.includes('Files');
    if (!hasImage) return;
    const items = Array.from(e.dataTransfer.items || []);
    const allImages = items.every(item => ACCEPTED_IMAGE_TYPES.includes(item.type));
    setIsDragOver(true);
    setIsDragValid(allImages);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (isDragOver) e.dataTransfer.dropEffect = isDragValid ? 'copy' : 'none';
  }, [isDragOver, isDragValid]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragOver(false);
    setIsDragValid(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragOver(false);
    setIsDragValid(false);
    const files = Array.from(e.dataTransfer.files || []);
    const imageFile = files.find(f => ACCEPTED_IMAGE_TYPES.includes(f.type));
    if (imageFile) {
      data.onDropImage?.(id, imageFile);
    }
  }, [id, data]);

  const handleMouseEnter = useCallback(() => {
    data.onHoverStart?.(id);
  }, [id, data]);

  const handleMouseLeave = useCallback(() => {
    setIsDragOver(false);
    setIsDragValid(false);
    data.onHoverEnd?.(id);
  }, [id, data]);

  return (
    <div
      data-testid={`reference-image-node-${sk}-${idx}`}
      className={`bg-[#111827] border rounded-xl p-3 w-32 transition-colors cursor-pointer ${
        hasImage && data.isHovered ? 'border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.15)]' :
        hasImage ? 'border-white/10 hover:border-white/20' :
        isDragOver && isDragValid ? 'border-purple-400/60 shadow-[0_0_16px_rgba(168,85,247,0.2)]' :
        isDragOver && !isDragValid ? 'border-red-500/40' :
        'border-dashed border-gray-700/50'
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        data-testid={`reference-image-placeholder-${sk}-${idx}`}
        className={`aspect-[3/4] rounded-lg flex flex-col items-center justify-center gap-1 border border-white/5 relative overflow-hidden transition-colors ${
          hasImage ? 'bg-transparent' :
          isDragOver && isDragValid ? 'bg-purple-900/20' :
          'bg-[#0a0f1a]'
        }`}
      >
        {hasImage ? (
          <img
            data-testid={`reference-image-thumb-${sk}-${idx}`}
            src={data.imageUrl}
            alt={data.role_label}
            className="w-full h-full object-cover rounded-lg"
          />
        ) : (
          <>
            <div className="absolute inset-4 rounded bg-[#1a2030] opacity-50" />
            {isDragOver && isDragValid ? (
              <>
                <Upload className="w-5 h-5 text-purple-400 mb-0.5 relative" />
                <span data-testid={`reference-image-label-${sk}-${idx}`} className="text-[8px] text-purple-300 text-center relative">释放以替换</span>
              </>
            ) : (
              <>
                <Image className="w-5 h-5 text-gray-600 mb-0.5 relative" />
                <span data-testid={`reference-image-label-${sk}-${idx}`} className="text-[9px] text-gray-500 text-center relative">{data.role_label}</span>
                <span className="text-[7px] text-gray-600 relative">拖入参考图</span>
                <span className="text-[7px] text-gray-700 relative">或粘贴图片替换</span>
              </>
            )}
          </>
        )}
      </div>
      <div className="text-[8px] text-gray-600 mt-1 text-center truncate">{sk}</div>
    </div>
  );
};
