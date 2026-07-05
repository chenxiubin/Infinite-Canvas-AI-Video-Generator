import React, { useState } from 'react';
import * as api from '../api/mvp3';
import { Eye, Check, X, RotateCcw, AlertCircle, Activity, Cpu, Layers, FileVideo, Settings, Edit3 } from 'lucide-react';
import { type StoryboardPromptConfig, getDefaultStoryboardConfig, buildFinalPrompt, buildStandardShotPrompt, SHOT_SIZE_OPTIONS, CAMERA_MOVE_OPTIONS, LIGHTING_MOOD_OPTIONS, MOTION_INTENSITY_OPTIONS, DEFOCUS_LEVEL_OPTIONS, SAFETY_SUFFIX } from '../lib/storyboardPrompt';

interface NodeDetail {
  node_id: string; shot_key: string; shot_name: string; shot_order: number;
  duration_seconds: number; required_asset_role: string;
  bound_asset_id?: string; bound_asset_role?: string; bound_asset_source?: string;
  status: string; review_status?: string;
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
  storyboardConfigs?: Record<string, StoryboardPromptConfig>;
  onUpdateStoryboardConfig?: (shotKey: string, config: StoryboardPromptConfig) => void;
  motionShotVersion?: 'primary' | 'backup';
  onSetMotionShotVersion?: (v: 'primary' | 'backup') => void;
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

export const RightInspectorPanel: React.FC<Props> = ({ node, instanceId, onRefresh, instance, modelAdapter, batchStatus, nodeCount, assets, selectedBinding, getBoundAsset, onBindShotFrame, storyboardConfigs, onUpdateStoryboardConfig, motionShotVersion, onSetMotionShotVersion }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inspectorMode, setInspectorMode] = useState<'basic' | 'advanced'>('basic');

  const doAction = async (fn: () => Promise<any>) => {
    try { setError(''); setLoading(true); await fn(); await onRefresh(); } catch (e: any) { setError(e?.message || String(e)); } finally { setLoading(false); }
  };

  const rv = node?.review_status || '-';
  const rvCls = reviewBadgeCls[rv] || reviewBadgeCls.not_ready;
  const stCls = statusBadgeCls[node?.status || ''] || statusBadgeCls.pending;

