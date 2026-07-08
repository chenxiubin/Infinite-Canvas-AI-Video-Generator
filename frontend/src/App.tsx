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

  // MVP-4 Production Workbench (default at /)
  return <ProductionWorkbench />;
}

export default App;
