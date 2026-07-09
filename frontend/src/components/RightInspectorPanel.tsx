import React, { useState } from 'react';
import * as api from '../api/mvp3';
import { Eye, Check, X, RotateCcw, AlertCircle, Activity, Cpu, Layers, FileVideo, Settings, Edit3, Play, Loader2 } from 'lucide-react';
import { type StoryboardPromptConfig, getDefaultStoryboardConfig, buildFinalPrompt, buildStandardShotPrompt, SHOT_SIZE_OPTIONS, CAMERA_MOVE_OPTIONS, LIGHTING_MOOD_OPTIONS, MOTION_INTENSITY_OPTIONS, DEFOCUS_LEVEL_OPTIONS, SAFETY_SUFFIX } from '../lib/storyboardPrompt';

interface NodeDetail {
  node_id: string; shot_key: string; shot_name: string; shot_order: number;
  duration_seconds: number; required_asset_role: string;
  bound_asset_id?: string; bound_asset_role?: string; bound_asset_source?: string;
  status: string; review_status?: string; review_reason?: string;
  prompt?: string; video_url?: string; cover_url?: string; error_message?: string;
}

interface WorkbenchAsset { id: string; filename: string; url: string; role: string; createdAt: number; }
interface ShotFrameBinding { shotKey: string; startFrameAssetId?: string; endFrameAssetId?: string; referenceAssetIds?: string[]; }

interface Props {
  node: NodeDetail | null;
  instanceId: string;
  onRefresh: () => void;
  instance?: any;
  modelAdapter?: string;
  batchStatus?: string;
  nodeCount?: number;
  assets?: WorkbenchAsset[];
  selectedBinding?: ShotFrameBinding;
  getBoundAsset?: (assetId?: string) => WorkbenchAsset | undefined;
  onBindShotFrame?: (shotKey: string, frameType: 'startFrame' | 'endFrame' | 'reference', assetId: string | null) => void;
  onGenerateSingleShot?: (nodeId: string, shotKey: string) => void;
  onRegenerateShot?: (nodeId: string, shotKey: string) => void;
  onReviewAction?: (shotKey: string, action: string, reason?: string) => void;
  generatingShotKeys?: string[];
  storyboardConfigs?: Record<string, StoryboardPromptConfig>;
  productLine?: 'desk_calendar' | 'wall_calendar';
  onUpdateStoryboardConfig?: (shotKey: string, config: StoryboardPromptConfig) => void;
  motionShotVersion?: 'primary' | 'backup';
  onSetMotionShotVersion?: (v: 'primary' | 'backup') => void;
  // 10E: Per-shot reference lists
  shotReferences?: Record<string, any[]>;
  // 10F: Move reference ordering (up/down buttons)
  onMoveShotRefOrder?: (shotKey: string, sourceNodeId: string, direction: 'up' | 'down') => void;
  // 10F-2: Drag reorder — set full order array
  onDragSortOrder?: (shotKey: string, orderedIds: string[]) => void;
  // 10G-2: Per-shot batch count
  shotBatchCounts?: Record<string, number>;
  onSetShotBatchCount?: (shotKey: string, count: number) => void;
  // 10I: Video asset library for video preview
  videoAssetsByShot?: Record<string, any[]>;
  currentVideoByShot?: Record<string, string>;
  // 10J: Composition director
  canMerge?: boolean;
  mergeStatus?: string;
  onOpenDirector?: () => void;
}

const reviewBadgeCls: Record<string, string> = {
  approved: 'text-green-400 bg-green-900/30 border-green-500/30',
  rejected: 'text-red-400 bg-red-900/30 border-red-500/30',
  pending: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30',
  not_ready: 'text-gray-500 bg-gray-800 border-gray-600/20',
  not_required: 'text-gray-500 bg-gray-800 border-gray-600/20',
};
const statusBadgeCls: Record<string, string> = {
  pending: 'text-gray-400 bg-gray-800 border-gray-600/30',
  running: 'text-blue-400 bg-blue-900/30 border-blue-500/30',
  success: 'text-green-400 bg-green-900/30 border-green-500/30',
  failed: 'text-red-400 bg-red-900/30 border-red-500/30',
};