  return (
    <aside data-testid="right-inspector-panel"
      className="h-full flex flex-col bg-[#0d1117] border-l border-white/5 overflow-hidden text-xs">
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-white/5 bg-[#111827]">
        <Eye className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-gray-300 font-medium text-[11px] tracking-wide">属性检查器</span>
        {node && <span className="text-gray-600 text-[10px] ml-auto">{node.shot_key}</span>}
      </div>

      {/* Empty state — enhanced with production overview */}
      {!node && (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-3">
          <div className="text-center py-3">
            <div className="w-10 h-10 rounded-full bg-[#1a1f2e] flex items-center justify-center mx-auto mb-2">
              <Eye className="w-4 h-4 text-gray-600" />
            </div>
            <div className="text-gray-500 text-[11px]">请在画布中选择一个分镜节点查看详情</div>
          </div>

          {/* Production overview */}
          <div className="bg-[#111827] border border-white/5 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-gray-500 text-[10px]">
              <Activity className="w-3 h-3 text-purple-400" /> 当前状态
            </div>
            <div className="space-y-1.5 text-[10px]">
              <div className="flex justify-between"><span className="text-gray-600">模型适配器</span><span className="text-purple-300">{modelAdapter || 'mock'}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">视频批次</span><span className="text-gray-300">{batchStatus || (instanceId ? '就绪' : '未创建')}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">分镜节点数</span><span className="text-gray-300">{nodeCount || 0}</span></div>
            </div>
          </div>

          {/* Next steps */}
          <div className="bg-[#111827] border border-white/5 rounded-xl p-3">
            <div className="text-gray-500 text-[10px] mb-2">下一步操作</div>
            <div className="space-y-1.5 text-[10px] text-gray-600">
              <div>1. 在左侧面板创建演示产品</div>
              <div>2. 选择视频模板</div>
              <div>3. 创建并生成视频批次</div>
              <div>4. 点击画布中的分镜节点</div>
              <div>5. 审核通过后导出视频</div>
            </div>
          </div>
        </div>
      )}

      {/* Node detail */}
      {node && (
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

            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px] bg-[#0a0f1a] rounded-lg p-2.5 border border-white/5">
              <div><div className="text-gray-600 mb-0.5">状态</div><div data-testid="canvas-detail-status" className="text-gray-200">{node.status}</div></div>
              <div><div className="text-gray-600 mb-0.5">bound_asset_role</div><div className="text-gray-300">{node.bound_asset_role || '-'}</div></div>
              <div><div className="text-gray-600 mb-0.5">时长</div><div className="text-gray-300">{node.duration_seconds}秒</div></div>
              <div><div className="text-gray-600 mb-0.5">bound_asset_source</div><div className="text-gray-500 truncate">{node.bound_asset_source || '-'}</div></div>
            </div>

            {/* 分镜属性面板 */}
            {onUpdateStoryboardConfig && node.shot_key && (() => {
              const sk = node.shot_key;
              const config = (storyboardConfigs || {})[sk] || getDefaultStoryboardConfig(sk);
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
                          onClick={() => update({ ...getDefaultStoryboardConfig(sk), custom_prompt_override: undefined, is_prompt_customized: false })}
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
                    <div className="text-[8px] text-amber-400 flex items-center gap-1"><Edit3 className="w-2.5 h-2.5" /> 已自定义提示词，常规字段已锁定</div>
                  )}
                </div>
              );
            })()}

            {/* 分镜素材绑定 */}
            {onBindShotFrame && node.shot_key && (
              <div className="bg-[#111827] border border-white/5 rounded-lg p-2.5 space-y-2">
                <div data-testid="motion-shot-version-panel" className="bg-[#111827] border border-white/5 rounded-lg p-2.5 space-y-1.5">
                <div className="text-gray-400 text-[10px] font-medium">S04 动态展示方案</div>
                <div className="text-[8px] text-gray-600">该设置为模板级配置，影响当前模板下所有产品链</div>
                <select value={motionShotVersion || 'primary'}
                  onChange={e => onSetMotionShotVersion?.(e.target.value as 'primary' | 'backup')}
                  className="bg-[#0a0f1a] border border-white/10 rounded px-2 py-1 text-gray-200 text-[10px] w-full">
                  <option value="primary">主方案：翻页/动作定格</option>
                  <option value="backup">备用方案：尺寸参考同框</option>
                </select>
                <div className="text-[8px] text-gray-500">
                  {(motionShotVersion || 'primary') === 'primary'
                    ? '提示词方向：中景，静止或极轻微平移运镜，捕捉动作定格瞬间的动感，轻微运动幅度'
                    : '提示词方向：中景，产品与参照物同框展示尺寸对比，静止或轻微推进，轻微运动幅度'}
                </div>
              </div>
              <div className="text-gray-400 text-[10px] font-medium">分镜素材绑定</div>
                {/* 首帧 */}
                {(() => {
                  const sfAsset = getBoundAsset?.(selectedBinding?.startFrameAssetId);
                  return sfAsset ? (
                    <div data-testid="start-frame-preview" className="flex items-center gap-2 bg-[#0a0f1a] rounded-lg p-1.5">
                      <img src={sfAsset.url} className="w-10 h-10 rounded object-cover" />
                      <div className="flex-1 min-w-0"><div className="text-[10px] text-green-400">首帧已绑定</div><div className="text-[8px] text-green-600">已持久化 · 图生视频首帧输入</div></div>
                      <button onClick={() => onBindShotFrame(node.shot_key, 'startFrame', null)}
                        className="text-red-400 text-[9px] hover:underline">解绑</button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="text-[10px] text-amber-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> 未绑定首帧图</div>
                      {assets && assets.length > 0 ? (
                        <select data-testid="bind-start-frame-select" value="" onChange={e => { if (e.target.value) onBindShotFrame(node.shot_key, 'startFrame', e.target.value); }}
                          className="bg-[#0a0f1a] border border-white/10 rounded px-2 py-1 text-gray-300 text-[10px] w-full">
                          <option value="">选择首帧图...</option>
                          {assets.filter(a => a.role === 'start_frame' || a.role === 'product').map(a => <option key={a.id} value={a.id}>{a.filename}</option>)}
                        </select>
                      ) : <div className="text-gray-600 text-[9px]">请先在左侧素材包上传图片</div>}
                    </div>
                  );
                })()}
                {/* 尾帧 */}
                {(() => {
                  const efAsset = getBoundAsset?.(selectedBinding?.endFrameAssetId);
                  return efAsset ? (
                    <div data-testid="end-frame-preview" className="flex items-center gap-2 bg-[#0a0f1a] rounded-lg p-1.5">
                      <img src={efAsset.url} className="w-10 h-10 rounded object-cover" />
                      <div className="flex-1 min-w-0 text-[10px] text-green-400">尾帧已绑定</div>
                      <button onClick={() => onBindShotFrame(node.shot_key, 'endFrame', null)}
                        className="text-red-400 text-[9px] hover:underline">解绑</button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="text-[10px] text-gray-500">尾帧图（可选 · 本地暂存）</div>
                      {assets && assets.length > 0 ? (
                        <select data-testid="bind-end-frame-select" value="" onChange={e => { if (e.target.value) onBindShotFrame(node.shot_key, 'endFrame', e.target.value); }}
                          className="bg-[#0a0f1a] border border-white/10 rounded px-2 py-1 text-gray-300 text-[10px] w-full">
                          <option value="">选择尾帧图...</option>
                          {assets.filter(a => a.role === 'end_frame' || a.role === 'logo' || a.role === 'product').map(a => <option key={a.id} value={a.id}>{a.filename}</option>)}
                        </select>
                      ) : null}
                    </div>
                  );
                })()}
                {/* 参考图 */}
                {(() => {
                  const refAssets = (selectedBinding?.referenceAssetIds || []).map(id => getBoundAsset?.(id)).filter(Boolean) as WorkbenchAsset[];
                  return refAssets.length > 0 ? (
                    <div data-testid="reference-image-preview" className="space-y-1">
                      <div className="text-[10px] text-green-400">参考图已绑定（本地暂存） ({refAssets.length}张)</div>
                      {refAssets.map(a => (
                        <div key={a.id} className="flex items-center gap-2 bg-[#0a0f1a] rounded-lg p-1.5">
                          <img src={a.url} className="w-8 h-8 rounded object-cover" />
                          <span className="text-[9px] text-gray-400 truncate">{a.filename}</span>
                          <button onClick={() => onBindShotFrame(node.shot_key, 'reference', null)}
                            className="text-red-400 text-[9px] hover:underline ml-auto">解绑</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <select data-testid="bind-reference-select" value="" onChange={e => { if (e.target.value) onBindShotFrame(node.shot_key, 'reference', e.target.value); }}
                      className="bg-[#0a0f1a] border border-white/10 rounded px-2 py-1 text-gray-500 text-[10px] w-full">
                      <option value="">绑定参考图...</option>
                      {(assets || []).map(a => <option key={a.id} value={a.id}>{a.filename}</option>)}
                    </select>
                  );
                })()}
                {!selectedBinding?.startFrameAssetId && (
                  <div data-testid="frame-binding-warning" className="text-amber-400 text-[9px]">请先为该分镜绑定首帧图</div>
                )}
              </div>
            )}

            {node.video_url && (
              <div className="bg-[#0a0f1a] rounded-lg p-2.5 border border-white/5">
                <div className="text-gray-600 text-[10px] mb-1">视频地址</div>
                <div data-testid="canvas-detail-video-url" className="text-green-400 break-all text-[10px] leading-relaxed">{node.video_url}</div>
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
                  onClick={() => doAction(() => api.reviewVideoNode(node.node_id, 'approve'))}
                  className="flex items-center justify-center gap-1.5 bg-green-900/40 hover:bg-green-900/60 text-green-300 text-xs px-3 py-2 rounded-lg w-full transition-colors border border-green-700/20 font-medium">
                  <Check className="w-3 h-3" /> 通过
                </button>
                <div className="space-y-1.5">
                  <input data-testid="canvas-detail-reject-reason"
                    placeholder="输入驳回原因..."
                    value={reason} onChange={e => setReason(e.target.value)}
                    className="bg-[#0a0f1a] border border-white/10 rounded-lg px-3 py-2 text-gray-200 text-xs w-full placeholder:text-gray-600 focus:outline-none focus:border-red-500/50 transition-colors" />
                  <button data-testid="canvas-detail-reject-button"
                    onClick={() => { if (!reason.trim()) { setError('驳回必须填写原因'); return; } doAction(() => api.reviewVideoNode(node.node_id, 'reject', reason)); }}
                    className="flex items-center justify-center gap-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-300 text-xs px-3 py-2 rounded-lg w-full transition-colors border border-red-700/20 font-medium">
                    <X className="w-3 h-3" /> 驳回
                  </button>
                </div>
              </>
            )}
            {node.status !== 'success' && node.status !== 'failed' && (
              <div className="text-gray-600 text-[10px] text-center py-2">节点完成后可进行操作</div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
