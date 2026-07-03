import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Sidebar } from './components/Sidebar';
import { Drawer } from './components/Drawer';
import { BatchDashboard } from './components/BatchDashboard';
import { useCanvasStore } from './store/canvasStore';
import { Film, Play, Sparkles, AlertCircle, Download, Check, RefreshCw, AlertTriangle, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ProductionWorkbench } from './components/ProductionWorkbench';

// Custom Node Registration
import { CustomNode } from './components/canvas/CustomNode';
const nodeTypes = {
  custom: CustomNode,
};

function App() {
  const {
    nodes,
    edges,
    totalDuration,
    productLine,
    isMerging,
    mergedVideoUrl,
    productSku,
    onNodesChange,
    setNodes,
    setSelectedNodeId,
    setProductLine,
    triggerMockMerge,
    initWorkspace,
    saveTemplate,
    loadTemplate,
  } = useCanvasStore();

  const [platformPreset, setPlatformPreset] = useState('douyin_9_16');
  const [showPreflight, setShowPreflight] = useState(false);
  const [preflightChecked, setPreflightChecked] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [customTemplates, setCustomTemplates] = useState<{template_id: string, name: string}[]>([]);
  const [showWorkbench, setShowWorkbench] = useState(false);

  const fetchTemplates = async () => {
    const isOffline = useCanvasStore.getState().isOfflineMode;
    if (!isOffline) {
      try {
        const productId = productLine === 'hanging' ? 'hanging_calendar' : 'desk_calendar';
        const resp = await fetch(`http://127.0.0.1:8000/api/v1/templates?product_id=${productId}`);
        if (resp.ok) {
          const list = await resp.json();
          setCustomTemplates(list.filter((t: any) => !t.template_id.startsWith('tpl_hanging') && !t.template_id.startsWith('tpl_desk')));
        }
      } catch (e) {
        console.error("Failed to load templates list", e);
      }
    }
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim() || `自定义模板-${new Date().toLocaleTimeString()}`;
    await saveTemplate(name);
    setTemplateName('');
    await fetchTemplates();
  };

  const handleLoadTemplate = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tplId = e.target.value;
    if (tplId) {
      await loadTemplate(tplId);
    }
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

  const getPreflightWarnings = () => {
    const warnings: string[] = [];

    // 1. Duration check
    if (totalDuration < 25 || totalDuration > 30) {
      warnings.push(`总时长为 ${totalDuration} 秒，不满足 25-30 秒的标准时长要求。`);
    }

    // 2. Shot nodes generation status check & role mismatch check
    nodes.forEach(node => {
      if (node.data.nodeType === 'shot') {
        if (node.data.status !== 'success') {
          const statusText = node.data.status === 'pending' ? '待绑定/生成' : 
                             node.data.status === 'generating' ? '生成中' : '生成失败';
          warnings.push(`分镜节点 ${node.id} (${node.data.label}) 目前处于【${statusText}】状态，尚未成功生成。`);
        }

        const isMismatched = 
          node.data.boundAssetUrl && 
          node.data.roleKey && 
          node.data.boundAssetRoleKey && 
          node.data.roleKey !== node.data.boundAssetRoleKey;

        if (isMismatched) {
          warnings.push(`分镜节点 ${node.id} (${node.data.label}) 角色不匹配：绑定角色为【${getRoleName(node.data.boundAssetRoleKey)}】，但该节点需要【${node.data.roleName}】。`);
        }
      }
    });

    return warnings;
  };

  const preflightWarnings = getPreflightWarnings();

  const handleMergeClick = () => {
    if (preflightWarnings.length > 0) {
      setShowPreflight(true);
    } else {
      triggerMockMerge();
    }
  };

  const getDownloadFilename = () => {
    const lineStr = productLine === 'hanging' ? 'hanging_calendar' : 'desk_calendar';
    const skuStr = (productSku || 'SKU2027A01').replace(/-/g, '');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `${lineStr}_${skuStr}_${platformPreset}_${dateStr}.mp4`;
  };

  // Initialize workspace from backend or offline fallback
  useEffect(() => {
    initWorkspace().then(() => {
      fetchTemplates();
    });
  }, []);

  // Fetch templates when productLine changes (Sprint 2 rule 4 requirement)
  useEffect(() => {
    fetchTemplates();
  }, [productLine]);

  // Re-calculate duration if nodes change
  const calculateTotalDuration = useCanvasStore((state) => state.calculateTotalDuration);
  useEffect(() => {
    calculateTotalDuration();
  }, [nodes, calculateTotalDuration]);

  // Check if all nodes are success to enable merge button
  const allShotsSuccessful = nodes
    .filter((n) => n.data.nodeType === 'shot')
    .every((n) => n.data.status === 'success');

  const durationValid = totalDuration >= 25 && totalDuration <= 30;

  const handleProductLineChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setProductLine(e.target.value as 'hanging' | 'desk');
  };

  if (showWorkbench) {
    return (
      <div className="app-container">
        <header className="top-toolbar" style={{ padding: '8px 16px' }}>
          <h1 className="toolbar-title">
            <Wrench className="w-5 h-5 text-emerald-400" />
            <span>MVP-3 视频生产工作台</span>
          </h1>
          <button onClick={() => setShowWorkbench(false)} className="secondary-btn text-xs px-3 py-1 rounded">
            返回画布
          </button>
        </header>
        <ProductionWorkbench />
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Top Toolbar */}
      <header className="top-toolbar">
        <h1 className="toolbar-title">
          <Sparkles className="w-5 h-5 text-pink-400" />
          <span>无限画布 AI 视频生成平台</span>
          <span className="text-[10px] bg-white/10 text-gray-300 font-normal px-2 py-0.5 rounded-full">
            MVP-1
          </span>
        </h1>

        <div className="toolbar-controls">
          {/* Product Line Selection */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">产品线:</span>
            <select
              value={productLine}
              onChange={handleProductLineChange}
              className="product-selector"
            >
              <option value="hanging">新年挂历 (场景较强)</option>
              <option value="desk">新年台历 (桌面平移)</option>
            </select>
          </div>

          {/* Platform Preset Selection */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">平台规格:</span>
            <select
              value={platformPreset}
              onChange={(e) => setPlatformPreset(e.target.value)}
              className="platform-selector border border-white/10 bg-[#1e293b] rounded px-2 py-1 text-xs text-gray-200"
            >
              <option value="douyin_9_16">抖音/小红书/视频号 (9:16)</option>
              <option value="detail_16_9">淘宝详情页横版 (16:9)</option>
              <option value="detail_1_1">淘宝详情页方形 (1:1)</option>
              <option value="video_channel">视频号独立配置 (9:16)</option>
            </select>
          </div>

          {/* Template Save & Reuse (Sprint 2) */}
          <div className="flex items-center gap-2 border-l border-white/10 pl-3">
            <input
              type="text"
              placeholder="自定义模板名称"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="border border-white/10 bg-[#1e293b] rounded px-2 py-1 text-xs text-gray-200 w-28"
            />
            <button
              onClick={handleSaveTemplate}
              className="secondary-btn save-template-btn py-1 px-2.5 text-xs font-semibold"
            >
              保存模板
            </button>
            <select
              onChange={handleLoadTemplate}
              defaultValue=""
              className="template-selector border border-white/10 bg-[#1e293b] rounded px-2 py-1 text-xs text-gray-200"
            >
              <option value="">-- 复用自定义模板 --</option>
              {customTemplates.map(t => (
                <option key={t.template_id} value={t.template_id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Duration Indicator */}
          <div className="duration-indicator">
            <span>总时长:</span>
            <span className={`duration-val ${!durationValid ? 'invalid' : ''}`}>
              {totalDuration} 秒
            </span>
            {!durationValid && (
              <span className="flex items-center text-red-500 text-[10px] gap-1" title="时长须在 25~30s 之间">
                <AlertCircle className="w-3.5 h-3.5" />
                (限25-30秒)
              </span>
            )}
          </div>

          {/* MVP-3 Workbench */}
          <button
            onClick={() => setShowWorkbench(true)}
            className="secondary-btn text-xs px-3 py-1 rounded"
            title="MVP-3 生产工作台"
          >
            <Wrench className="w-4 h-4" />
            生产工作台
          </button>

          {/* Merge & Compose Button */}
          <button
            disabled={isMerging}
            onClick={handleMergeClick}
            className="primary-btn"
          >
            {isMerging ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                合成中...
              </>
            ) : (
              <>
                <Film className="w-4 h-4" />
                视频合成
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main workspace layout */}
      <main className="main-layout">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Center Canvas */}
        <div className="canvas-container">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            nodeTypes={nodeTypes}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            minZoom={0.2}
            maxZoom={2.0}
          >
            <Background color="#1f2937" gap={16} size={1} />
            <Controls position="bottom-right" />
            <BatchDashboard />
          </ReactFlow>

          {/* Overlay Merge Result Player if successful */}
          {mergedVideoUrl && (
            <div className="absolute bottom-6 left-6 p-4 bg-gray-900/95 border border-[#ffffff15] rounded-xl shadow-2xl backdrop-filter backdrop-blur-xl z-20 w-80">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-green-400 flex items-center gap-1">
                  <Check className="w-4 h-4" /> 合成成功！视频就绪
                </span>
                <span className="text-[10px] text-gray-500">25-30s 标准版</span>
              </div>
              <video
                src={mergedVideoUrl}
                controls
                className="w-full rounded-lg border border-white/5 mb-3"
              />
              <div className="flex gap-2">
                <a
                  href={mergedVideoUrl}
                  download={getDownloadFilename()}
                  className="primary-btn flex-1 justify-center py-2"
                >
                  <Download className="w-4 h-4" />
                  下载成片
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Right Drawer */}
        <Drawer />
        {/* Pre-flight Confirmation Panel */}
        {showPreflight && (
          <div className="preflight-panel">
            <div className="preflight-header">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <span>合成预检警告清单 ({preflightWarnings.length} 项)</span>
            </div>
            <div className="preflight-warnings-list">
              {preflightWarnings.map((w, idx) => (
                <div key={idx} className="preflight-warning-item warning-item">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
            <div className="preflight-footer">
              <label className="preflight-confirm-label">
                <input
                  type="checkbox"
                  checked={preflightChecked}
                  onChange={(e) => setPreflightChecked(e.target.checked)}
                />
                <span>已知晓上述警告，确定继续提交合成</span>
              </label>
              <div className="preflight-actions">
                <button
                  onClick={() => {
                    setShowPreflight(false);
                    setPreflightChecked(false);
                  }}
                  className="secondary-btn"
                >
                  取消
                </button>
                <button
                  disabled={!preflightChecked}
                  onClick={() => {
                    triggerMockMerge();
                    setShowPreflight(false);
                    setPreflightChecked(false);
                  }}
                  className="primary-btn"
                >
                  确认合成
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