export const RightInspectorPanel: React.FC<Props> = ({ node, instanceId, onRefresh, instance, modelAdapter, batchStatus, nodeCount, assets, selectedBinding, getBoundAsset, onBindShotFrame, onGenerateSingleShot, onRegenerateShot, onReviewAction, generatingShotKeys, storyboardConfigs, onUpdateStoryboardConfig, motionShotVersion, onSetMotionShotVersion, productLine, shotReferences, onMoveShotRefOrder, onDragSortOrder, shotBatchCounts, onSetShotBatchCount, videoAssetsByShot, currentVideoByShot, canMerge, mergeStatus, onOpenDirector }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inspectorMode, setInspectorMode] = useState<'basic' | 'advanced'>('basic');

  const doAction = async (fn: () => Promise<any>, after?: () => void) => {
    try { setError(''); setLoading(true); await fn(); after?.(); await onRefresh(); } catch (e: any) { setError(e?.message || String(e)); } finally { setLoading(false); }
  };

  const rv = node?.review_status || '-';
  const rvCls = reviewBadgeCls[rv] || reviewBadgeCls.not_ready;
  const stCls = statusBadgeCls[node?.status || ''] || statusBadgeCls.pending;

  return (
    <aside data-testid="right-inspector-panel"
      className={`h-full flex flex-col bg-[#0d1117] border-l border-white/5 overflow-hidden text-xs transition-all duration-300 ease-in-out flex-shrink-0 ${!node ? 'w-[44px]' : 'w-80'}`}>
      {/* Collapsed empty state — narrow bar with vertical label */}
      {!node && (
        <div data-testid="inspector-collapsed" className="flex-1 flex items-center justify-center">
          <div data-testid="inspector-empty-state" className="flex flex-col items-center gap-2 text-gray-600">
            <Eye className="w-4 h-4" />
            <span style={{ writingMode: 'vertical-lr', letterSpacing: '0.1em', fontSize: '10px' }} className="text-gray-500 tracking-wider select-none">检查器</span>
          </div>
        </div>
      )}

      {/* Expanded detail panel — shown when a node is selected */}
      {node && (
        <div data-testid="inspector-expanded" className="flex-1 flex flex-col min-h-0">
          <div data-testid="inspector-slide-panel" className="flex-1 flex flex-col min-h-0">
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-white/5 bg-[#111827]">
          <Eye className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-gray-300 font-medium text-[11px] tracking-wide">属性检查器</span>
          {node && <span className="text-gray-600 text-[10px] ml-auto">{node.shot_key}</span>}
        </div>
        <div data-testid="canvas-node-detail-panel" className="flex-1 flex flex-col min-h-0 overflow-y-auto" style={{ minHeight: 200 }}>
          {error && (
            <div data-testid="canvas-detail-error-message"
              className="flex-shrink-0 flex items-start gap-2 bg-red-950/40 border-b border-red-500/20 text-red-300 px-3 py-2 text-[11px]">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}
          {loading && (
            <div className="flex-shrink-0 text-blue-400 text-[11px] px-3 py-1.5 bg-blue-950/20 border-b border-blue-500/10 animate-pulse">处理中...</div>
          )}

          <div className="flex-shrink-0 p-3 space-y-3">
            <div>
              <div data-testid="canvas-detail-shot-key" className="text-sm font-semibold text-gray-100">{node.shot_key}</div>
              <div className="text-gray-500 text-[11px] mt-0.5">{node.shot_name}</div>
            </div>

            <div className="flex gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${stCls}`}>{node.status}</span>
              <span data-testid="canvas-detail-review-status" className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${rvCls}`}>审核: {rv}</span>
            </div>
            {node.review_status === 'rejected' && node.review_reason && (
              <div data-testid="single-shot-rejected-reason" className="text-red-400 text-[9px]">{node.review_reason}</div>
            )}

            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px] bg-[#0a0f1a] rounded-lg p-2.5 border border-white/5">
              <div><div className="text-gray-600 mb-0.5">状态</div><div data-testid="canvas-detail-status" className="text-gray-200">{node.status}</div></div>
              <div><div className="text-gray-600 mb-0.5">bound_asset_role</div><div className="text-gray-300">{node.bound_asset_role || '-'}</div></div>
              <div><div className="text-gray-600 mb-0.5">时长</div><div className="text-gray-300">{node.duration_seconds}秒</div></div>
              <div><div className="text-gray-600 mb-0.5">bound_asset_source</div><div className="text-gray-500 truncate">{node.bound_asset_source || '-'}</div></div>
            </div>

            {/* 10E: Reference image list for this shot */}
            {node.shot_key && shotReferences && shotReferences[node.shot_key] && (
              <div data-testid="inspector-shot-references" className="bg-[#0a0f1a] rounded-lg p-2.5 border border-white/5 space-y-1">
                <div className="text-gray-400 text-[10px] font-medium">参考图列表（可拖拽排序）</div>
                <div className="text-[9px] text-gray-500">
                  共 {shotReferences[node.shot_key].length} 张 · ready {shotReferences[node.shot_key].filter((r: any) => r.status === 'ready').length}
                </div>
                {(() => {
                  const refs = shotReferences[node.shot_key];
                  const readyCount = refs.filter((r: any) => r.status === 'ready').length;
                  return refs.map((ref: any, i: number) => (
                    <div key={ref.id}
                      data-testid={`shot-ref-order-item-${node.shot_key}-${ref.sourceNodeId}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', ref.sourceNodeId);
                        e.dataTransfer.effectAllowed = 'move';
                        (e.currentTarget as HTMLElement).style.opacity = '0.4';
                      }}
                      onDragEnd={(e) => {
                        (e.currentTarget as HTMLElement).style.opacity = '1';
                      }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const draggedId = e.dataTransfer.getData('text/plain');
                        if (draggedId && draggedId !== ref.sourceNodeId && onDragSortOrder) {
                          const newOrder = refs.map(r => r.sourceNodeId);
                          const fromIdx = newOrder.indexOf(draggedId);
                          const toIdx = i;
                          if (fromIdx >= 0 && fromIdx !== toIdx) {
                            newOrder.splice(fromIdx, 1);
                            newOrder.splice(toIdx, 0, draggedId);
                            onDragSortOrder(node.shot_key, newOrder);
                          }
                        }
                      }}
                      className="flex items-center gap-1.5 text-[9px] cursor-grab active:cursor-grabbing hover:bg-white/5 rounded px-1 py-0.5 transition-colors">
                      {/* Drag handle */}
                      <span data-testid={`shot-ref-drag-handle-${node.shot_key}-${ref.sourceNodeId}`} className="text-gray-600 cursor-grab flex-shrink-0">⠿</span>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ref.status === 'ready' ? 'bg-green-400' : 'bg-amber-500'}`} />
                      <span className="text-gray-500 w-12 flex-shrink-0">
                        {readyCount <= 2
                          ? (i === 0 ? '首帧' : i === 1 ? '尾帧' : `参考图 ${i+1}`)
                          : `参考图 ${i+1}`
                        }
                      </span>
                      <span className="text-gray-400">{ref.kind === 'fixed' ? '固定' : '自由'}</span>
                      <span className="text-gray-300 truncate flex-1">{ref.fileName || ref.sourceNodeId}</span>
                      <span className={`text-[8px] ${ref.status === 'ready' ? 'text-green-500' : 'text-amber-500'}`}>
                        {ref.status === 'ready' ? '已绑定' : '缺图'}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* 10G-2: Generate batch count */}
            {node.shot_key && onSetShotBatchCount && (
              <div data-testid="inspector-batch-count" className="bg-[#0a0f1a] rounded-lg p-2.5 border border-white/5 space-y-1">
                <div className="text-gray-400 text-[10px] font-medium">生成设置</div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-500">生成批次</span>
                  <select data-testid="batch-count-select"
                    value={String((shotBatchCounts || {})[node.shot_key] || 1)}
                    onChange={e => onSetShotBatchCount(node.shot_key, parseInt(e.target.value))}
                    className="bg-[#0a0f1a] border border-white/10 rounded px-2 py-1 text-gray-200 text-[10px]">
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="4">4</option>
                  </select>
                </div>
              </div>
            )}

            {/* 分镜属性面板 */}
            {onUpdateStoryboardConfig && node.shot_key && (() => {
              const sk = node.shot_key;
              const config = (storyboardConfigs || {})[sk] || getDefaultStoryboardConfig(sk, productLine, motionShotVersion);
              const update = (c: StoryboardPromptConfig) => onUpdateStoryboardConfig(sk, c);
              const finalPrompt = buildFinalPrompt(config);
              const safetyMoves = ['推进', '拉远'];
              return (
                <div className="bg-[#111827] border border-white/5 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-[10px] font-medium flex items-center gap-1"><Settings className="w-3 h-3" /> 分镜属性</span>
                    <div className="flex gap-0.5 bg-[#0a0f1a] rounded p-0.5">
                      <button data-testid={`inspector-mode-basic-${sk}`} onClick={() => setInspectorMode('basic')}
                        className={`text-[9px] px-2 py-0.5 rounded ${inspectorMode === 'basic' ? 'bg-purple-600/50 text-purple-200' : 'text-gray-500 hover:text-gray-300'}`}>常规</button>
                      <button data-testid={`inspector-mode-advanced-${sk}`} onClick={() => setInspectorMode('advanced')}
                        className={`text-[9px] px-2 py-0.5 rounded ${inspectorMode === 'advanced' ? 'bg-purple-600/50 text-purple-200' : 'text-gray-500 hover:text-gray-300'}`}>高级</button>
                    </div>
                  </div>
                  {inspectorMode === 'basic' ? (
                    <div className="space-y-1.5">
                      {[
                        { label: '景别', key: 'shot_size', opts: SHOT_SIZE_OPTIONS },
                        { label: '运镜方式', key: 'camera_move', opts: CAMERA_MOVE_OPTIONS },
                        { label: '光线氛围', key: 'lighting_mood', opts: LIGHTING_MOOD_OPTIONS },
                        { label: '运动幅度', key: 'motion_intensity', opts: MOTION_INTENSITY_OPTIONS },
                        { label: '背景虚化', key: 'defocus_level', opts: DEFOCUS_LEVEL_OPTIONS },
                      ].map(f => (
                        <div key={f.key} className="flex items-center gap-2">
                          <span className="text-gray-500 text-[9px] w-14 flex-shrink-0">{f.label}</span>
                          <select data-testid={`storyboard-${f.key}-${sk}`} value={(config as any)[f.key] || ''} disabled={config.is_prompt_customized}
                            onChange={e => update({ ...config, [f.key]: e.target.value, is_prompt_customized: false })}
                            className={`bg-[#0a0f1a] border border-white/10 rounded px-2 py-1 text-gray-200 text-[10px] flex-1 ${config.is_prompt_customized ? 'opacity-30' : ''}`}>
                            {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      ))}
                      {safetyMoves.includes(config.camera_move) && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-[9px] w-14 flex-shrink-0">安全边距</span>
                          <select data-testid={`storyboard-safety_margin-${sk}`} value={config.safety_margin} disabled={config.is_prompt_customized}
                            onChange={e => update({ ...config, safety_margin: parseInt(e.target.value), is_prompt_customized: false })}
                            className="bg-[#0a0f1a] border border-white/10 rounded px-2 py-1 text-gray-200 text-[10px] flex-1">
                            {[5, 8, 10, 15, 20].map(v => <option key={v} value={v}>{v}%</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <textarea data-testid={`storyboard-custom-prompt-${sk}`} value={config.custom_prompt_override || buildStandardShotPrompt(config)}
                        onChange={e => update({ ...config, custom_prompt_override: e.target.value, is_prompt_customized: true })}
                        className="bg-[#0a0f1a] border border-white/10 rounded px-2 py-1 text-gray-200 text-[10px] w-full h-20 resize-none"
                        placeholder="自定义提示词..." />
                      <div className="flex items-center gap-2">
                        <button data-testid={`storyboard-reset-prompt-${sk}`}
                          onClick={() => update({ ...getDefaultStoryboardConfig(sk, productLine, motionShotVersion), custom_prompt_override: undefined, is_prompt_customized: false })}
                          className="text-[9px] text-purple-400 hover:text-purple-300">重置为标准模板</button>
                        <label className="flex items-center gap-1 text-[9px] text-gray-500 ml-auto">
                          <input type="checkbox" data-testid={`storyboard-safety-suffix-${sk}`} checked={config.safety_suffix_enabled}
                            onChange={e => update({ ...config, safety_suffix_enabled: e.target.checked })} className="w-3 h-3" />
                          安全约束
                        </label>
                      </div>
                      <div className="text-[9px] text-gray-600 bg-[#0a0f1a] rounded p-1.5 break-all leading-relaxed">
                        <span className="text-gray-500">提交提示词：</span>{finalPrompt}
                      </div>
                    </div>
                  )}
                  {config.is_prompt_customized && (
                    <div data-testid="custom-prompt-product-line-protection-warning" className="text-[8px] text-amber-400 space-y-0.5">
                      <div className="flex items-center gap-1"><Edit3 className="w-2.5 h-2.5" /> 已自定义提示词，常规字段已锁定</div>
                      <div>该分镜已自定义，切换产品线未自动覆盖提示词</div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 10I: Current video preview from video library */}
            {node.shot_key && (() => {
              const currentVideoId = (currentVideoByShot || {})[node.shot_key];
              const currentVideo = currentVideoId ? ((videoAssetsByShot || {})[node.shot_key] || []).find((v: any) => v.id === currentVideoId) : null;
              if (currentVideo) return (
                <div data-testid="inspector-current-video" className="bg-[#0a0f1a] rounded-lg p-2.5 border border-white/5">
                  <div className="text-gray-600 text-[10px] mb-1">当前视频 · {currentVideo.versionLabel}</div>
                  <span className={`text-[8px] ${currentVideo.reviewStatus === 'approved' ? 'text-green-400' : currentVideo.reviewStatus === 'rejected' ? 'text-red-400' : 'text-amber-400'}`}>{currentVideo.reviewStatus === 'approved' ? '已通过' : currentVideo.reviewStatus === 'rejected' ? '驳回' : '待审'}</span>
                </div>
              );
              return null;
            })()}
            {/* 10J: Composition director section (shown when merge node is selected) */}
            {node?.shot_key === 'merge-node' && (
              <div data-testid="inspector-composition-director"
                   className="flex-shrink-0 mx-3 mb-3 bg-[#111827] border border-white/5 rounded-lg p-2.5 space-y-2">
                <div className="text-gray-400 text-[10px] font-medium">总合成导演台</div>
                <div className="text-gray-500 text-[9px]">
                  状态: <span className={canMerge ? 'text-green-400' : 'text-amber-400'}>
                    {mergeStatus || '等待全部通过'}
                  </span>
                </div>
                {!canMerge && (
                  <div className="text-[8px] text-gray-600">
                    还有分镜未通过审核，导演台将以当前已通过片段打开
                  </div>
                )}
                <button
                  data-testid="inspector-open-director"
                  onClick={onOpenDirector}
                  className={`w-full text-[10px] rounded-lg px-3 py-2 font-medium transition-colors ${
                    canMerge
                      ? 'bg-purple-800/40 text-purple-300 hover:bg-purple-700/50 border border-purple-700/20'
                      : 'bg-purple-900/20 text-purple-400/60 hover:bg-purple-800/30 border border-purple-700/10'
                  }`}
                >
                  打开总合成导演台
                </button>
              </div>
            )}
            {node.video_url && !(currentVideoByShot || {})[node.shot_key] && (
              <div className="bg-[#0a0f1a] rounded-lg p-2.5 border border-white/5">
                <div className="text-gray-600 text-[10px] mb-1">视频预览</div>
                <video data-testid="single-shot-video-preview" src={node.video_url} controls preload="metadata" className="w-full rounded border border-white/5" style={{ maxHeight: 160 }} />
              </div>
            )}
            {node.prompt && (
              <div className="bg-[#0a0f1a] rounded-lg p-2.5 border border-white/5">
                <div className="text-gray-600 text-[10px] mb-1">prompt</div>
                <div className="text-gray-400 break-all text-[10px] leading-relaxed">{node.prompt}</div>
              </div>
            )}
            {node.error_message && (
              <div className="bg-red-950/20 border border-red-500/20 rounded-lg p-2.5">
                <div className="text-red-400 text-[10px] mb-1">错误信息</div>
                <div className="text-red-300 text-[10px]">{node.error_message}</div>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 p-3 border-t border-white/5 space-y-2 mt-auto">
            {node.status === 'failed' && (
              <button data-testid="canvas-detail-retry-button"
                onClick={() => doAction(() => api.retryVideoNode(node.node_id))}
                className="flex items-center justify-center gap-1.5 bg-orange-900/40 hover:bg-orange-900/60 text-orange-300 text-xs px-3 py-2 rounded-lg w-full transition-colors border border-orange-700/20 font-medium">
                <RotateCcw className="w-3 h-3" /> 重试
              </button>
            )}
            {node.status === 'success' && (
              <>
                <button data-testid="canvas-detail-approve-button"
                  onClick={() => doAction(() => api.reviewVideoNode(node.node_id, 'approve'), () => onReviewAction?.(node.shot_key, 'approve'))}
                  className="flex items-center justify-center gap-1.5 bg-green-900/40 hover:bg-green-900/60 text-green-300 text-xs px-3 py-2 rounded-lg w-full transition-colors border border-green-700/20 font-medium">
                  <Check className="w-3 h-3" /> 通过
                </button>
                <div className="space-y-1.5">
                  <input data-testid="canvas-detail-reject-reason"
                    placeholder="输入驳回原因..."
                    value={reason} onChange={e => setReason(e.target.value)}
                    className="bg-[#0a0f1a] border border-white/10 rounded-lg px-3 py-2 text-gray-200 text-xs w-full placeholder:text-gray-600 focus:outline-none focus:border-red-500/50 transition-colors" />
                  <button data-testid="canvas-detail-reject-button"
                    onClick={() => { if (!reason.trim()) { setError('驳回必须填写原因'); return; } doAction(() => api.reviewVideoNode(node.node_id, 'reject', reason), () => onReviewAction?.(node.shot_key, 'reject', reason)); }}
                    className="flex items-center justify-center gap-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-300 text-xs px-3 py-2 rounded-lg w-full transition-colors border border-red-700/20 font-medium">
                    <X className="w-3 h-3" /> 驳回
                  </button>
                </div>
              </>
            )}
            {node.status === 'success' && node.review_status === 'rejected' && onRegenerateShot && (
              <button data-testid="single-shot-regenerate-button"
                onClick={() => onRegenerateShot(node.node_id, node.shot_key)}
                className="flex items-center justify-center gap-1.5 bg-orange-900/40 hover:bg-orange-900/60 text-orange-300 text-xs px-3 py-2 rounded-lg w-full transition-colors border border-orange-700/20 font-medium mt-2">
                <RotateCcw className="w-3 h-3" /> 重新生成此分镜
              </button>
            )}
            {node.status !== 'success' && node.status !== 'failed' && (
              <div className="space-y-1.5">
                {node.status === 'pending' && onGenerateSingleShot && (
                  <>
                    {generatingShotKeys?.includes(node.shot_key) ? (
                      <div data-testid="single-shot-generating-status" className="flex items-center justify-center gap-1.5 text-blue-400 text-[10px] py-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> 生成中...
                      </div>
                    ) : (
                      <button data-testid="single-shot-generate-button"
                        onClick={() => onGenerateSingleShot(node.node_id, node.shot_key)}
                        className="flex items-center justify-center gap-1.5 bg-purple-900/40 hover:bg-purple-900/60 text-purple-300 text-xs px-3 py-2 rounded-lg w-full transition-colors border border-purple-700/20 font-medium">
                        <Play className="w-3 h-3" /> 生成此分镜
                      </button>
                    )}
                  </>
                )}
                {node.status !== 'pending' && (
                  <div className="text-gray-600 text-[10px] text-center py-2">节点完成后可进行操作</div>
                )}
              </div>
            )}
          </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
