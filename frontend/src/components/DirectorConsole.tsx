import React from 'react';
import { Eye } from 'lucide-react';
import { CompositionPanel } from './CompositionPanel';

interface Props {
  instance?: any;
  productLine?: 'desk_calendar' | 'wall_calendar';
  optionalShotEnabled?: boolean;
  currentVideoByShot?: Record<string, string>;
  videoAssetsByShot?: Record<string, any[]>;
  shotNames: Record<string, string>;
  shotKeys: string[];
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

export const DirectorConsole: React.FC<Props> = ({
  instance, productLine, optionalShotEnabled,
  currentVideoByShot, videoAssetsByShot, shotNames, shotKeys, compositionOrder, onSetCompositionOrder, instanceId,
}) => (
  <div className="space-y-2" data-testid="sidebar-section-directorDesk">
    <SectionCard title="导演台" icon={<Eye className="w-3 h-3" />}>
      {!instance ? (
        <div className="text-gray-500 text-[10px] leading-relaxed">
          请先创建视频批次并生成分镜视频。
        </div>
      ) : (() => {
        const filteredKeys = shotKeys.filter(k => {
          if (!optionalShotEnabled) return k !== 'S07_size_ref' && k !== 'W08_size_ref';
          return true;
        });
        const approved: string[] = [];
        const blocked: { shotKey: string; name: string; reason: string }[] = [];
        filteredKeys.forEach(sk => {
          const cid = (currentVideoByShot || {})[sk];
          const cv = cid ? ((videoAssetsByShot || {})[sk] || []).find((v: any) => v.id === cid) : null;
          if (cv?.reviewStatus === 'approved') {
            approved.push(sk);
          } else {
            let reason = '未生成';
            if (cv?.reviewStatus === 'pending') reason = '待审核';
            else if (cv?.reviewStatus === 'rejected') reason = '已驳回';
            blocked.push({ shotKey: sk, name: shotNames[sk] || sk, reason });
          }
        });
        const allApproved = blocked.length === 0;
        const noVideoCount = filteredKeys.filter(sk => !(currentVideoByShot||{})[sk]).length;
        return (
          <div className="space-y-2">
            {/* Statistics summary */}
            <div data-testid="director-desk-stats" className="grid grid-cols-3 gap-1 text-center text-[8px] bg-[#0a0f1a] rounded p-1.5 border border-white/5">
              <div><div className="text-gray-500">总分镜</div><div className="text-gray-200 text-[10px] font-semibold">{filteredKeys.length}</div></div>
              <div><div className="text-green-500">已通过</div><div data-testid="director-stat-approved" className="text-green-400 text-[10px] font-semibold">{approved.length}</div></div>
              <div><div className="text-amber-500">未完成</div><div className="text-amber-400 text-[10px] font-semibold">{blocked.length}</div></div>
            </div>
            <div data-testid="director-desk-status" className={`text-[10px] px-2 py-1.5 rounded-lg border ${allApproved ? 'text-green-300 bg-green-900/20 border-green-500/20' : 'text-amber-300 bg-amber-900/20 border-amber-500/20'}`}>
              {allApproved
                ? `✅ 全部分镜审核通过 (${approved.length}/${filteredKeys.length})，可以进入合成`
                : `⚠ 还有 ${blocked.length} 个分镜未通过审核，暂不能合成`}
            </div>
            <div className="space-y-1">
              {filteredKeys.map(sk => {
                const cid = (currentVideoByShot || {})[sk];
                const cv = cid ? ((videoAssetsByShot || {})[sk] || []).find((v: any) => v.id === cid) : null;
                const statusCls = cv?.reviewStatus === 'approved' ? 'text-green-400' : cv?.reviewStatus === 'rejected' ? 'text-red-400' : 'text-amber-400';
                const statusBadgeCls = cv?.reviewStatus === 'approved' ? 'bg-green-900/40 text-green-400 border-green-500/30' : cv?.reviewStatus === 'rejected' ? 'bg-red-900/40 text-red-400 border-red-500/30' : 'bg-amber-900/30 text-amber-400 border-amber-500/30';
                const statusLabel = cv?.reviewStatus === 'approved' ? '✓ 已通过' : cv?.reviewStatus === 'rejected' ? '✗ 已驳回' : cv ? '⏳ 待审核' : '○ 未生成';
                return (
                  <div key={sk} data-testid={`director-shot-${sk}`} className="flex items-center gap-2 text-[9px] bg-[#0a0f1a] border border-white/5 rounded px-2 py-1">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cv?.reviewStatus === 'approved' ? '#4ade80' : cv?.reviewStatus === 'rejected' ? '#f87171' : cv ? '#fbbf24' : '#6b7280' }} />
                    <span className="text-gray-400 w-20 flex-shrink-0">{sk}</span>
                    <span className="text-gray-500 flex-1 truncate">{shotNames[sk] || sk}</span>
                    <span data-testid={`director-shot-status-${sk}`} className={`text-[8px] px-1.5 py-0.5 rounded-full border ${statusBadgeCls}`}>{statusLabel}</span>
                    {cv?.provider && <span className="text-gray-600">{cv.provider}</span>}
                  </div>
                );
              })}
            </div>
            {allApproved && (
              <div data-testid="director-desk-ready" className="text-[9px] text-green-400 text-center">
                ✅ 全部分镜已就绪，可以进入合成准备
              </div>
            )}
          </div>
        );
      })()}
    </SectionCard>
    {instance && (
      <CompositionPanel
        shotKeys={shotKeys}
        shotNames={shotNames}
        currentVideoByShot={currentVideoByShot}
        videoAssetsByShot={videoAssetsByShot}
        compositionOrder={compositionOrder}
        onSetCompositionOrder={onSetCompositionOrder}
        instanceId={instanceId}
      />
    )}
  </div>
);
