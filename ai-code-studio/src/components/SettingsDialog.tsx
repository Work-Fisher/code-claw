import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import { Check, LoaderCircle, Save, Settings2, Terminal, X } from 'lucide-react';
import {
  checklistTone,
  connectionTone,
  formatTimestamp,
  labelForConnectionStatus,
} from '../app/helpers';
import { providerPresets, type ProviderPreset } from '../app/providerPresets';
import type { ConfigState, ConnectionReport, SetupChecklistItem } from '../app/types';
import { SoulEditor } from './SoulEditor';

type SettingsTab = 'Provider' | 'Workspace' | 'Runtime' | 'Verify' | 'Soul';

type SettingsDialogProps = {
  open: boolean;
  config: ConfigState;
  setConfig: Dispatch<SetStateAction<ConfigState>>;
  isTestingConnection: boolean;
  connectionReport: ConnectionReport | null;
  setupChecklist: SetupChecklistItem[];
  onSaveConfig: () => void;
  onTestConnection: () => void;
  onShutdownGateway: () => void;
  onRestartLauncher: () => void;
  onClose: () => void;
};

function tabLabel(tab: SettingsTab) {
  switch (tab) {
    case 'Provider':
      return '模型来源';
    case 'Workspace':
      return '工作区';
    case 'Runtime':
      return '运行时';
    case 'Verify':
      return '验证';
    case 'Soul':
      return '灵魂';
  }
}

function tabHint(tab: SettingsTab) {
  switch (tab) {
    case 'Provider':
      return '配置上游接口与模型。';
    case 'Workspace':
      return '配置工作区和 claw-code 路径。';
    case 'Runtime':
      return '设置运行方式、权限与高级项。';
    case 'Verify':
      return '保存并执行连接测试。';
    case 'Soul':
      return '定义 AI 人格、价值观和行为边界。';
  }
}

