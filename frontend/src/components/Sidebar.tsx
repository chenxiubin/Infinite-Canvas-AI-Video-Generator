import React, { useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { Image, Upload, RefreshCw, Package, CheckSquare, Square, AlertTriangle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface MockAsset {
  id: string;
  sku: string;
  roleKey: string;
  roleName: string;
  url: string;
  filename: string;
}

const mockUploadedAssets: MockAsset[] = [
  { id: 'a1', sku: 'SKU2027-A01', roleKey: 'main',     roleName: '主图-正面',    url: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=400&q=80', filename: 'SKU2027-A01_main.jpg' },
  { id: 'a2', sku: 'SKU2027-A01', roleKey: 'detail_1', roleName: '细节-纸张质感', url: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80', filename: 'SKU2027-A01_detail1.jpg' },
  { id: 'a3', sku: 'SKU2027-A01', roleKey: 'detail_2', roleName: '细节-装订挂绳', url: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=400&q=80', filename: 'SKU2027-A01_detail2.jpg' },
  { id: 'a4', sku: 'SKU2027-A01', roleKey: 'motion',   roleName: '运镜-展开挂墙', url: 'https://images.unsplash.com/photo-1506784365847-bbad939e9335?w=400&q=80', filename: 'SKU2027-A01_motion.jpg' },
  { id: 'a5', sku: 'SKU2027-A01', roleKey: 'scene',    roleName: '场景-墙面陈列', url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=400&q=80', filename: 'SKU2027-A01_scene.jpg' },
  // SKU-02
  { id: 'a6', sku: 'SKU2027-A02', roleKey: 'main',     roleName: '主图-正面',    url: 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=400&q=80', filename: 'SKU2027-A02_main.jpg' },
  { id: 'a7', sku: 'SKU2027-A02', roleKey: 'detail_1', roleName: '细节-纸张质感', url: 'https://images.unsplash.com/photo-1516962215378-7fa2e137ae93?w=400&q=80', filename: 'SKU2027-A02_detail1.jpg' },
  { id: 'a7_1', sku: 'SKU2027-A02', roleKey: 'detail_2', roleName: '细节-装订挂绳', url: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=400&q=80', filename: 'SKU2027-A02_detail2.jpg' },
  { id: 'a7_2', sku: 'SKU2027-A02', roleKey: 'motion',   roleName: '运镜-展开挂墙', url: 'https://images.unsplash.com/photo-1506784365847-bbad939e9335?w=400&q=80', filename: 'SKU2027-A02_motion.jpg' },
  { id: 'a7_3', sku: 'SKU2027-A02', roleKey: 'scene',    roleName: '场景-墙面陈列', url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=400&q=80', filename: 'SKU2027-A02_scene.jpg' },
  // SKU-03: intentionally incomplete (missing detail_2, motion, scene) — used for I2 adversarial test
  { id: 'a8', sku: 'SKU2027-A03', roleKey: 'main',     roleName: '主图-正面',    url: 'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400&q=80', filename: 'SKU2027-A03_main.jpg' },
  { id: 'a9', sku: 'SKU2027-A03', roleKey: 'detail_1', roleName: '细节-纸张质感', url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=400&q=80', filename: 'SKU2027-A03_detail1.jpg' },
  // SKUs 04-12 for testing 11+ limit (Boundary 2 / I3)
  { id: 'a10', sku: 'SKU2027-A04', roleKey: 'main', roleName: '主图-正面', url: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=400&q=80', filename: 'SKU2027-A04_main.jpg' },
  { id: 'a11', sku: 'SKU2027-A05', roleKey: 'main', roleName: '主图-正面', url: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80', filename: 'SKU2027-A05_main.jpg' },
  { id: 'a12', sku: 'SKU2027-A06', roleKey: 'main', roleName: '主图-正面', url: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=400&q=80', filename: 'SKU2027-A06_main.jpg' },
  { id: 'a13', sku: 'SKU2027-A07', roleKey: 'main', roleName: '主图-正面', url: 'https://images.unsplash.com/photo-1506784365847-bbad939e9335?w=400&q=80', filename: 'SKU2027-A07_main.jpg' },
  { id: 'a14', sku: 'SKU2027-A08', roleKey: 'main', roleName: '主图-正面', url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=400&q=80', filename: 'SKU2027-A08_main.jpg' },
  { id: 'a15', sku: 'SKU2027-A09', roleKey: 'main', roleName: '主图-正面', url: 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=400&q=80', filename: 'SKU2027-A09_main.jpg' },
  { id: 'a16', sku: 'SKU2027-A10', roleKey: 'main', roleName: '主图-正面', url: 'https://images.unsplash.com/photo-1516962215378-7fa2e137ae93?w=400&q=80', filename: 'SKU2027-A10_main.jpg' },
  { id: 'a17', sku: 'SKU2027-A11', roleKey: 'main', roleName: '主图-正面', url: 'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400&q=80', filename: 'SKU2027-A11_main.jpg' },
  { id: 'a18', sku: 'SKU2027-A12', roleKey: 'main', roleName: '主图-正面', url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=400&q=80', filename: 'SKU2027-A12_main.jpg' },
  // Unrecognized filename for I4 fallback
  { id: 'a19', sku: '待处理', roleKey: '', roleName: '未识别角色', url: 'https://images.unsplash.com/photo-1516962215378-7fa2e137ae93?w=400&q=80', filename: 'photo_holiday.jpg' }
];

/** Compute how many distinct SKU groups the selected assets form */
function computeFissionGroups(selectedIds: Set<string>): { count: number; skus: string[] } {
  const selected = mockUploadedAssets.filter(a => selectedIds.has(a.id) && a.sku !== '待处理');
  const skuSet = new Set(selected.map(a => a.sku));
  return { count: skuSet.size, skus: Array.from(skuSet) };
}

const BATCH_LIMIT = 10;

export const Sidebar: React.FC = () => {
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const nodes = useCanvasStore((state) => state.nodes);
  const bindAsset = useCanvasStore((state) => state.bindAsset);
  const uploadAndBindAsset = useCanvasStore((state) => state.uploadAndBindAsset);
  const resetAll = useCanvasStore((state) => state.resetAll);
  const selectedAssetIds = useCanvasStore((state) => state.selectedAssetIds);
  const toggleAssetSelection = useCanvasStore((state) => state.toggleAssetSelection);
  const clearAssetSelection = useCanvasStore((state) => state.clearAssetSelection);
  const batchCloneInstances = useCanvasStore((state) => state.batchCloneInstances);
  
  const pendingAssets = useCanvasStore((state) => state.pendingAssets);
  const removePendingAsset = useCanvasStore((state) => state.removePendingAsset);

  const [bindingAsset, setBindingAsset] = useState<MockAsset | null>(null);
  const [isDraggingFission, setIsDraggingFission] = useState(false);
  const [isPendingAreaOpen, setIsPendingAreaOpen] = useState(true);

  const { count: fissionCount } = computeFissionGroups(selectedAssetIds);
  const isOverLimit = fissionCount > BATCH_LIMIT;
  const hasSelection = selectedAssetIds.size > 0;
  const canFission = fissionCount > 0 && !isOverLimit;

  const performBinding = (nodeId: string, asset: MockAsset) => {
    bindAsset(nodeId, asset.url, 'uploaded', asset.roleKey);
  };

  const handleBind = (asset: MockAsset) => {
    if (!selectedNodeId) {
      setBindingAsset(asset);
      return;
    }
    const targetNode = nodes.find(n => n.id === selectedNodeId);
    if (!targetNode) return;
    performBinding(selectedNodeId, asset);
  };

  const handleSelectNodeToBind = (nodeId: string) => {
    if (!bindingAsset) return;
    performBinding(nodeId, bindingAsset);
    setBindingAsset(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedNodeId) {
      alert('请先在画布中点击选中一个分镜节点，然后再上传文件！');
      return;
    }
    await uploadAndBindAsset(selectedNodeId, file);
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!canFission) {
      e.preventDefault();
      return;
    }
    const selectedAssets = mockUploadedAssets.filter(a => selectedAssetIds.has(a.id));
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'fission_batch',
      assets: selectedAssets,
      fissionCount,
    }));
    setIsDraggingFission(true);
  };

  const handleDragEnd = () => {
    setIsDraggingFission(false);
  };

  const handleDirectBatchClone = async () => {
    if (!canFission) return;
    const selectedAssets = mockUploadedAssets.filter(a => selectedAssetIds.has(a.id));
    try {
      const { batch_id, instances, unrecognized_assets } = await batchCloneInstances(
        selectedAssets.map(a => ({ id: a.id, filename: a.filename, url: a.url }))
      );
      const missingCount = instances.filter(r => r.missing_roles.length > 0).length;
      
      let msg = `生成 ${instances.length} 条产品链`;
      if (unrecognized_assets.length > 0) {
        msg += `，另有 ${unrecognized_assets.length} 个素材文件名无法识别 SKU，已移入待处理区。`;
      } else {
        msg += `。`;
      }
      
      if (missingCount > 0) {
        msg += `\n注意：${missingCount} 条产品链存在缺失角色，部分对应节点将被跳过生成。`;
      }
      
      alert(msg);
      clearAssetSelection();
      
      // Trigger Sprint 4 Batch Generate
      if (batch_id) {
        useCanvasStore.getState().generateBatch(batch_id);
      }
    } catch (err: any) {
      alert(`批量克隆失败：${err.message}`);
    }
  };

  return (
    <aside className="sidebar-panel">
      <div className="panel-header flex justify-between items-center">
        <span className="panel-title">本地素材库</span>
        <button
          onClick={resetAll}
          className="text-gray-400 hover:text-white"
          title="重置画布与状态"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 border-b border-[#ffffff10]">
        <label className="flex items-center justify-center border border-dashed border-[#ffffff15] rounded-lg p-4 cursor-pointer hover:bg-white/[0.02] transition">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <div className="text-center">
            <Upload className="w-5 h-5 mx-auto mb-1 text-gray-500" />
            <span className="text-[10px] text-gray-400 block">点击上传真实素材</span>
            <span className="text-[9px] text-gray-600">支持 JPG/PNG (Sync 模式)</span>
          </div>
        </label>
      </div>

      {/* Sprint 3: Real-time Fission Status Banner */}
      {hasSelection && (
        <div
          data-fission-count={fissionCount}
          className={`mx-3 mt-3 mb-1 px-3 py-2 rounded-lg border text-xs flex items-center gap-2 transition-all fission-banner ${
            isOverLimit
              ? 'bg-red-500/15 border-red-500/40 text-red-400'
              : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
          }`}
        >
          {isOverLimit ? (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <Package className="w-3.5 h-3.5 shrink-0" />
          )}
          <div className="flex-1">
            <span className="font-semibold">
              已选 {selectedAssetIds.size} 个素材，预计裂变 {fissionCount} 条产品链
            </span>
            {isOverLimit && (
              <div className="text-[10px] text-red-400/80 mt-0.5">
                超出上限 (最多 {BATCH_LIMIT} 条)，请减少勾选
              </div>
            )}
            {fissionCount === 0 && selectedAssetIds.size > 0 && (
              <div className="text-[10px] text-yellow-400/80 mt-0.5">
                有效裂变数量为 0，请选择正确的素材
              </div>
            )}
          </div>
          <button
            onClick={handleDirectBatchClone}
            disabled={!canFission}
            className="batch-fission-btn shrink-0 bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 text-[10px] px-2 py-1 rounded border border-blue-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            一键裂变
          </button>
        </div>
      )}

      {hasSelection && (
        <div className="mx-3 mb-2">
          <div
            draggable={canFission}
            onDragStart={canFission ? handleDragStart : undefined}
            onDragEnd={canFission ? handleDragEnd : undefined}
            className={`fission-drag-handle w-full py-1.5 rounded-lg border text-[10px] text-center transition ${
              !canFission 
                ? 'bg-gray-500/10 border-gray-500/20 text-gray-500 cursor-not-allowed opacity-50'
                : isDraggingFission
                  ? 'bg-purple-500/30 border-purple-400/50 text-purple-200 cursor-grabbing'
                  : 'bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20 cursor-grab active:cursor-grabbing'
            }`}
          >
            📦 拖拽到画布执行裂变
          </div>
        </div>
      )}

      {hasSelection && (
        <div className="mx-3 mb-2 flex justify-end">
          <button
            onClick={clearAssetSelection}
            className="text-[10px] text-gray-500 hover:text-gray-300 transition"
          >
            清除选择
          </button>
        </div>
      )}

      <div className="assets-container">
        {mockUploadedAssets.map((asset) => {
          const isSelected = selectedAssetIds.has(asset.id);
          return (
            <div
              key={asset.id}
              className={`asset-card relative transition-all ${isSelected ? 'ring-1 ring-blue-500/50 bg-blue-500/5' : ''}`}
            >
              {/* Multi-select checkbox */}
              <button
                className="asset-select-checkbox absolute top-2 left-2 z-10 text-white/70 hover:text-white transition"
                onClick={() => toggleAssetSelection(asset.id)}
                title={isSelected ? '取消选择' : '加入批量裂变'}
              >
                {isSelected
                  ? <CheckSquare className="w-4 h-4 text-blue-400" />
                  : <Square className="w-4 h-4 text-gray-500" />
                }
              </button>
              <img src={asset.url} alt={asset.roleName} className="asset-card-image" />
              <div className="asset-card-info">
                <div>
                  <span className="asset-card-sku block">{asset.sku}</span>
                  <span className="text-[10px] text-gray-400">{asset.roleName}</span>
                </div>
                <button
                  onClick={() => handleBind(asset)}
                  className="action-btn text-xs bg-blue-600/20 text-blue-400 border-blue-500/20 hover:bg-blue-600/35"
                >
                  绑定
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pending Assets Area for I4 Boundary Case */}
      {pendingAssets.length > 0 && (
        <div className="mx-3 mb-4 mt-2 border border-red-500/20 rounded-lg overflow-hidden bg-[#1a1515] shrink-0">
          <div 
            className="flex items-center justify-between p-2 cursor-pointer bg-red-500/10 hover:bg-red-500/20 transition"
            onClick={() => setIsPendingAreaOpen(!isPendingAreaOpen)}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-xs font-medium text-red-400">待处理 ({pendingAssets.length})</span>
            </div>
            {isPendingAreaOpen ? <ChevronUp className="w-4 h-4 text-red-400" /> : <ChevronDown className="w-4 h-4 text-red-400" />}
          </div>
          {isPendingAreaOpen && (
            <div className="p-2 space-y-2 max-h-48 overflow-y-auto">
              {pendingAssets.map((asset, idx) => (
                <div key={idx} className="flex gap-2 p-2 bg-black/40 rounded border border-white/5">
                  <img src={asset.url} alt={asset.filename} className="w-10 h-10 object-cover rounded shrink-0" />
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="text-[10px] text-gray-300 truncate" title={asset.filename}>{asset.filename}</div>
                      <div className="text-[9px] text-red-400/80 mt-0.5">{asset.reason === 'filename_not_parseable' ? '文件名无法识别 SKU' : asset.reason}</div>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <input 
                        type="text" 
                        placeholder="SKU" 
                        className="w-16 bg-[#2a2a2a] text-[10px] text-white px-1 py-0.5 rounded border border-white/10 outline-none focus:border-blue-500"
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                      <select 
                        className="flex-1 bg-[#2a2a2a] text-[10px] text-white px-1 py-0.5 rounded border border-white/10 outline-none focus:border-blue-500"
                      >
                        <option value="">选择角色...</option>
                        <option value="main">主图</option>
                        <option value="detail_1">细节1</option>
                        <option value="detail_2">细节2</option>
                        <option value="motion">运镜</option>
                        <option value="scene">场景</option>
                      </select>
                      <button 
                        className="bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap"
                        onClick={() => {
                          removePendingAsset(asset.filename);
                          alert(`已为 ${asset.filename} 补充信息，移入素材库`);
                        }}
                      >
                        加入
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Node Selector Modal */}
      {bindingAsset && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
          <div className="bg-[#0f172a] border border-[#ffffff15] rounded-xl p-6 shadow-2xl w-[400px] max-w-full text-left">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1">
              <Image className="w-4 h-4 text-blue-400" /> 选择目标分镜节点
            </h3>
            <p className="text-xs text-gray-400 mb-4 font-normal">
              请选择要将素材 <strong className="text-blue-400">[{bindingAsset.roleName}]</strong> 绑定到画布上的哪一个分镜节点：
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto mb-4 pr-1">
              {nodes
                .filter(n => n.data.nodeType === 'shot' && !n.data.isFixed)
                .map(n => {
                  const isMatch = n.data.roleKey === bindingAsset.roleKey;
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleSelectNodeToBind(n.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-xs flex justify-between items-center transition ${
                        isMatch
                          ? 'bg-blue-600/10 border-blue-500/30 text-blue-300 hover:bg-blue-600/20'
                          : 'bg-[#1e293b]/50 border-white/5 text-gray-300 hover:bg-[#1e293b] hover:border-white/10'
                      }`}
                    >
                      <div>
                        <span className="font-semibold block">{n.data.label}</span>
                        <span className="text-[10px] text-gray-500">需要：{n.data.roleName}</span>
                      </div>
                      {isMatch ? (
                        <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                          角色匹配
                        </span>
                      ) : (
                        <span className="text-[9px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded">
                          不匹配
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBindingAsset(null)}
                className="px-3 py-1.5 bg-[#1e293b] hover:bg-[#334155] border border-white/5 text-xs text-gray-300 rounded-lg transition"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
