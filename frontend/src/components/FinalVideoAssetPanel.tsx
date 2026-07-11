import React, { useState } from 'react';
import { Film, CheckCircle, XCircle, Loader2, History, ArrowLeftRight } from 'lucide-react';
import {
  type FinalVideoVersion, getFinalVideoVersions, setFinalVideoVersions,
  getCurrentFinalVideoId, setCurrentFinalVideoId,
} from '../lib/productionStateStore';

interface Props {
  compositionStatus: 'idle' | 'processing' | 'completed' | 'failed';
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

export const FinalVideoAssetPanel: React.FC<Props> = ({ compositionStatus, instanceId }) => {
  const [versions, setVersions] = useState<FinalVideoVersion[]>([]);
  const [currentVersionId, setCurrentVersionId] = useState<string>('');
  React.useEffect(() => { if (instanceId) { setVersions(getFinalVideoVersions(instanceId)); setCurrentVersionId(getCurrentFinalVideoId(instanceId)); } }, [instanceId]);

  const saveVersions = (v: FinalVideoVersion[]) => {
    setVersions(v);
    if (instanceId) setFinalVideoVersions(instanceId, v);
  };

  const currentVersion = versions.find(v => v.versionId === currentVersionId) || versions[versions.length - 1];

  // When composition completes, automatically add a new version
  React.useEffect(() => {
    if (compositionStatus !== 'completed') return;
    const job = instanceId ? getCompositionJob(instanceId) : { status: 'idle' };
    if (!job.completedAt) return;
    const existingVersion = versions.find(v => v.createdAt === job.completedAt);
    if (existingVersion) return;
    const newVersion: FinalVideoVersion = {
      versionId: `final-v${versions.length + 1}`,
      videoUrl: `/mock/final-video-${versions.length + 1}.mp4`,
      createdAt: job.completedAt,
      status: 'completed',
    };
    const updated = [...versions, newVersion];
    saveVersions(updated);
    const newId = newVersion.versionId;
    setCurrentVersionId(newId);
    if (instanceId) setCurrentFinalVideoId(instanceId, newId);
  }, [compositionStatus, instanceId]);

  const switchVersion = (versionId: string) => {
    setCurrentVersionId(versionId);
    if (instanceId) setCurrentFinalVideoId(instanceId, versionId);
  };

  if (compositionStatus === 'idle') return null;

  return (
    <SectionCard title="最终视频" icon={<Film className="w-3 h-3" />}>
      <div data-testid="final-video-asset-panel" className="space-y-2">
        {/* Status */}
        <div data-testid="final-video-status" className={`text-[10px] px-2 py-1.5 rounded border ${
          compositionStatus === 'completed' ? 'text-green-300 bg-green-900/20 border-green-500/20' :
          compositionStatus === 'processing' ? 'text-blue-300 bg-blue-900/20 border-blue-500/20' :
          'text-red-300 bg-red-900/20 border-red-500/20'}`}>
          {compositionStatus === 'completed' && <><CheckCircle className="w-3 h-3 inline mr-1" />合成完成</>}
          {compositionStatus === 'processing' && <><Loader2 className="w-3 h-3 inline mr-1 animate-spin" />合成中...</>}
          {compositionStatus === 'failed' && <><XCircle className="w-3 h-3 inline mr-1" />合成失败</>}
        </div>

        {/* Current video */}
        {currentVersion && compositionStatus === 'completed' && (
          <div data-testid="final-video-current" className="bg-[#0a0f1a] rounded p-2 border border-white/5">
            <div className="text-[9px] text-gray-500 mb-1">当前版本: <span data-testid="final-video-current-version">{currentVersion.versionId}</span></div>
            <div data-testid="final-video-preview" className="aspect-video bg-black rounded flex items-center justify-center border border-white/5">
              <Film className="w-6 h-6 text-gray-600" />
            </div>
            <div className="text-[8px] text-gray-600 mt-1">生成时间: {new Date(currentVersion.createdAt).toLocaleString()}</div>
          </div>
        )}

        {/* Version history */}
        {versions.length > 1 && (
          <div data-testid="final-video-versions" className="space-y-1 pt-1 border-t border-white/5">
            <div className="text-[8px] text-gray-500 flex items-center gap-1"><History className="w-2.5 h-2.5" />历史版本</div>
            {[...versions].reverse().map(v => (
              <div key={v.versionId} data-testid={`final-version-${v.versionId}`}
                className={`flex items-center gap-2 text-[8px] px-2 py-1 rounded border cursor-pointer transition-colors ${
                  currentVersionId === v.versionId ? 'bg-purple-900/20 border-purple-500/30' : 'bg-[#0a0f1a] border-white/5 hover:border-white/10'
                }`}
                onClick={() => switchVersion(v.versionId)}>
                <span className={v.status === 'completed' ? 'text-green-400' : 'text-red-400'}>
                  {v.status === 'completed' ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                </span>
                <span className="text-gray-400">{v.versionId}</span>
                <span className="text-gray-600 flex-1">{new Date(v.createdAt).toLocaleTimeString()}</span>
                {currentVersionId === v.versionId && (
                  <span data-testid={`final-version-current-${v.versionId}`} className="text-purple-300 flex items-center gap-0.5">
                    <ArrowLeftRight className="w-2 h-2" />当前
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
};
