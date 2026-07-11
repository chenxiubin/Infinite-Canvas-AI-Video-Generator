import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DemoStepLog } from './DemoStepLog';
import { Package, FileVideo, Layers, Cpu, Play, Eye, CheckCheck, Download, X, AlertTriangle, Image, Upload } from 'lucide-react';
import { allRequiredShotsApproved, getBlockedShots, getMergeDisabledReason } from '../lib/reviewGate';
import { DirectorConsole } from './DirectorConsole';

interface WorkbenchAsset { id: string; filename: string; url: string; role: string; createdAt: number; }

interface Props {
  productId: string; isReady: boolean | undefined; templates: any[]; selTemplateId: string;
  batchId: string; instance: any; modelAdapter: string; adapters: any[]; demoLog: string[];
  allSuccess: boolean; canExport: boolean; error: string; viewMode: 'form' | 'canvas';
  onCreateDemo: () => void; onSelectTemplate: (id: string) => void; onCreateBatch: () => void;
  onGenerate: () => void; onMerge: () => void; onApproveAll: () => void; onExport: () => void;
  onSetModelAdapter: (k: string) => void; onSetViewMode: (m: 'form' | 'canvas') => void; onClearError: () => void;
  assets?: WorkbenchAsset[]; onUploadAssets?: (files: FileList) => void; onUpdateAssetRole?: (assetId: string, role: string) => void;
  onSelectShot?: (shotKey: string) => void; selectedShotKey?: string | null;
  productLine?: 'desk_calendar' | 'wall_calendar'; onSetProductLine?: (pl: 'desk_calendar' | 'wall_calendar') => void;
  motionShotVersion?: 'primary' | 'backup';
  nodes?: any[];
  // 10D-2: Mock image asset library for display in assets module
  imageAssets?: { id: string; name: string; url: string; mimeType: string; createdAt: number; source: string }[];
  // 10G-2: Optional size reference shot
  optionalShotEnabled?: boolean;
  onToggleOptionalShot?: (enabled: boolean) => void;
  // 10I: Video asset library
  videoAssetsByShot?: Record<string, any[]>;
  currentVideoByShot?: Record<string, string>;
  onSetCurrentVideo?: (shotKey: string, videoId: string) => void;
  // 10L-2: Director Console composition order
  compositionOrder?: string[];
  onSetCompositionOrder?: (order: string[]) => void;
}

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; testid?: string }> =
  ({ title, icon, children, testid }) => (
    <div data-testid={testid} className="bg-[#111827] border border-white/5 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#0d1117]">
        <span className="text-gray-500">{icon}</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-2.5 space-y-1.5">{children}</div>
    </div>
  );

