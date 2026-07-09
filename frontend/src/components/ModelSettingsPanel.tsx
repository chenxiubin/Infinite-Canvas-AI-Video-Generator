import React, { useState, useEffect, useCallback } from 'react';
import { X, Eye, EyeOff, Check, AlertCircle, Wifi, WifiOff, Zap } from 'lucide-react';
import type { UserModelSettings, ApimartModelInfo, ModelProvider } from '../types/modelSettings';
import { DEFAULT_USER_MODEL_SETTINGS } from '../types/modelSettings';
import { loadUserModelSettings, saveUserModelSettings, maskApiKey, validateApiKeyFormat } from '../lib/userModelSettingsStore';
import { testApimartConnection, fetchApimartModels, getBuiltinVideoModels, mergeBuiltinAndRemoteModels, findModelById } from '../lib/apimartClient';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChanged?: (settings: UserModelSettings) => void;
}

export const ModelSettingsPanel: React.FC<Props> = ({ isOpen, onClose, onSettingsChanged }) => {
  const [settings, setSettings] = useState<UserModelSettings>(DEFAULT_USER_MODEL_SETTINGS);
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<{ status: string; message: string }>({ status: '', message: '' });
  const [remoteModels, setRemoteModels] = useState<ApimartModelInfo[]>([]);
  const [modelSourceLabel, setModelSourceLabel] = useState('内置模型列表');
  const [testing, setTesting] = useState(false);

  // Load settings on open
  useEffect(() => {
    if (isOpen) {
      const loaded = loadUserModelSettings();
      setSettings(loaded);
      setKeyInput(loaded.apimartApiKey);
      setShowKey(false);
      setConnectionStatus({ status: '', message: '' });
    }
  }, [isOpen]);

  const builtinModels = getBuiltinVideoModels();
  const displayModels = mergeBuiltinAndRemoteModels(builtinModels, remoteModels);
  const currentModel = findModelById(displayModels, settings.selectedVideoModelId);

  const notifySettings = useCallback((s: UserModelSettings) => {
    setSettings(s);
    saveUserModelSettings(s);
    onSettingsChanged?.(s);
  }, [onSettingsChanged]);

  const handleProviderChange = (provider: ModelProvider) => {
    notifySettings({ ...settings, provider, updatedAt: Date.now() });
  };

  const handleSaveKey = () => {
    const validation = validateApiKeyFormat(keyInput);
    if (!validation.valid) {
      setConnectionStatus({ status: 'error', message: validation.reason || '无效' });
      return;
    }
    notifySettings({ ...settings, apimartApiKey: keyInput, updatedAt: Date.now() });
    setConnectionStatus({ status: 'ok', message: 'Key 已保存' });
  };

  const handleClearKey = () => {
    setKeyInput('');
    notifySettings({ ...settings, apimartApiKey: '', updatedAt: Date.now() });
    setConnectionStatus({ status: '', message: '' });
  };

  const handleTestConnection = async () => {
    if (!settings.apimartApiKey) {
      setConnectionStatus({ status: 'error', message: '请先填写 API Key' });
      return;
    }
    setTesting(true);
    try {
      const result = await testApimartConnection(settings.apimartApiKey, settings.apimartBaseUrl);
      setConnectionStatus({ status: result.status, message: result.message });
      if (result.success) {
        try {
          const models = await fetchApimartModels(settings.apimartApiKey, settings.apimartBaseUrl);
          setRemoteModels(models);
          setModelSourceLabel(`已连接 APIMart，已刷新模型列表 (${models.length} 个远程模型)`);
        } catch {
          setModelSourceLabel('连接成功但模型列表获取失败，使用内置模型列表');
        }
      }
    } catch {
      setConnectionStatus({ status: 'network_error', message: '连接失败' });
    } finally {
      setTesting(false);
    }
  };

  const handleSelectModel = (modelId: string) => {
    notifySettings({ ...settings, selectedVideoModelId: modelId, updatedAt: Date.now() });
  };

  const handleParamChange = (field: string, value: any) => {
    notifySettings({ ...settings, [field]: value, updatedAt: Date.now() } as UserModelSettings);
  };

  if (!isOpen) return null;

  const connectionBadge = () => {
    switch (connectionStatus.status) {
      case 'ok': return <span className="text-[9px] text-green-400 flex items-center gap-1"><Check className="w-3 h-3" />{connectionStatus.message}</span>;
      case 'invalid_key': return <span className="text-[9px] text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{connectionStatus.message}</span>;
      case 'network_error': return <span className="text-[9px] text-amber-400 flex items-center gap-1"><WifiOff className="w-3 h-3" />{connectionStatus.message}</span>;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-[#0d1117] border border-white/10 rounded-xl shadow-2xl w-[700px] max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#111827]">
          <h2 data-testid="model-settings-panel-title" className="text-sm font-semibold text-gray-200">模型服务设置</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="model-settings-panel">
          {/* Privacy notice */}
          <div className="text-[10px] text-gray-600 bg-[#0a0f1a] rounded-lg p-2.5 border border-white/5">
            API Key 只保存在本机浏览器，不会提交到项目代码。请不要在共享电脑保存 Key。
          </div>

          {/* Provider selection */}
          <div>
            <div className="text-[10px] text-gray-500 mb-2">服务商</div>
            <div className="flex gap-2">
              <button
                data-testid="model-provider-mock"
                onClick={() => handleProviderChange('mock')}
                className={`text-[11px] px-3 py-1.5 rounded-lg transition-colors ${
                  settings.provider === 'mock' ? 'bg-purple-800/40 text-purple-300' : 'bg-white/5 text-gray-400 hover:text-gray-200'
                }`}
              >Mock 演示</button>
              <button
                data-testid="model-provider-apimart"
                onClick={() => handleProviderChange('apimart')}
                className={`text-[11px] px-3 py-1.5 rounded-lg transition-colors ${
                  settings.provider === 'apimart' ? 'bg-purple-800/40 text-purple-300' : 'bg-white/5 text-gray-400 hover:text-gray-200'
                }`}
              >APIMart</button>
            </div>
          </div>

          {/* APIMart API Key */}
          {settings.provider === 'apimart' && (
            <div className="space-y-2">
              <div className="text-[10px] text-gray-500">APIMart API Key</div>
              <div className="flex gap-2">
                <input
                  data-testid="apimart-api-key-input"
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="flex-1 text-[11px] bg-[#111827] border border-white/10 rounded-lg px-3 py-1.5 text-gray-200 outline-none focus:border-purple-500/40"
                />
                <button
                  data-testid="apimart-api-key-toggle-visibility"
                  onClick={() => setShowKey(!showKey)}
                  className="text-gray-500 hover:text-gray-300 p-1.5 rounded hover:bg-white/5"
                  title={showKey ? '隐藏' : '显示'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {settings.apimartApiKey && (
                <div className="text-[9px] text-gray-500">
                  当前 Key: {maskApiKey(settings.apimartApiKey)}
                </div>
              )}
              <div className="flex gap-2">
                <button data-testid="apimart-save-key" onClick={handleSaveKey}
                  className="text-[10px] bg-purple-800/30 hover:bg-purple-700/40 text-purple-300 px-3 py-1 rounded transition-colors">保存 Key</button>
                <button data-testid="apimart-clear-key" onClick={handleClearKey}
                  className="text-[10px] bg-white/5 hover:bg-white/10 text-gray-400 px-3 py-1 rounded transition-colors">清空 Key</button>
                <button data-testid="apimart-test-connection" onClick={handleTestConnection} disabled={testing}
                  className="text-[10px] bg-white/5 hover:bg-white/10 text-gray-300 px-3 py-1 rounded transition-colors disabled:opacity-50">
                  {testing ? '测试中...' : '测试连接'}
                </button>
              </div>
              <div data-testid="apimart-connection-status">{connectionBadge()}</div>
            </div>
          )}

          {/* Model list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-gray-500">视频模型列表</span>
              <span data-testid="apimart-model-source-status" className="text-[9px] text-gray-600">{modelSourceLabel}</span>
            </div>
            <div data-testid="apimart-video-model-list" className="space-y-2 max-h-[300px] overflow-y-auto">
              {displayModels.map(model => (
                <div key={model.id} data-testid={`apimart-model-card-${model.id}`}
                  className={`rounded-lg border p-2.5 cursor-pointer transition-colors ${
                    settings.selectedVideoModelId === model.id
                      ? 'bg-purple-900/20 border-purple-500/40'
                      : 'bg-[#111827] border-white/10 hover:border-white/20'
                  }`}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium text-gray-200">{model.name}</div>
                      <div className="text-[9px] text-gray-500">{model.id}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className={`text-[8px] px-1 rounded ${
                          model.costLevel === '低' ? 'bg-green-900/30 text-green-400' :
                          model.costLevel === '中' ? 'bg-amber-900/30 text-amber-400' :
                          model.costLevel === '高' ? 'bg-red-900/30 text-red-400' :
                          'bg-gray-800 text-gray-500'
                        }`}>{model.costLevel}成本</span>
                        {model.inputModes.includes('text') && <span className="text-[8px] bg-blue-900/20 text-blue-400 px-1 rounded">文生视频</span>}
                        {model.inputModes.includes('image') && <span className="text-[8px] bg-green-900/20 text-green-400 px-1 rounded">图生视频</span>}
                        {model.supportsFirstFrame && <span className="text-[8px] bg-purple-900/20 text-purple-400 px-1 rounded">首帧</span>}
                        {model.supportsLastFrame && <span className="text-[8px] bg-purple-900/20 text-purple-400 px-1 rounded">尾帧</span>}
                      </div>
                      {model.description && <div className="text-[8px] text-gray-600 mt-1">{model.description}</div>}
                    </div>
                    <button
                      data-testid={`apimart-select-model-${model.id}`}
                      onClick={() => handleSelectModel(model.id)}
                      className={`flex-shrink-0 text-[9px] px-2 py-1 rounded transition-colors ${
                        settings.selectedVideoModelId === model.id
                          ? 'bg-purple-600/30 text-purple-200'
                          : 'bg-white/5 text-gray-400 hover:bg-purple-800/20 hover:text-purple-300'
                      }`}
                    >
                      {settings.selectedVideoModelId === model.id ? '已选择' : '选择'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Default parameters */}
          {currentModel && (
            <div className="space-y-2">
              <div className="text-[10px] text-gray-500">默认生成参数</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-gray-500">默认时长</label>
                  <select data-testid="apimart-default-duration" value={settings.defaultVideoDuration}
                    onChange={e => handleParamChange('defaultVideoDuration', Number(e.target.value))}
                    className="w-full text-[10px] bg-[#111827] border border-white/10 rounded px-2 py-1 text-gray-200 mt-1">
                    {(currentModel.durations || [5]).map(d => <option key={d} value={d}>{d}秒</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-gray-500">默认分辨率</label>
                  <select data-testid="apimart-default-resolution" value={settings.defaultVideoResolution}
                    onChange={e => handleParamChange('defaultVideoResolution', e.target.value)}
                    className="w-full text-[10px] bg-[#111827] border border-white/10 rounded px-2 py-1 text-gray-200 mt-1">
                    {(currentModel.resolutions || ['720p']).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-gray-500">默认比例</label>
                  <select data-testid="apimart-default-aspect-ratio" value={settings.defaultAspectRatio}
                    onChange={e => handleParamChange('defaultAspectRatio', e.target.value)}
                    className="w-full text-[10px] bg-[#111827] border border-white/10 rounded px-2 py-1 text-gray-200 mt-1">
                    {(currentModel.aspectRatios || ['16:9']).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-gray-500">生成音频</label>
                  <select data-testid="apimart-default-audio" value={settings.defaultVideoAudio ? 'on' : 'off'}
                    onChange={e => handleParamChange('defaultVideoAudio', e.target.value === 'on')}
                    className="w-full text-[10px] bg-[#111827] border border-white/10 rounded px-2 py-1 text-gray-200 mt-1">
                    <option value="off">关闭</option>
                    {currentModel.supportsAudio && <option value="on">开启</option>}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[9px] text-gray-500">最大并发任务</label>
                <select data-testid="apimart-max-concurrent-tasks" value={settings.maxConcurrentTasks}
                  onChange={e => handleParamChange('maxConcurrentTasks', Number(e.target.value))}
                  className="w-full text-[10px] bg-[#111827] border border-white/10 rounded px-2 py-1 text-gray-200 mt-1">
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelSettingsPanel;
