import React from 'react';
import { Zap, RotateCcw, Layers, Cpu, Trash2, Settings } from 'lucide-react';

interface Props {
  modelAdapter: string;
  adapters?: any[];
  onSetModelAdapter?: (k: string) => void;
  onRunDemo: () => void;
  onReset: () => void;
  loading: string;
  onClearAllRefImages?: () => void;
  // 10K-1: Unified model settings entry
  modelSettingsLabel?: string;
  onOpenModelSettings?: () => void;
}

export const WorkbenchHeader: React.FC<Props> = ({
  modelAdapter, adapters, onSetModelAdapter, onRunDemo, onReset, loading, onClearAllRefImages,
  modelSettingsLabel, onOpenModelSettings,
}) => (
  <header data-testid="workbench-header"
    className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-[#0f1520] via-[#141a2e] to-[#1a1030] border-b border-purple-900/20 flex-shrink-0">
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
        <Layers className="w-4 h-4 text-purple-400" />
      </div>
      <div>
        <span className="text-sm font-semibold text-gray-200 tracking-tight">无限画布 AI 视频生成平台</span>
        <span className="text-[9px] bg-purple-600/20 text-purple-300 px-1.5 py-0.5 rounded-full border border-purple-600/30 ml-2 align-middle">
          MVP-4 生产工作台
        </span>
      </div>
    </div>
    <div className="flex items-center gap-3">
      {/* 10K-1: Unified model settings button (replaces old model-adapter-header-select) */}
      {onOpenModelSettings && (
        <button
          data-testid="model-settings-button"
          onClick={onOpenModelSettings}
          className="flex items-center gap-1.5 text-[10px] bg-[#0d1117] border border-white/5 rounded-lg px-2.5 py-1 text-purple-300 font-medium cursor-pointer hover:border-purple-500/30 transition-colors"
          title="模型服务设置"
        >
          <Settings className="w-3 h-3" />
          {modelSettingsLabel || 'Mock 演示'}
        </button>
      )}
      {loading && (
        <span className="text-blue-400 text-[10px] animate-pulse flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> {loading}
        </span>
      )}
      <button data-testid="run-full-demo-button" onClick={onRunDemo}
        className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs px-3.5 py-1.5 rounded-lg font-medium
          transition-all duration-150 shadow-sm shadow-purple-900/30 active:scale-95">
        <Zap className="w-3.5 h-3.5" /> 运行完整演示
      </button>
      {onClearAllRefImages && (
        <button data-testid="clear-all-fixed-ref-images" onClick={onClearAllRefImages}
          className="flex items-center gap-1 bg-white/5 hover:bg-white/10 text-amber-500 hover:text-amber-300 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
          title="清空所有固定参考图节点中的图片，不会删除素材库图片、自由节点和视频结果">
          <Trash2 className="w-3 h-3" /> 清空工作流参考图
        </button>
      )}
      <button data-testid="reset-current-state-button" onClick={onReset}
        className="flex items-center gap-1 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 text-xs px-2.5 py-1.5 rounded-lg transition-colors">
        <RotateCcw className="w-3 h-3" /> 重置
      </button>
      <button data-testid="nav-production-workbench"
        className="flex items-center gap-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 text-xs px-2.5 py-1.5 rounded-lg transition-colors border border-purple-500/20">
        生产工作台
      </button>
    </div>
  </header>
);
