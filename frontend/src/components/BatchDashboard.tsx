import React from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '../store/canvasStore';
import { Play, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

const BACKEND_URL = 'http://127.0.0.1:8000';

export function BatchDashboard() {
  const activeBatchTask = useCanvasStore((state) => state.activeBatchTask);
  const setInstanceId = useCanvasStore((state) => state.setInstanceId);
  const setNodes = useCanvasStore((state) => state.setNodes);
  const { setCenter } = useReactFlow();

  if (!activeBatchTask) return null;

  const handleItemClick = async (item: any) => {
    // Update the active instanceId to the clicked batch item's instance
    if (item.instance_id) {
      setInstanceId(item.instance_id);
    }

    const nodes = useCanvasStore.getState().nodes;
    // Find the first node of this instance to focus on
    const targetNode = nodes.find(n => n.id.endsWith(`_${item.instance_id}`));
    if (targetNode) {
      setCenter(targetNode.position.x + 100, targetNode.position.y + 100, { zoom: 1.2, duration: 800 });

      // Flash animation
      const el = document.querySelector(`[data-id="${targetNode.id}"]`);
      if (el) {
        el.classList.add('ring-4', 'ring-red-500', 'animate-pulse');
        setTimeout(() => {
          el.classList.remove('ring-4', 'ring-red-500', 'animate-pulse');
        }, 2000);
      }
    }

    // Refresh instance nodes from backend to get current status
    if (item.instance_id) {
      try {
        const resp = await fetch(`${BACKEND_URL}/api/v1/instances/${item.instance_id}`);
        if (resp.ok) {
          const details = await resp.json();
          const localRefNodes = nodes;
          const mergedNodes = details.nodes.map((bNode: any) => {
            const insNodeId = `${bNode.id}_${item.instance_id}`;
            const existingNode = nodes.find(n => n.id === insNodeId);
            return {
              id: insNodeId,
              type: 'custom',
              position: existingNode ? existingNode.position : { x: 0, y: 0 },
              data: {
                label: bNode.data.label,
                roleKey: bNode.data.roleKey,
                roleName: bNode.data.roleName,
                nodeType: bNode.data.nodeType,
                isFixed: bNode.data.isFixed,
                status: bNode.data.status,
                duration: bNode.data.duration,
                shotSize: bNode.data.shotSize,
                cameraMove: bNode.data.cameraMove,
                lightingMood: bNode.data.lightingMood,
                motionIntensity: bNode.data.motionIntensity,
                textLockEnabled: bNode.data.textLockEnabled,
                boundAssetUrl: bNode.data.boundAssetUrl,
                boundAssetSource: bNode.data.boundAssetSource,
                boundAssetRoleKey: bNode.data.boundAssetRoleKey,
                aiCandidateStatus: bNode.data.aiCandidateStatus,
                selectedCandidateId: bNode.data.selectedCandidateId,
              },
            };
          });
          // Replace only the nodes belonging to this instance, keep others
          const otherNodes = nodes.filter(n => !n.id.endsWith(`_${item.instance_id}`));
          setNodes([...otherNodes, ...mergedNodes]);
        }
      } catch (e) {
        console.error('Failed to refresh instance nodes:', e);
      }
    }
  };

  const total = activeBatchTask.total_count || 1;
  const pct = Math.round(((activeBatchTask.completed_count + activeBatchTask.failed_count) / total) * 100);

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[600px] bg-[#1e293b] border border-white/10 rounded-lg shadow-2xl p-4 text-white z-[100]">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-sm">批量生成任务 ({activeBatchTask.id.slice(0, 10)})</h3>
        <span className="text-xs text-gray-400">
          {activeBatchTask.status === 'running' ? '运行中...' : 
           activeBatchTask.status === 'completed' ? '已完成' : 
           activeBatchTask.status === 'partially_completed' ? '部分完成' : 
           activeBatchTask.status === 'failed' ? '全部失败' : '队列中'}
        </span>
      </div>
      
      {/* Progress Bar */}
      <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden mb-2">
        <div 
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      
      <div className="flex justify-between text-xs text-gray-400 mb-4">
        <span>总计: {activeBatchTask.total_count}</span>
        <span className="text-green-400">成功: {activeBatchTask.completed_count}</span>
        <span className="text-red-400">失败: {activeBatchTask.failed_count}</span>
      </div>
      
      {/* Items List */}
      <div className="max-h-40 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
        {activeBatchTask.items.map(item => (
          <div 
            key={item.id} 
            onClick={() => handleItemClick(item)}
            className={`flex justify-between items-center p-2 rounded text-sm transition-colors border ${
              item.status === 'failed' ? 'border-red-500/50 bg-red-500/10 cursor-pointer hover:bg-red-500/20' : 
              (item.status === 'completed' && item.error_message === '✨ 已手动修复') ? 'border-emerald-500/50 bg-emerald-500/10' :
              'border-white/5 bg-white/5'
            }`}
            data-testid={item.status === 'failed' ? `batch-item-failed-${item.product_sku}` : `batch-item-${item.product_sku}`}
          >
            <div className="flex items-center gap-2">
              {item.status === 'running' && <Play className="w-4 h-4 text-blue-400 animate-pulse" />}
              {item.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-400" />}
              {item.status === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
              {item.status === 'queued' && <AlertCircle className="w-4 h-4 text-gray-400" />}
              <span>{item.product_sku}</span>
            </div>
            {item.error_message && (
              <span className={`text-xs truncate max-w-[250px] ${item.error_message === '✨ 已手动修复' ? 'text-emerald-400 font-medium' : 'text-red-400'}`} title={item.error_message}>
                {item.error_message}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