const ActionBtn: React.FC<{ testid?: string; onClick: () => void; disabled?: boolean; disabledReason?: string;
  icon?: React.ReactNode; color?: 'purple' | 'blue' | 'green' | 'orange' | 'red'; children: React.ReactNode }> =
  ({ testid, onClick, disabled, disabledReason, icon, color = 'gray', children }) => {
    const colors: Record<string, string> = {
      purple: 'bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border-purple-700/30',
      blue: 'bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 border-blue-700/30',
      green: 'bg-green-900/30 hover:bg-green-900/50 text-green-300 border-green-700/30',
      orange: 'bg-orange-900/30 hover:bg-orange-900/50 text-orange-300 border-orange-700/30',
      red: 'bg-red-900/30 hover:bg-red-900/50 text-red-300 border-red-700/30',
      gray: 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700/20',
    };
    return (
      <button data-testid={testid} onClick={onClick} disabled={disabled}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg w-full text-left transition-all duration-150
          border ${colors[color] || colors.gray} disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent`}>
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span className="flex-1 truncate">{children}</span>
        {disabled && disabledReason && <span className="text-[9px] text-gray-600 flex-shrink-0 ml-1">{disabledReason}</span>}
      </button>
    );
  };

type SectionKey = 'productLine' | 'assets' | 'directorDesk';

const SECTION_META: Record<SectionKey, { label: string; icon: React.FC<{ className?: string }> }> = {
  productLine: { label: '产品线', icon: Layers },
  assets: { label: '素材', icon: Image },
  directorDesk: { label: '导演台', icon: Eye },
};

const SECTION_ORDER: SectionKey[] = ['productLine', 'directorDesk', 'assets'];

export const WorkflowSidebar: React.FC<Props> = (p) => {
  // ── State ──
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>('productLine');
  const [panelTop, setPanelTop] = useState(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); };
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
  }, []);

  const startCloseTimer = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => { setIsOpen(false); }, 150);
  }, [clearCloseTimer]);

  // ── Derived data ──
  const resolvedNodes = p.nodes || p.instance?.nodes || [];
  const approvedGate = allRequiredShotsApproved(resolvedNodes);
  const blockedReason = getMergeDisabledReason(resolvedNodes);
  const blockedShots = getBlockedShots(resolvedNodes);
  const isDesk = (p.productLine || 'desk_calendar') === 'desk_calendar';

  // ── Icon enter: position the panel at this icon's Y, set section, open ──
  const handleIconEnter = useCallback((section: SectionKey, e: React.MouseEvent) => {
    clearCloseTimer();
    const rect = e.currentTarget.getBoundingClientRect();
    setPanelTop(rect.top - 4); // slight overlap for visual connection
    setActiveSection(section);
    setIsOpen(true);
  }, [clearCloseTimer]);

  // ── Icon button ──
  const iconBtn = (section: SectionKey) => {
    const Icon = SECTION_META[section].icon;
    const active = activeSection === section;
    return (
      <div
        title={SECTION_META[section].label}
        data-testid={`sidebar-icon-${section}`}
        className={`flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-all duration-200 ${
          active && isOpen
            ? 'bg-purple-500/40 text-purple-200 ring-1 ring-purple-400/50'
            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
        }`}
        onMouseEnter={(e) => handleIconEnter(section, e)}
        onMouseLeave={startCloseTimer}
      >
        <span className="w-5 h-5 flex items-center justify-center"><Icon className="w-4 h-4" /></span>
      </div>
    );
  };

  // ── Section content renderers ──

  const renderProductLine = () => (
    <div className="space-y-2">
      <div data-testid="product-line-selector" className="bg-[#111827] border border-white/5 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#0d1117]">
          <span className="text-gray-500"><Layers className="w-3 h-3" /></span>
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">产品线</span>
        </div>
        <div className="p-2 flex gap-1">
          <button data-testid="product-line-desk-calendar" onClick={() => p.onSetProductLine?.('desk_calendar')}
            className={`flex-1 text-[10px] py-1.5 rounded-lg transition-colors ${(p.productLine || 'desk_calendar') === 'desk_calendar' ? 'bg-purple-600/40 text-purple-200 border border-purple-500/30' : 'text-gray-500 hover:bg-white/5'}`}>台历</button>
          <button data-testid="product-line-wall-calendar" onClick={() => p.onSetProductLine?.('wall_calendar')}
            className={`flex-1 text-[10px] py-1.5 rounded-lg transition-colors ${p.productLine === 'wall_calendar' ? 'bg-purple-600/40 text-purple-200 border border-purple-500/30' : 'text-gray-500 hover:bg-white/5'}`}>挂历</button>
        </div>
        <div data-testid="current-product-line-label" className="text-center text-[9px] text-gray-600 pb-1.5">
          当前：{isDesk ? '台历' : '挂历'}
        </div>
        <div data-testid="material-requirements-panel" className="px-2 pb-2 space-y-0.5">
          <div className="text-[9px] text-gray-500 mb-1">素材需求清单</div>
          {[
            { s: 'S01', l: '产品完整正面图' },
            { s: 'S02', l: '材质/纸张质感图' },
            { s: 'S03', l: isDesk ? '台历底座/翻页装订结构图' : '挂绳/装订孔结构图' },
            { s: 'S04', l: isDesk ? '手部翻页定格图' : '悬挂展开定格图' },
            { s: 'S05', l: isDesk ? '书桌/办公场景图' : '客厅墙面/玄关场景图' },
            { s: 'S06', l: '产品整体收尾图' },
          ].map(m => (
            <div key={m.s} data-testid={`material-requirement-${m.s}`} className="text-[8px] text-gray-600 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-gray-700 flex-shrink-0" />{m.s} {m.l}
            </div>
          ))}
          {p.motionShotVersion === 'backup' && (
            <div data-testid="material-requirement-S04-backup" className="text-[8px] text-amber-500 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />S04 备用：{isDesk ? '台历与咖啡杯、钢笔等桌面参照物同框素材' : '挂历与门框、墙面参照物同框素材'}
            </div>
          )}
        </div>
        {/* 10G-2: Optional size reference shot toggle */}
        {p.onToggleOptionalShot && (
          <div className="mt-2 border-t border-white/5 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" data-testid="optional-shot-toggle"
                checked={!!p.optionalShotEnabled}
                onChange={e => p.onToggleOptionalShot?.(e.target.checked)}
                className="w-3 h-3 rounded accent-purple-600" />
              <span className="text-[9px] text-gray-400">备用分镜：尺寸参考同框</span>
            </label>
            <div className="text-[7px] text-gray-600 mt-0.5 ml-5">
              用于展示产品尺寸比例、同框对比、空间参考
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // 10I: Tab state for image/video asset library
  const [assetTab, setAssetTab] = useState<'image' | 'video'>('image');

  const renderAssets = () => (
    <div className="space-y-2">
      {/* 10I: Image / Video tab toggle */}
      <div className="flex gap-1 bg-[#111827] border border-white/5 rounded-lg p-0.5">
        <button data-testid="asset-tab-image" onClick={() => setAssetTab('image')}
          className={`flex-1 text-[9px] py-1 rounded transition-colors ${assetTab === 'image' ? 'bg-purple-600/30 text-purple-300' : 'text-gray-600 hover:text-gray-400'}`}>图片素材</button>
        <button data-testid="asset-tab-video" onClick={() => setAssetTab('video')}
          className={`flex-1 text-[9px] py-1 rounded transition-colors ${assetTab === 'video' ? 'bg-purple-600/30 text-purple-300' : 'text-gray-600 hover:text-gray-400'}`}>视频素材</button>
      </div>

      {/* Image tab */}
      {assetTab === 'image' && (
      <div data-testid="image-asset-library-panel" className="max-h-56 overflow-y-auto space-y-1">
        {(p.imageAssets || []).length === 0 ? (
          <div className="text-gray-500 text-[10px] text-center py-4 space-y-0.5">
            <div>暂无图片素材</div>
            <div className="text-[9px] text-gray-600">将图片拖入画布，或复制图片后 Ctrl+V 添加</div>
          </div>
        ) : (
          (p.imageAssets || []).map(a => (
            <div key={a.id} data-testid={`image-asset-card-${a.id}`} draggable
              onDragStart={e => {
                e.dataTransfer.setData('application/workbench-image-asset', JSON.stringify({ assetId: a.id }));
                e.dataTransfer.setData('application/workbench-asset', JSON.stringify({
                  id: a.id, filename: a.name, url: a.url, role: 'reference', createdAt: a.createdAt, _assetId: a.id
                }));
                e.dataTransfer.effectAllowed = 'move';
              }}
              className="flex items-center gap-2 bg-[#0a0f1a] border border-white/5 rounded-lg p-1.5 cursor-grab active:cursor-grabbing hover:border-purple-500/30 transition-colors">
              <img src={a.url} alt={a.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-gray-300 truncate">{a.name}</div>
                <div className="text-[8px] text-gray-600">
                  {a.source === 'drop-canvas' ? '画布拖入' : a.source === 'paste-canvas' ? '粘贴' : '节点拖入'} · {a.mimeType.split('/')[1] || a.mimeType}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      )}

      {/* 10I: Video tab — shows video history per shot */}
      {assetTab === 'video' && (
        <div data-testid="video-asset-library-panel" className="max-h-56 overflow-y-auto space-y-2">
          {Object.keys(p.videoAssetsByShot || {}).length === 0 ? (
            <div className="text-gray-500 text-[10px] text-center py-4 space-y-0.5">
              <div>暂无视频素材</div>
              <div className="text-[9px] text-gray-600">生成分镜视频后，会自动保存在这里</div>
            </div>
          ) : (
            Object.entries(p.videoAssetsByShot || {}).map(([shotKey, versions]) => (
              <div key={shotKey} data-testid={`video-shot-group-${shotKey}`} className="bg-[#111827] border border-white/5 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-[#0d1117] border-b border-white/5">
                  <span className="text-[9px] text-gray-400 font-medium">{shotKey}</span>
                </div>
                {((versions || []) as any[]).map((v: any, i: number) => {
                  const isCurrent = (p.currentVideoByShot || {})[shotKey] === v.id;
                  return (
                    <div key={v.id} data-testid={`video-version-card-${shotKey}-${v.versionLabel}`}
                      className={`px-2 py-1.5 border-b border-white/5 last:border-0 ${isCurrent ? 'bg-purple-900/10' : ''}`}>
                      {/* Top row: existing items */}
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] text-gray-500 w-6 flex-shrink-0">{v.versionLabel}</span>
                        <span className="text-[8px] text-gray-400 flex-1 truncate">{v.shotKey}</span>
                        {isCurrent ? (
                          <span data-testid={`video-current-badge-${shotKey}-${v.versionLabel}`} className="text-[7px] text-purple-300 bg-purple-900/30 px-1 rounded flex-shrink-0">当前使用中</span>
                        ) : (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {p.onSetCurrentVideo && (
                              <button data-testid={`video-set-current-${shotKey}-${v.versionLabel}`}
                                onClick={() => { p.onSetCurrentVideo?.(shotKey, v.id); }}
                                className="text-[7px] text-gray-500 hover:text-purple-300 bg-white/5 hover:bg-purple-900/20 rounded px-1 py-0.5">
                                设为当前
                              </button>
                            )}
                            {p.onSelectShot && (
                              <button data-testid={`video-view-${shotKey}-${v.versionLabel}`}
                                onClick={() => { p.onSelectShot?.(shotKey); }}
                                className="text-[7px] text-gray-500 hover:text-purple-300 bg-white/5 hover:bg-purple-900/20 rounded px-1 py-0.5">
                                查看
                              </button>
                            )}
                          </div>
                        )}
                        <span className={`text-[7px] flex-shrink-0 ${v.reviewStatus === 'approved' ? 'text-green-400' : v.reviewStatus === 'rejected' ? 'text-red-400' : 'text-amber-400'}`}>{v.reviewStatus === 'approved' ? '已通过' : v.reviewStatus === 'rejected' ? '驳回' : '待审'}</span>
                      </div>
                      {/* Provider + model row */}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span data-testid={`video-provider-${shotKey}-${v.versionLabel}`} className="text-[7px] text-gray-600">提供方: {v.provider || '-'}</span>
                        <span data-testid={`video-model-${shotKey}-${v.versionLabel}`} className="text-[7px] text-gray-600">模型: {v.model || '-'}</span>
                      </div>
                      {/* Review reason (only when rejected) */}
                      {v.reviewStatus === 'rejected' && (
                        <div data-testid={`video-review-reason-${shotKey}-${v.versionLabel}`} className="text-[7px] text-red-400/80 mt-0.5">
                          驳回原因: {v.reviewReason || '-'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  const renderTemplate = () => (
    <div className="space-y-2">
      <SectionCard title="视频模板" icon={<FileVideo className="w-3 h-3" />} testid="sidebar-section-template">
        {p.templates.map(t => (
          <button key={t.template_id} data-testid={`template-${t.product_type}`}
            onClick={() => p.onSelectTemplate(t.template_id)}
            className={`block text-[11px] px-2.5 py-1.5 rounded-lg w-full text-left transition-colors border ${p.selTemplateId === t.template_id ? 'bg-purple-900/30 text-purple-300 border-purple-700/40' : 'bg-transparent text-gray-500 border-transparent hover:bg-white/5 hover:text-gray-300'}`}>
            {t.template_name}
          </button>
        ))}
        {p.selTemplateId && <div data-testid="selected-template-id" className="text-gray-600 mt-1 text-[9px] truncate">已选择: {p.selTemplateId}</div>}
      </SectionCard>
    </div>
  );

  const renderBatch = () => (
    <div className="space-y-2">
      <SectionCard title="视频批次" icon={<Layers className="w-3 h-3" />} testid="sidebar-section-batch">
        <ActionBtn testid="create-video-batch-button" onClick={p.onCreateBatch} color="blue" disabled={!p.isReady || !p.selTemplateId}
          disabledReason={!p.isReady ? '请先完成前置步骤' : !p.selTemplateId ? '请先选择模板' : undefined} icon={<Layers className="w-3 h-3" />}>创建视频批次</ActionBtn>
        {p.batchId && <div data-testid="batch-id" className="text-gray-500 mt-1 text-[9px] truncate">batch_id: {p.batchId}</div>}
        {p.instance && <div data-testid="instance-id" className="text-gray-500 text-[9px] truncate">instance_id: {p.instance.instance_id}</div>}
        {p.batchId && (
          <ActionBtn testid="generate-batch-button" onClick={p.onGenerate} color="green" icon={<Play className="w-3 h-3" />}>生成视频批次</ActionBtn>
        )}
      </SectionCard>
    </div>
  );

  const renderModel = () => (
    <div className="space-y-2">
      <SectionCard title="模型适配器" icon={<Cpu className="w-3 h-3" />}>
        <div data-testid="model-settings-panel" className="space-y-1.5">
          <select data-testid="model-adapter-select" value={p.modelAdapter} onChange={e => p.onSetModelAdapter(e.target.value)}
            className="bg-[#0a0f1a] border border-white/10 rounded-lg px-2.5 py-1.5 text-gray-300 text-xs w-full focus:outline-none focus:border-purple-500/50 transition-colors">
            {(p.adapters || []).map((a: any) => <option key={a.adapter_key} value={a.adapter_key} disabled={!a.configured}>{a.adapter_key}{!a.configured ? ' (未配置)' : ''}</option>)}
          </select>
          <div data-testid="model-adapter-status-mock" className="text-green-400 text-[10px] flex items-center gap-1.5 px-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" /> mock：ready</div>
          <div data-testid="model-adapter-status-external_http" className="text-gray-600 text-[10px] flex items-center gap-1.5 px-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-600" /> external_http：未配置</div>
          <div data-testid="selected-model-adapter" className="text-gray-600 text-[9px] px-1">当前：{p.modelAdapter}</div>
        </div>
      </SectionCard>
    </div>
  );

  const renderShots = () => (
    <div className="space-y-2">
      {p.onSelectShot && (
        <div className="bg-[#111827] border border-white/5 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#0d1117]">
            <span className="text-gray-500"><Layers className="w-3 h-3" /></span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">分镜列表</span>
          </div>
          <div className="p-2 space-y-0.5">
            {['S01_main','S02_detail1','S03_detail2','S04_motion','S05_scene','S06_brand'].map(sk => {
              const names: Record<string,string> = {S01_main:'主图-正面',S02_detail1:'细节特写-材质',S03_detail2:'细节特写-结构',S04_motion:'运镜展示',S05_scene:'场景陈列',S06_brand:'收尾呼应'};
              return (
                <button key={sk} data-testid={`workflow-shot-${sk}`} onClick={() => p.onSelectShot?.(sk)}
                  className={`text-[10px] px-2 py-1 rounded w-full text-left transition-colors ${p.selectedShotKey === sk ? 'bg-purple-900/40 text-purple-300 border border-purple-500/30' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>
                  {sk} · {names[sk] || sk}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {p.instance && p.allSuccess && (
        <SectionCard title="操作" icon={<CheckCheck className="w-3 h-3" />} testid="sidebar-section-actions">
          <ActionBtn testid="merge-preview-button" onClick={p.onMerge} color="purple" icon={<Eye className="w-3 h-3" />}
            disabled={!approvedGate} disabledReason={!approvedGate ? (blockedReason || '请先审核通过全部分镜') : undefined}>合并预览</ActionBtn>
          {p.instance.draft_preview_url && <div data-testid="draft-preview-url" className="text-green-400 text-[9px] break-all px-1 py-1 bg-green-900/10 rounded-lg border border-green-500/10">{p.instance.draft_preview_url}</div>}
          <div data-testid="instance-review-status" className="text-gray-500 text-[10px] px-1">审核状态: {p.instance.review_status || '-'}</div>
          <ActionBtn testid="approve-all-button" onClick={p.onApproveAll} color="green" icon={<CheckCheck className="w-3 h-3" />}>全部通过</ActionBtn>
          <ActionBtn testid="export-button" onClick={p.onExport} color="orange" disabled={!p.canExport || !approvedGate}
            disabledReason={!approvedGate ? (blockedReason || '请先审核通过全部分镜') : (!p.canExport ? '审核未通过' : undefined)} icon={<Download className="w-3 h-3" />}>导出</ActionBtn>
          {blockedShots.length > 0 && (
            <div data-testid="approved-merge-gate-panel" className="space-y-1 pt-1 border-t border-white/5">
              <div data-testid="approved-merge-blocked-list" className="space-y-0.5">
                {blockedShots.map(b => (
                  <div key={b.shotKey} className="text-[8px] text-gray-500 px-1 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-amber-500/50 flex-shrink-0" />{b.shotName} · {b.reviewStatus === 'pending' || b.reviewStatus === 'missing' ? '待审核' : b.reviewStatus === 'rejected' ? '未通过' : b.reviewStatus}
                  </div>
                ))}
              </div>
            </div>
          )}
          {p.instance.final_video_url && <div data-testid="final-video-url" className="text-green-400 text-[9px] break-all px-1 py-1 bg-green-900/10 rounded-lg border border-green-500/10">{p.instance.final_video_url}</div>}
        </SectionCard>
      )}
    </div>
  );

  const renderDirectorDesk = () => {
    const isDesk = (p.productLine || 'desk_calendar') === 'desk_calendar';
    const shotNames = isDesk ? SHOT_NAMES_DESK : SHOT_NAMES_WALL;
    const shotKeys = Object.keys(shotNames);
    return (
      <DirectorConsole
        instance={p.instance}
        productLine={p.productLine}
        optionalShotEnabled={p.optionalShotEnabled}
        currentVideoByShot={p.currentVideoByShot}
        videoAssetsByShot={p.videoAssetsByShot}
        shotNames={shotNames}
        shotKeys={shotKeys}
        compositionOrder={p.compositionOrder}
        onSetCompositionOrder={p.onSetCompositionOrder}
        instanceId={p.instance?.instance_id}
      />
    );
  };

  const sectionRenderers: Record<SectionKey, () => React.ReactNode> = {
    productLine: renderProductLine,
    assets: renderAssets,
    directorDesk: renderDirectorDesk,
    template: renderTemplate,
    batch: renderBatch,
    model: renderModel,
    shots: renderShots,
  };

  // ── Render ──
  return (
    <>
      {/* Dock — always-visible 48px icon rail, in layout flow */}
      <aside data-testid="workflow-sidebar"
        className="w-12 h-full flex-shrink-0 relative bg-[#0a0f1a] border-r border-white/5 text-xs z-30"
      >
        <div data-testid="workflow-sidebar-collapsed"
          className="absolute left-0 top-0 w-12 h-full flex flex-col items-center py-3 gap-3 overflow-hidden">
          {SECTION_ORDER.map(section => (
            <React.Fragment key={section}>{iconBtn(section)}</React.Fragment>
          ))}
        </div>
      </aside>

      {/* Localised module popover — fixed at the hovered icon's Y, not full-height.
          Compact: header + scrollable body only, no footer. */}
      <div
        data-testid="workflow-sidebar-expanded"
        className="bg-[#0a0f1a] border border-white/10 border-l-2 border-l-purple-500/50 rounded-r-lg shadow-lg text-xs overflow-hidden"
        style={{
          position: 'fixed',
          left: '48px',
          top: panelTop,
          width: '288px',
          maxHeight: '520px',
          zIndex: 9999,
          visibility: isOpen ? 'visible' : 'hidden',
          pointerEvents: isOpen ? 'auto' : 'none',
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'translateX(0)' : 'translateX(-8px)',
          transition: 'opacity 180ms ease-out, transform 180ms ease-out',
          display: 'flex',
          flexDirection: 'column',
        }}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={startCloseTimer}
      >
        {/* Header — section icon + label */}
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#0d1117]">
          {(() => { const Icon = SECTION_META[activeSection].icon; return <Icon className="w-3.5 h-3.5 text-purple-400" />; })()}
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {SECTION_META[activeSection].label}
          </span>
        </div>

        {/* Body — scrollable only when content exceeds max-height */}
        <div style={{ overflowY: 'auto', padding: '10px' }}>
          {p.error && (
            <div data-testid="error-message" className="flex items-start gap-2 bg-red-950/30 border border-red-500/20 text-red-300 px-3 py-2 rounded-xl text-[11px] mb-2.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span className="flex-1 break-all">{p.error}</span>
              <button onClick={p.onClearError} className="text-red-400 hover:text-red-300 flex-shrink-0"><X className="w-3 h-3" /></button>
            </div>
          )}
          {sectionRenderers[activeSection]()}
        </div>
      </div>
    </>
  );
};
