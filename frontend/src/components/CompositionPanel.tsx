import React from 'react';
import { Clapperboard, AlertTriangle, CheckCircle } from 'lucide-react';
import { VideoTimelineEditor } from './VideoTimelineEditor';
import { CompositionControlPanel } from './CompositionControlPanel';

interface Props {
  shotKeys: string[];
  shotNames: Record<string, string>;
  currentVideoByShot?: Record<string, string>;
  videoAssetsByShot?: Record<string, any[]>;
  compositionOrder?: string[];
  onSetCompositionOrder?: (order: string[]) => void;
  instanceId?: string;
}

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> =
  ({ title, icon, children }) => (
    <div className="bg-[#111827] border border-white/5 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#0d1117]">
        <span className="text-gray-500">{icon}</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-2.5 space-y-1.5">{children}</div>
    </div>
  );

export const CompositionPanel: React.FC<Props> = ({
  shotKeys, shotNames, currentVideoByShot, videoAssetsByShot, compositionOrder, onSetCompositionOrder, instanceId,
}) => {
  const orderedKeys = (compositionOrder && compositionOrder.length > 0)
    ? compositionOrder.filter(k => shotKeys.includes(k))
    : shotKeys;

  const shotStatuses = orderedKeys.map(sk => {
    const cid = (currentVideoByShot || {})[sk];
    const cv = cid ? ((videoAssetsByShot || {})[sk] || []).find((v: any) => v.id === cid) : null;
    return {
      shotKey: sk,
      name: shotNames[sk] || sk,
      hasVideo: !!cv,
      reviewStatus: cv?.reviewStatus || 'none',
      provider: cv?.provider,
      model: cv?.model,
      duration: cv ? '4s' : '-', // placeholder until real duration available
    };
  });

  const blockedShots = shotStatuses.filter(s => s.reviewStatus !== 'approved');
  const approvedCount = shotStatuses.filter(s => s.reviewStatus === 'approved').length;
  const allReady = blockedShots.length === 0;

  return (
    <div data-testid="composition-panel" className="space-y-2">
      <SectionCard title="合成准备" icon={<Clapperboard className="w-3 h-3" />}>
        {/* Readiness status card */}
        <div data-testid={`composition-readiness-status`} className={`text-[10px] px-2 py-1.5 rounded-lg border flex items-center gap-1.5 ${allReady ? 'text-green-300 bg-green-900/20 border-green-500/20' : 'text-amber-300 bg-amber-900/20 border-amber-500/20'}`}>
          <span>{allReady ? '✅' : '⚠'}</span>
          <span>{allReady ? '可以合成' : '暂不能合成'}</span>
          <span className="text-gray-500">({approvedCount}/{orderedKeys.length})</span>
        </div>

        {/* Shot list with order */}
        <div className="space-y-1">
          {shotStatuses.map((s, i) => {
            const statusCls = s.reviewStatus === 'approved' ? 'text-green-400'
              : s.reviewStatus === 'rejected' ? 'text-red-400'
              : s.reviewStatus === 'pending' ? 'text-amber-400'
              : 'text-gray-600';
            const statusLabel = s.reviewStatus === 'approved' ? '已通过'
              : s.reviewStatus === 'rejected' ? '已驳回'
              : s.reviewStatus === 'pending' ? '待审核'
              : '未生成';
            return (
              <div key={s.shotKey} data-testid={`composition-shot-${s.shotKey}`}
                className="flex items-center gap-2 text-[9px] bg-[#0a0f1a] border border-white/5 rounded px-2 py-1">
                <span className="text-gray-500 w-4 text-center flex-shrink-0">{i + 1}</span>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: s.reviewStatus === 'approved' ? '#4ade80' : s.reviewStatus === 'rejected' ? '#f87171' : s.reviewStatus === 'pending' ? '#fbbf24' : '#6b7280' }} />
                <span className="text-gray-400 w-20 flex-shrink-0">{s.shotKey}</span>
                <span className="text-gray-500 w-20 flex-shrink-0 truncate">{s.name}</span>
                <span className="text-gray-600 w-8 flex-shrink-0">{s.duration}</span>
                <span className={statusCls + ' w-12 flex-shrink-0'}>{statusLabel}</span>
                {s.provider && <span className="text-gray-600 w-12 flex-shrink-0">{s.provider}</span>}
              </div>
            );
          })}
        </div>

        {/* Blocked shots detail */}
        {!allReady && (
          <div data-testid="composition-blocked-list" className="space-y-0.5 pt-1 border-t border-white/5">
            <div className="text-[9px] text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> 阻塞原因
            </div>
            {blockedShots.map(b => (
              <div key={b.shotKey} data-testid={`composition-blocked-reason-${b.shotKey}`} className="text-[8px] text-gray-500 px-1 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-amber-500/50 flex-shrink-0" />
                <span>{b.shotKey} · {b.reviewStatus === 'none' ? '未生成视频' : b.reviewStatus === 'pending' ? '等待审核' : '已驳回'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Ready state */}
        {allReady && (
          <div data-testid="composition-ready" className="flex items-center gap-1.5 text-[9px] text-green-400 justify-center pt-1 border-t border-white/5">
            <CheckCircle className="w-3 h-3" />
            可以开始合成
          </div>
        )}
      </SectionCard>

      {/* Video Timeline Editor — only for approved shots */}
      {shotStatuses.some(s => s.reviewStatus === 'approved') && (
        <VideoTimelineEditor
          shots={shotStatuses.filter(s => s.hasVideo).map(s => ({
            shotKey: s.shotKey, name: s.name, versionLabel: undefined,
            reviewStatus: s.reviewStatus, provider: s.provider, model: s.model,
            duration: s.duration === '-' ? 4 : parseInt(s.duration),
          }))}
          onReorder={onSetCompositionOrder}
          compositionOrder={compositionOrder}
          instanceId={instanceId}
        />
      )}
      <CompositionControlPanel
        instanceId={instanceId}
        shotCount={shotStatuses.filter(s => s.hasVideo).length}
        totalDuration={shotStatuses.filter(s => s.hasVideo).reduce((sum, s) => sum + (s.duration === '-' ? 4 : parseInt(s.duration)), 0)}
        allApproved={allReady}
      />
    </div>
  );
};
