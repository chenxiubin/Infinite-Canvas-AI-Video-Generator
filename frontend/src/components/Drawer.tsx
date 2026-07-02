import React from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { X, Image, Sparkles } from 'lucide-react';

export const Drawer: React.FC = () => {
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useCanvasStore((state) => state.setSelectedNodeId);
  const nodes = useCanvasStore((state) => state.nodes);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div className="drawer-panel">
        <div className="drawer-placeholder">
          <Image className="w-10 h-10 text-gray-700 mb-3 mx-auto" />
          <p className="font-semibold text-gray-400">未选择节点</p>
          <p className="text-xs text-gray-500 mt-1">请在画布中点击选中一个节点以编辑其属性。</p>
        </div>
      </div>
    );
  }

  const { data } = selectedNode;

  const handleFieldChange = (field: string, val: any) => {
    updateNodeData(selectedNode.id, { [field]: val });
  };

  return (
    <div className="drawer-panel">
      <div className="panel-header flex justify-between items-center">
        <span className="panel-title">节点属性编辑</span>
        <button onClick={() => setSelectedNodeId(null)} className="text-gray-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="drawer-content">
        <div className="mb-4">
          <span className="text-xs text-gray-400">节点 ID: </span>
          <span className="text-xs font-mono font-bold text-purple-400">{selectedNode.id}</span>
        </div>

        {data.nodeType === 'shot' && (
          <>
            {/* Bound Asset Section */}
            <div className="drawer-section">
              <span className="drawer-section-title">绑定的产品素材</span>
              <div className="asset-thumbnail-container mt-2">
                {data.boundAssetUrl ? (
                  <div className="relative h-full w-full">
                    <img src={data.boundAssetUrl} alt="bound asset preview" className="w-full h-full object-cover" />
                    <span className={`source-badge ${data.boundAssetSource}`}>
                      {data.boundAssetSource === 'uploaded' ? '素材' : 'AI'}
                    </span>
                  </div>
                ) : (
                  <div className="asset-placeholder">
                    <Image className="w-8 h-8 text-gray-600 mb-1" />
                    <span className="text-xs text-gray-500">待绑定素材</span>
                  </div>
                )}
              </div>
              {data.boundAssetUrl && (
                <button
                  onClick={() => handleFieldChange('boundAssetUrl', undefined)}
                  className="action-btn text-xs mt-2 w-full text-center"
                >
                  解除绑定
                </button>
              )}
            </div>

            {/* Config Fields */}
            <div className="drawer-section">
              <span className="drawer-section-title">镜头参数</span>
              
              {/* Duration Slider */}
              <div className="field-group">
                <label className="field-label">持续时间 (3-5 秒)</label>
                <div className="slider-container">
                  <input
                    type="range"
                    min="3"
                    max="5"
                    step="1"
                    value={data.duration}
                    onChange={(e) => handleFieldChange('duration', parseInt(e.target.value))}
                    className="field-slider"
                  />
                  <span className="slider-val">{data.duration}s</span>
                </div>
              </div>

              {/* Shot Size */}
              <div className="field-group">
                <label className="field-label">景别 (Shot Size)</label>
                <select
                  value={data.shotSize || ''}
                  onChange={(e) => handleFieldChange('shotSize', e.target.value)}
                  className="field-select"
                >
                  <option value="特写">特写 (Close-up)</option>
                  <option value="中景">中景 (Medium-shot)</option>
                  <option value="全景">全景 (Long-shot)</option>
                  <option value="中远景">中远景 (Medium-long-shot)</option>
                </select>
              </div>

              {/* Camera Move */}
              <div className="field-group">
                <label className="field-label">运镜方式 (Camera Move)</label>
                <select
                  value={data.cameraMove || ''}
                  onChange={(e) => handleFieldChange('cameraMove', e.target.value)}
                  className="field-select"
                >
                  <option value="推">推 (Zoom In)</option>
                  <option value="拉">拉 (Zoom Out)</option>
                  <option value="摇">摇 (Pan/Tilt)</option>
                  <option value="移">移 (Track/Dolly)</option>
                  <option value="平移">平移 (Slide)</option>
                  <option value="环绕">环绕 (Orbit)</option>
                  <option value="静止">静止 (Static)</option>
                </select>
              </div>

              {/* Lighting Mood */}
              <div className="field-group">
                <label className="field-label">光线氛围 (Lighting Mood)</label>
                <select
                  value={data.lightingMood || ''}
                  onChange={(e) => handleFieldChange('lightingMood', e.target.value)}
                  className="field-select"
                >
                  <option value="暖光节日氛围">暖光节日氛围</option>
                  <option value="侧光质感">侧光质感</option>
                  <option value="自然光">自然光</option>
                  <option value="演播室">演播室 (Studio)</option>
                </select>
              </div>

              {/* Motion Intensity */}
              <div className="field-group">
                <label className="field-label">运动幅度 (Motion Intensity)</label>
                <select
                  value={data.motionIntensity || ''}
                  onChange={(e) => handleFieldChange('motionIntensity', e.target.value)}
                  className="field-select"
                >
                  <option value="轻微">轻微 (Low)</option>
                  <option value="中等">中等 (Medium)</option>
                  <option value="较大">较大 (High)</option>
                </select>
              </div>

              {/* Text Lock Option */}
              <div className="field-group mt-4">
                <label className="checkbox-container">
                  <input
                    type="checkbox"
                    checked={data.textLockEnabled || false}
                    onChange={(e) => handleFieldChange('textLockEnabled', e.target.checked)}
                  />
                  <span>启用版面/文字保护叠加</span>
                </label>
              </div>
            </div>
          </>
        )}

        {data.nodeType === 'generation' && (
          <div className="drawer-section">
            <span className="drawer-section-title">AI 生成控制</span>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              AI生成节点作为备份兜底手段。触发后，后台生成 4 张候选图。选择任意一张即可将其锁定并自动同步绑定到对应的 S01 主图分镜。
            </p>
            <div className="mt-4 p-3 rounded bg-purple-950/20 border border-purple-500/10 flex items-center">
              <Sparkles className="w-4 h-4 text-pink-400 mr-2 flex-shrink-0" />
              <span className="text-[10px] text-pink-200">提示词和光影将继承自所连分镜的参数。</span>
            </div>
          </div>
        )}

        {data.nodeType === 'merge' && (
          <div className="drawer-section">
            <span className="drawer-section-title">合成与导出</span>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              这是产品链的最终节点。当所有分镜节点生成成功后，点击顶部“视频合成”进行全链缝合及渲染导出。
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