export function SettingsDialog({
  open,
  config,
  setConfig,
  isTestingConnection,
  connectionReport,
  setupChecklist,
  onSaveConfig,
  onTestConnection,
  onShutdownGateway,
  onRestartLauncher,
  onClose,
}: SettingsDialogProps) {
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('Provider');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    if (open) {
      setSettingsTab('Provider');
    }
  }, [open]);

  const currentPreset =
    providerPresets.find(
      preset =>
        preset.id !== 'custom' &&
        preset.upstreamBaseUrl === config.upstreamBaseUrl &&
        preset.upstreamModel === config.upstreamModel,
    ) || null;

  if (!open) {
    return null;
  }

  function applyPreset(preset: ProviderPreset) {
    setConfig(current => ({
      ...current,
      upstreamBaseUrl: preset.upstreamBaseUrl,
      upstreamModel: preset.upstreamModel,
      clawModel: preset.clawModel,
      textMode: preset.textMode,
    }));
  }

  async function pickDirectory(target: 'workspaceDir' | 'clawProjectDir') {
    const nextPath = await window.clawDesktop?.pickDirectory?.();
    if (nextPath) {
      setConfig(current => ({
        ...current,
        [target]: nextPath,
      }));
    }
  }

  async function pickBinaryPath() {
    const nextPath = await window.clawDesktop?.pickFile?.([
      { name: 'Executable', extensions: ['exe', 'bin', 'cmd'] },
      { name: 'All Files', extensions: ['*'] },
    ]);
    if (nextPath) {
      setConfig(current => ({
        ...current,
        clawBinaryPath: nextPath,
      }));
    }
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[rgba(27,22,17,0.30)] p-6 backdrop-blur-[2px]">
      <div className="pointer-events-auto flex max-h-[92vh] w-full max-w-[1120px] overflow-hidden rounded-[30px] border border-[#E1D6C8] bg-[#FCF9F4] shadow-[0_30px_90px_rgba(51,37,18,0.18)]">
        <div className="flex w-[280px] shrink-0 flex-col border-r border-[#E8DED2] bg-[linear-gradient(180deg,#F7F1E7_0%,#F8F5EE_100%)] p-6">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#E5D9C9] bg-white/70 px-3 py-1 text-[12px] text-[#7F7467]">
            <Settings2 size={14} />
            独立设置
          </div>
          <div className="mt-5 text-[24px] font-semibold leading-tight text-[#241F17]">
            把配置和日常工作区彻底分开。
          </div>
          <div className="mt-3 text-[14px] leading-7 text-[#7C7266]">
            这里集中放置 provider、路径、运行方式和验证。主工作台只保留聊天、会话和诊断。
          </div>

          <div className="mt-6 space-y-2">
            {(['Provider', 'Workspace', 'Runtime', 'Verify', 'Soul'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setSettingsTab(tab)}
                className={[
                  'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
                  settingsTab === tab
                    ? 'border-[#D8CAB8] bg-[#F4EEE4] text-[#241F17]'
                    : 'border-[#E8DED2] bg-[#FCFAF6] text-[#7B6F61] hover:bg-white',
                ].join(' ')}
              >
                <div className="text-[12px] font-medium">{tabLabel(tab)}</div>
                <div className="mt-1 text-[11px] leading-5">{tabHint(tab)}</div>
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-[24px] border border-[#E8DED2] bg-white/75 p-4">
            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8C8173]">
              当前进度
            </div>
            <div className="mt-3 space-y-2">
              {setupChecklist.map(item => (
                <div key={item.label} className="rounded-2xl border border-[#EFE6DA] bg-[#FCFAF6] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-[#2B241C]">{item.label}</span>
                    <span
                      className={[
                        'rounded-full border px-2 py-0.5 text-[11px]',
                        checklistTone(item.ready, !item.ready && item.label === '配置已保存'),
                      ].join(' ')}
                    >
                      {item.ready ? '就绪' : item.label === '配置已保存' ? '待保存' : '缺失'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-[#E8DED2] px-6 py-5">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8C8173]">
                {tabLabel(settingsTab)}
              </div>
              <div className="mt-1 text-[18px] font-semibold text-[#241F17]">{tabHint(settingsTab)}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-[#E5D8C9] bg-white px-3 py-2 text-[13px] text-[#6A5F53] hover:bg-[#FAF7F2]"
            >
              <span className="inline-flex items-center gap-2">
                <X size={14} />
                关闭
              </span>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {settingsTab === 'Provider' ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-[#E8DED2] bg-[#FAF6EF] p-4 text-[13px] leading-7 text-[#7B6F61]">
                  选择 AI 服务商，填入 API Key 即可开始。支持 OpenAI 兼容、Anthropic 原生和 Gemini 原生三种协议。
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  {providerPresets.map(preset => {
                    const active = currentPreset?.id === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className={[
                          'rounded-[22px] border px-4 py-4 text-left transition-colors',
                          active
                            ? 'border-[#D8CAB8] bg-[#F4EEE4] text-[#241F17]'
                            : 'border-[#E8DED2] bg-white text-[#5C5247] hover:bg-[#FCFAF6]',
                        ].join(' ')}
                      >
                        <div className="text-[14px] font-semibold">{preset.label}</div>
                        <div className="mt-1 text-[12px] text-[#8A7F70]">{preset.hint}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-[12px] text-[#8E8376]">接口地址</span>
                    <input
                      value={config.upstreamBaseUrl}
                      onChange={event => setConfig(current => ({ ...current, upstreamBaseUrl: event.target.value }))}
                      className="w-full rounded-2xl border border-[#E6DCCD] bg-white px-3 py-3 text-[14px] outline-none focus:border-[#C9B9A3]"
                      placeholder="https://api.example.com/v1"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[12px] text-[#8E8376]">API Key</span>
                    <input
                      value={config.upstreamApiKey}
                      onChange={event => setConfig(current => ({ ...current, upstreamApiKey: event.target.value }))}
                      className="w-full rounded-2xl border border-[#E6DCCD] bg-white px-3 py-3 text-[14px] outline-none focus:border-[#C9B9A3]"
                      placeholder="填入服务商提供的密钥"
                      type="password"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[12px] text-[#8E8376]">模型名称</span>
                    <input
                      value={config.upstreamModel}
                      onChange={event => setConfig(current => ({ ...current, upstreamModel: event.target.value, clawModel: event.target.value }))}
                      className="w-full rounded-2xl border border-[#E6DCCD] bg-white px-3 py-3 text-[14px] outline-none focus:border-[#C9B9A3]"
                      placeholder="deepseek-chat"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[12px] text-[#8E8376]">Claw 模型</span>
                    <input
                      value={config.clawModel}
                      onChange={event => setConfig(current => ({ ...current, clawModel: event.target.value }))}
                      className="w-full rounded-2xl border border-[#E6DCCD] bg-white px-3 py-3 text-[14px] outline-none focus:border-[#C9B9A3]"
                      placeholder="与模型名称相同即可"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {settingsTab === 'Workspace' ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-[#E8DED2] bg-[#FAF6EF] p-4 text-[13px] leading-7 text-[#7B6F61]">
                  工作区就是 runtime 实际修改文件的目录。claw-code 目录则是本地运行时代码树。
                </div>

                <label className="block space-y-1.5">
                  <span className="text-[12px] text-[#8E8376]">工作区目录</span>
                  <div className="flex gap-2">
                    <input
                      value={config.workspaceDir}
                      onChange={event => setConfig(current => ({ ...current, workspaceDir: event.target.value }))}
                      className="min-w-0 flex-1 rounded-2xl border border-[#E6DCCD] bg-white px-3 py-3 text-[14px] outline-none focus:border-[#C9B9A3]"
                      placeholder="C:\\path\\to\\workspace"
                    />
                    {window.clawDesktop?.pickDirectory ? (
                      <button
                        type="button"
                        onClick={() => void pickDirectory('workspaceDir')}
                        className="rounded-2xl border border-[#E5D6CA] bg-white px-3 py-3 text-[13px] text-[#6A5F53] hover:bg-[#F8F3EC]"
                      >
                        选择
                      </button>
                    ) : null}
                  </div>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[12px] text-[#8E8376]">claw-code 项目目录</span>
                  <div className="flex gap-2">
                    <input
                      value={config.clawProjectDir}
                      onChange={event => setConfig(current => ({ ...current, clawProjectDir: event.target.value }))}
                      className="min-w-0 flex-1 rounded-2xl border border-[#E6DCCD] bg-white px-3 py-3 text-[14px] outline-none focus:border-[#C9B9A3]"
                      placeholder="C:\\path\\to\\claw-code"
                    />
                    {window.clawDesktop?.pickDirectory ? (
                      <button
                        type="button"
                        onClick={() => void pickDirectory('clawProjectDir')}
                        className="rounded-2xl border border-[#E5D6CA] bg-white px-3 py-3 text-[13px] text-[#6A5F53] hover:bg-[#F8F3EC]"
                      >
                        选择
                      </button>
                    ) : null}
                  </div>
                </label>
              </div>
            ) : null}

            {settingsTab === 'Runtime' ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-[12px] text-[#8E8376]">权限模式</span>
                    <select
                      value={config.permissionMode}
                      onChange={event =>
                        setConfig(current => ({
                          ...current,
                          permissionMode: event.target.value as ConfigState['permissionMode'],
                        }))
                      }
                      className="w-full rounded-2xl border border-[#E6DCCD] bg-white px-3 py-3 text-[14px] outline-none focus:border-[#C9B9A3]"
                    >
                      <option value="workspace-write">工作区可写</option>
                      <option value="read-only">只读</option>
                      <option value="danger-full-access">完全访问</option>
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[12px] text-[#8E8376]">运行方式</span>
                    <select
                      value={config.runner}
                      onChange={event =>
                        setConfig(current => ({
                          ...current,
                          runner: event.target.value as ConfigState['runner'],
                        }))
                      }
                      className="w-full rounded-2xl border border-[#E6DCCD] bg-white px-3 py-3 text-[14px] outline-none focus:border-[#C9B9A3]"
                    >
                      <option value="auto">自动</option>
                      <option value="cargo">Cargo</option>
                      <option value="binary">二进制</option>
                    </select>
                  </label>
                </div>

                <label className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    checked={config.enableSoulInjection !== false}
                    onChange={event =>
                      setConfig(current => ({
                        ...current,
                        enableSoulInjection: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-[#E6DCCD] accent-[#D4620A]"
                  />
                  <span className="text-[13px] text-[#6A5F53]">启用 SOUL 人格 &amp; 记忆注入</span>
                  <span className="text-[11px] text-[#A89B8C]">（关闭可提升多轮对话稳定性）</span>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[12px] text-[#8E8376]">二进制路径</span>
                  <div className="flex gap-2">
                    <input
                      value={config.clawBinaryPath}
                      onChange={event => setConfig(current => ({ ...current, clawBinaryPath: event.target.value }))}
                      className="min-w-0 flex-1 rounded-2xl border border-[#E6DCCD] bg-white px-3 py-3 text-[14px] outline-none focus:border-[#C9B9A3]"
                      placeholder="可选：已编译的二进制路径"
                    />
                    {window.clawDesktop?.pickFile ? (
                      <button
                        type="button"
                        onClick={() => void pickBinaryPath()}
                        className="rounded-2xl border border-[#E5D6CA] bg-white px-3 py-3 text-[13px] text-[#6A5F53] hover:bg-[#F8F3EC]"
                      >
                        选择
                      </button>
                    ) : null}
                  </div>
                </label>

                <details className="rounded-2xl border border-[#E8DED2] bg-[#FCFAF6] px-4 py-4">
                  <summary className="cursor-pointer list-none text-[14px] font-medium text-[#2B241C]">
                    高级设置
                  </summary>
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-[12px] text-[#8E8376]">网关地址</span>
                        <input
                          value={config.gatewayHost}
                          onChange={event => setConfig(current => ({ ...current, gatewayHost: event.target.value }))}
                          className="w-full rounded-2xl border border-[#E6DCCD] bg-white px-3 py-3 text-[14px] outline-none focus:border-[#C9B9A3]"
                        />
                      </label>

                      <label className="block space-y-1.5">
                        <span className="text-[12px] text-[#8E8376]">网关端口</span>
                        <input
                          value={String(config.gatewayPort)}
                          onChange={event => {
                            const next = Number.parseInt(event.target.value, 10);
                            setConfig(current => ({
                              ...current,
                              gatewayPort: Number.isNaN(next) ? 8787 : next,
                            }));
                          }}
                          className="w-full rounded-2xl border border-[#E6DCCD] bg-white px-3 py-3 text-[14px] outline-none focus:border-[#C9B9A3]"
                        />
                      </label>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={onShutdownGateway}
                        className="inline-flex items-center justify-center rounded-2xl border border-[#E5D6CA] bg-white px-3 py-3 text-[13px] text-[#6A5F53] hover:bg-[#F8F3EC]"
                      >
                        <X size={14} />
                      </button>
                      {window.clawDesktop?.restartLauncher ? (
                        <button
                          type="button"
                          onClick={onRestartLauncher}
                          className="inline-flex flex-1 items-center justify-center rounded-2xl border border-[#E5D6CA] bg-white px-3 py-3 text-[13px] text-[#6A5F53] hover:bg-[#F8F3EC]"
                        >
                          重启本地主机
                        </button>
                      ) : null}
                    </div>
                  </div>
                </details>
              </div>
            ) : null}

            {settingsTab === 'Soul' ? (
              <div className="flex h-[400px] flex-col">
                <SoulEditor workspaceDir={config.workspaceDir} />
              </div>
            ) : null}

            {settingsTab === 'Verify' ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-[#E8DED2] bg-[#FAF6EF] p-4 text-[13px] leading-7 text-[#7B6F61]">
                  先保存，再执行连接测试。这样可以提前发现错误的模型名、缺失的二进制路径或上游配置问题。
                </div>

                <div className="space-y-2">
                  {setupChecklist.map(item => (
                    <div key={item.label} className="rounded-2xl border border-[#EFE6DA] bg-[#FCFAF6] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[13px] font-medium text-[#2B241C]">{item.label}</span>
                        <span
                          className={[
                            'rounded-full border px-2 py-0.5 text-[11px]',
                            checklistTone(item.ready, !item.ready && item.label === '配置已保存'),
                          ].join(' ')}
                        >
                          {item.ready ? '就绪' : item.label === '配置已保存' ? '待保存' : '缺失'}
                        </span>
                      </div>
                      <div className="mt-1 text-[12px] leading-5 text-[#867B6D]">{item.detail}</div>
                    </div>
                  ))}
                </div>

                {connectionReport ? (
                  <div className="rounded-2xl border border-[#E8DED2] bg-[#FAF6EF] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13px] font-medium text-[#2B241C]">最近一次连接测试</div>
                      <span
                        className={[
                          'rounded-full border px-2 py-0.5 text-[11px]',
                          connectionReport.ok ? checklistTone(true) : checklistTone(false),
                        ].join(' ')}
                      >
                        {connectionReport.ok ? '通过' : '需要处理'}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-[#867B6D]">
                      {connectionReport.testedAt ? formatTimestamp(connectionReport.testedAt) : '刚刚'}
                    </div>
                    <div className="mt-3 space-y-2">
                      {connectionReport.checks.map(check => (
                        <div key={check.id} className="rounded-2xl border border-[#EFE6DA] bg-white/70 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[12px] font-medium text-[#2B241C]">{check.title}</span>
                            <span
                              className={[
                                'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]',
                                connectionTone(check.status),
                              ].join(' ')}
                            >
                              {labelForConnectionStatus(check.status)}
                            </span>
                          </div>
                          <div className="mt-1 text-[12px] leading-5 text-[#867B6D]">{check.detail}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 border-t border-[#E8DED2] px-6 py-4">
            <button
              type="button"
              onClick={() => {
                setSaveState('saving');
                onSaveConfig();
                setTimeout(() => {
                  setSaveState('saved');
                  setTimeout(() => setSaveState('idle'), 2000);
                }, 300);
              }}
              disabled={saveState === 'saving'}
              className={[
                'inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-[13px] font-medium transition-colors',
                saveState === 'saved'
                  ? 'border-green-300 bg-green-50 text-green-700'
                  : 'border-[#DCCFBE] bg-[#F4EEE4] text-[#3A3128] hover:bg-[#EEE5D8]',
              ].join(' ')}
            >
              {saveState === 'saving' ? <LoaderCircle size={14} className="animate-spin" /> :
               saveState === 'saved' ? <Check size={14} /> : <Save size={14} />}
              {saveState === 'saving' ? '保存中...' : saveState === 'saved' ? '已保存 ✓' : '保存'}
            </button>
            <button
              type="button"
              onClick={onTestConnection}
              disabled={isTestingConnection}
              className="inline-flex items-center justify-center rounded-2xl border border-[#E5D6CA] bg-white px-3 py-3 text-[13px] text-[#6A5F53] hover:bg-[#F8F3EC] disabled:opacity-50"
            >
              {isTestingConnection ? <LoaderCircle size={14} className="animate-spin" /> : <Terminal size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
