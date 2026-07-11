import React, { useState } from 'react';
import { Play, CheckCircle, Loader2, AlertTriangle, XCircle } from 'lucide-react';
import { FinalVideoAssetPanel } from './FinalVideoAssetPanel';
import { type CompositionJob, getCompositionJob, setCompositionJob } from '../lib/productionStateStore';

interface Props {
  shotCount: number;
  totalDuration: number;
  allApproved: boolean;
  instanceId?: string;
}

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> =
  ({ title, icon, children }) => (
    <div className="bg-[#111827] border border-white/5 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#0d1117]">
        <span className="text-gray-500">{icon}</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-2.5 space-y-2">{children}</div>
    </div>
  );

export const CompositionControlPanel: React.FC<Props> = ({ shotCount, totalDuration, allApproved, instanceId }) => {
  const [job, setJob] = useState<CompositionJob>({ status: 'idle' });
  React.useEffect(() => { if (instanceId) setJob(getCompositionJob(instanceId)); }, [instanceId]);

  const saveJob = (next: CompositionJob) => {
    setJob(next);
    if (instanceId) setCompositionJob(instanceId, next);
  };

  const handleStart = () => {
    if (!allApproved) return;
    const now = Date.now();
    saveJob({ status: 'processing', startedAt: now });
    // Simulate processing → completed after delay
    setTimeout(() => {
      saveJob({ status: 'completed', startedAt: now, completedAt: Date.now() });
    }, 3000);
  };

  const handleReset = () => {
    saveJob({ status: 'idle' });
  };

  const statusIcon = () => {
    switch (job.status) {
      case 'idle': return <Play className="w-3 h-3" />;
      case 'processing': return <Loader2 className="w-3 h-3 animate-spin" />;
      case 'completed': return <CheckCircle className="w-3 h-3" />;
      case 'failed': return <XCircle className="w-3 h-3" />;
      default: return null;
    }
  };

  const statusLabel = () => {
    switch (job.status) {
      case 'idle': return '等待开始';
      case 'processing': return '合成中...';
      case 'completed': return '合成完成';
      case 'failed': return '合成失败';
      default: return '';
    }
  };

  return (
    <SectionCard title="合成任务" icon={<Play className="w-3 h-3" />}>
      <div data-testid="composition-control-panel">
        {/* Info */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] bg-[#0a0f1a] rounded p-2 border border-white/5">
          <div className="text-gray-600">分镜数量</div><div data-testid="comp-job-shot-count" className="text-gray-300">{shotCount}</div>
          <div className="text-gray-600">总时长</div><div data-testid="comp-job-duration" className="text-gray-300">{totalDuration}秒</div>
        </div>

        {/* Status */}
        <div data-testid="comp-job-status" className={`flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded border ${job.status === 'completed' ? 'text-green-300 bg-green-900/20 border-green-500/20' : job.status === 'processing' ? 'text-blue-300 bg-blue-900/20 border-blue-500/20' : job.status === 'failed' ? 'text-red-300 bg-red-900/20 border-red-500/20' : 'text-gray-400 bg-gray-900/20 border-gray-600/20'}`}>
          {statusIcon()}
          <span data-testid="composition-job-status">{statusLabel()}</span>
          {job.status === 'idle' && <span className="text-[8px] text-gray-500">— 等待开始合成</span>}
          {job.status === 'processing' && <span className="text-[8px] text-blue-400 animate-pulse">处理中...</span>}
        </div>

        {/* Actions */}
        {(job.status === 'idle' || job.status === 'failed') && (
          <button
            data-testid="comp-job-start-button"
            onClick={handleStart}
            disabled={!allApproved}
            className={`flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg w-full transition-colors border
              ${allApproved ? 'bg-green-900/40 hover:bg-green-900/60 text-green-300 border-green-700/20 cursor-pointer' : 'bg-gray-800 text-gray-600 border-gray-700/20 cursor-not-allowed'}`}
            title={!allApproved ? '全部分镜审核通过后才能开始合成' : '开始合成'}
          >
            <Play className="w-3 h-3" /> 开始合成
          </button>
        )}

        {job.status === 'processing' && (
          <div data-testid="comp-job-processing" className="text-blue-400 text-[9px] text-center">
            正在合成视频，请稍候...
          </div>
        )}

        {job.status === 'completed' && (
          <div className="space-y-1">
            <div data-testid="comp-job-completed" className="text-green-400 text-[9px] text-center">
              合成完成
            </div>
            <button
              data-testid="comp-job-reset-button"
              onClick={handleReset}
              className="flex items-center justify-center gap-1.5 text-[10px] bg-white/5 hover:bg-white/10 text-gray-400 px-2 py-1 rounded w-full">
              重新合成
            </button>
          </div>
        )}

        {!allApproved && job.status === 'idle' && (
          <div data-testid="comp-job-blocked-reason" className="flex items-center gap-1 text-[8px] text-amber-400">
            <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
            全部分镜审核通过后才能开始合成
          </div>
        )}
      </div>
    </SectionCard>
    {(job.status === 'processing' || job.status === 'completed' || job.status === 'failed') && (
      <FinalVideoAssetPanel compositionStatus={job.status} instanceId={instanceId} />
    )}
  </>);
};
