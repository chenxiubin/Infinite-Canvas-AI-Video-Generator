import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Play, CheckCircle2, AlertTriangle, Loader2, Sparkles, Image, ShieldAlert, Film, HelpCircle } from 'lucide-react';
import { useCanvasStore } from '../../store/canvasStore';
import type { NodeData, NodeStatus } from '../../store/canvasStore';

interface CustomNodeProps {
  id: string;
  data: NodeData;
  selected?: boolean;
}

export const CustomNode: React.FC<CustomNodeProps> = ({ id, data, selected }) => {
  const setSelectedNodeId = useCanvasStore((state) => state.setSelectedNodeId);
  const triggerMockGeneration = useCanvasStore((state) => state.triggerMockGeneration);
  const triggerAIGenerateCandidates = useCanvasStore((state) => state.triggerAIGenerateCandidates);
  const selectAICandidate = useCanvasStore((state) => state.selectAICandidate);
  const updateNodeStatus = useCanvasStore((state) => state.updateNodeStatus);

  const getStatusIcon = (status: NodeStatus) => {
    switch (status) {
      case 'generating':
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'failed':
        return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'pending':
      default:
        return <HelpCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getCardClasses = () => {
    let typeClass = '';
    let statusClass = '';

    // Node Type Color (PRD 06 Section 2.1)
    if (data.nodeType === 'asset') {
      typeClass = 'node-type-asset';
    } else if (data.nodeType === 'generation') {
      // AI Gen Node turns Grey once locked
      typeClass = data.aiCandidateStatus === 'locked' ? 'node-type-asset' : 'node-type-generation';
    } else if (data.nodeType === 'shot') {
      typeClass = data.isFixed ? 'node-type-fixed-shot' : 'node-type-variable-shot';
    } else if (data.nodeType === 'merge') {
      typeClass = 'node-type-merge';
    }

    // Status Border (PRD 06 Section 2.2)
    const isMismatched = 
      data.boundAssetUrl && 
      data.roleKey && 
      data.boundAssetRoleKey && 
      data.roleKey !== data.boundAssetRoleKey;

    if (isMismatched) {
      statusClass = 'node-status-warning';
    } else {
      switch (data.status) {
        case 'generating':
          statusClass = 'node-status-generating';
          break;
        case 'success':
          statusClass = 'node-status-success';
          break;
        case 'failed':
          statusClass = 'node-status-failed';
          break;
        case 'pending':
        default:
          statusClass = 'node-status-pending';
          break;
      }
    }

    return `custom-node ${typeClass} ${statusClass} ${selected ? 'node-selected' : ''}`;
  };

  const getRoleName = (key: string | undefined) => {
    if (!key) return '';
    const mapping: Record<string, string> = {
      'main': '主图-正面',
      'detail_1': '细节-纸张质感',
      'detail_2': '细节-结构工艺',
      'motion': '运镜素材-翻页/展开',
      'scene': '场景-桌面/墙面陈列'
    };
    return mapping[key] || key;
  };

  const isRoleMismatched = 
    data.boundAssetUrl && 
    data.roleKey && 
    data.boundAssetRoleKey && 
    data.roleKey !== data.boundAssetRoleKey;

  const handleNodeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNodeId(id);
  };

  return (
    <div 
      className={getCardClasses()} 
      onClick={handleNodeClick}
      style={{ 
        width: data.nodeType === 'shot' ? `${data.duration * 50 + 50}px` : '200px',
        minWidth: data.nodeType === 'shot' ? `${data.duration * 50 + 50}px` : '200px'
      }}
    >
      {/* Warning Badge for role mismatch */}
      {isRoleMismatched && (
        <div className="absolute -top-2.5 right-6 flex items-center bg-amber-600 text-[10px] text-white px-1.5 py-0.5 rounded border border-amber-500 shadow warning-icon group cursor-pointer z-50">
          <AlertTriangle className="w-3 h-3 mr-0.5" /> 角色不匹配
          <div className="warning-tooltip">
            角色不匹配：绑定了【{getRoleName(data.boundAssetRoleKey)}】，但该节点需要【{data.roleName}】
          </div>
        </div>
      )}

      {/* Handles */}
      {data.nodeType !== 'generation' && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: '#4b5563', width: 8, height: 8 }}
        />
      )}
      
      {data.nodeType === 'generation' ? (
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: '#f472b6', width: 8, height: 8 }}
        />
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: '#4b5563', width: 8, height: 8 }}
        />
      )}

      {/* Node Header */}
      <div className="node-header">
        <div className="node-title-group">
          {data.nodeType === 'generation' && <Sparkles className="w-3.5 h-3.5 text-pink-400" />}
          {data.nodeType === 'shot' && <Film className="w-3.5 h-3.5 text-purple-400" />}
          {data.nodeType === 'merge' && <Play className="w-3.5 h-3.5 text-gray-400" />}
          <span className="node-title">{data.label}</span>
        </div>
        <div className="node-status-indicator">
          {getStatusIcon(data.status)}
        </div>
      </div>

      {/* Node Body */}
      <div className="node-body">
        {data.nodeType === 'shot' && (
          <div className="shot-node-content">
            {/* Asset Preview / Thumbnail */}
            <div className="asset-thumbnail-container">
              {data.boundAssetUrl ? (
                <div className="relative group">
                  <img src={data.boundAssetUrl} alt="bound asset" className="asset-thumbnail" />
                  <span className={`source-badge ${data.boundAssetSource}`}>
                    {data.boundAssetSource === 'uploaded' ? '素材' : 'AI'}
                  </span>
                </div>
              ) : (
                <div className="asset-placeholder">
                  <Image className="w-6 h-6 text-gray-600 mb-1" />
                  <span className="text-[10px] text-gray-500">待绑定素材</span>
                </div>
              )}
            </div>

            {/* Properties Summary */}
            <div className="properties-summary">
              <div className="prop-row">
                <span className="prop-label">时长:</span>
                <span className="prop-val">{data.duration}s</span>
              </div>
              <div className="prop-row">
                <span className="prop-label">角色:</span>
                <span className="prop-val text-xs text-gray-400 truncate max-w-[80px]" title={data.roleName}>
                  {data.roleName || '未指定'}
                </span>
              </div>
              <div className="prop-row">
                <span className="prop-label">运镜:</span>
                <span className="prop-val">{data.cameraMove || '未指定'}</span>
              </div>
            </div>
            
            {/* Quick action buttons for testing */}
            <div className="node-actions mt-2 pt-2 border-t border-[#ffffff10] flex justify-between gap-1">
              <button 
                disabled={!data.boundAssetUrl || data.status === 'generating'}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerMockGeneration(id);
                }}
                className="action-btn flex-1"
              >
                生成
              </button>
              <button 
                disabled={data.status !== 'failed'}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerMockGeneration(id);
                }}
                className="action-btn text-red-400 border-red-500/20 hover:bg-red-500/10 flex-1"
              >
                重跑
              </button>
            </div>
          </div>
        )}

        {data.nodeType === 'generation' && (
          <div className="generation-node-content">
            {data.aiCandidateStatus === 'not_triggered' && (
              <div className="flex flex-col items-center py-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerAIGenerateCandidates(id);
                  }}
                  className="ai-action-btn"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1" /> 触发 AI 生成
                </button>
              </div>
            )}

            {data.aiCandidateStatus === 'candidates_generating' && (
              <div className="flex flex-col items-center py-4 text-gray-400 text-xs">
                <Loader2 className="w-6 h-6 text-pink-400 animate-spin mb-1" />
                <span>生成中，请稍候...</span>
              </div>
            )}

            {data.aiCandidateStatus === 'pending_selection' && (
              <div className="candidates-list-container">
                <span className="text-[10px] text-pink-300 font-medium mb-1 block">请选择一张锁定：</span>
                <div className="grid grid-cols-2 gap-1 mb-2">
                  {data.aiCandidates?.map((candidate) => (
                    <img
                      key={candidate.id}
                      src={candidate.url}
                      alt="candidate"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectAICandidate(id, candidate.id);
                      }}
                      className="candidate-img-option"
                    />
                  ))}
                </div>
              </div>
            )}

            {data.aiCandidateStatus === 'locked' && (
              <div className="locked-candidate-view">
                <div className="relative">
                  {data.aiCandidates?.find(c => c.id === data.selectedCandidateId) && (
                    <img 
                      src={data.aiCandidates.find(c => c.id === data.selectedCandidateId)?.url} 
                      alt="locked candidate" 
                      className="locked-candidate-img"
                    />
                  )}
                  <span className="locked-badge">已锁定 (S01首帧)</span>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerAIGenerateCandidates(id);
                  }}
                  className="text-[10px] text-pink-400 hover:underline mt-1 block text-center"
                >
                  重新生成
                </button>
              </div>
            )}
          </div>
        )}

        {data.nodeType === 'merge' && (
          <div className="merge-node-content py-2">
            <div className="flex flex-col items-center">
              <Film className={`w-8 h-8 ${data.status === 'success' ? 'text-green-400' : 'text-gray-600'} mb-2`} />
              <span className="text-xs text-gray-400 text-center mb-2">
                {data.status === 'success' ? '合成成功' : '等待分镜生成'}
              </span>
            </div>
            
            {/* Quick status controls for testing */}
            <div className="flex flex-col gap-1 w-full border-t border-[#ffffff10] pt-2 mt-1">
              <div className="flex gap-1">
                <button 
                  onClick={(e) => { e.stopPropagation(); updateNodeStatus(id, 'pending'); }} 
                  className={`status-test-btn flex-1 ${data.status === 'pending' ? 'active' : ''}`}
                >
                  待合成
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); updateNodeStatus(id, 'generating'); }} 
                  className={`status-test-btn flex-1 ${data.status === 'generating' ? 'active animate-pulse' : ''}`}
                >
                  合成中
                </button>
              </div>
              <div className="flex gap-1">
                <button 
                  onClick={(e) => { e.stopPropagation(); updateNodeStatus(id, 'success'); }} 
                  className={`status-test-btn flex-1 ${data.status === 'success' ? 'active' : ''}`}
                >
                  成功
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); updateNodeStatus(id, 'failed'); }} 
                  className={`status-test-btn flex-1 ${data.status === 'failed' ? 'active' : ''}`}
                >
                  失败
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Text Lock Indicator */}
      {data.textLockEnabled && (
        <div className="absolute -top-2.5 -left-2 flex items-center bg-orange-600/90 text-[9px] text-white px-1.5 py-0.5 rounded border border-orange-500/50 shadow">
          <ShieldAlert className="w-2.5 h-2.5 mr-0.5" /> 版面保护
        </div>
      )}
    </div>
  );
};
