import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderOpen,
  KeyRound,
  Rocket,
  ServerCog,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import { checklistTone, connectionTone, formatTimestamp, labelForConnectionStatus } from '../app/helpers';
import { providerPresets } from '../app/providerPresets';
import type { ConfigState, ConnectionReport, SetupChecklistItem } from '../app/types';

type WizardStep = 'welcome' | 'provider' | 'workspace' | 'runtime' | 'verify';

type SetupWizardProps = {
  open: boolean;
  config: ConfigState;
  setConfig: React.Dispatch<React.SetStateAction<ConfigState>>;
  setupChecklist: SetupChecklistItem[];
  connectionReport: ConnectionReport | null;
  isTestingConnection: boolean;
  onSaveConfig: () => void;
  onTestConnection: () => void;
  onClose: () => void;
  onComplete: () => void;
};

const wizardSteps: WizardStep[] = ['welcome', 'provider', 'workspace', 'runtime', 'verify'];

function stepLabel(step: WizardStep) {
  switch (step) {
    case 'welcome':
      return '欢迎';
    case 'provider':
      return '模型来源';
    case 'workspace':
      return '工作区';
    case 'runtime':
      return '运行时';
    case 'verify':
      return '验证';
  }
}

function StepBadge({
  step,
  active,
  complete,
}: {
  step: WizardStep;
  active: boolean;
  complete: boolean;
}) {
  return (
    <div
      className={[
        'rounded-2xl border px-3 py-2',
        active
          ? 'border-[#D8CAB8] bg-[#F4EEE4] text-[#241F17]'
          : complete
            ? 'border-[#D9E5D0] bg-[#EEF4EA] text-[#55704B]'
            : 'border-[#E8DED2] bg-[#FCFAF6] text-[#8A7F70]',
      ].join(' ')}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em]">{stepLabel(step)}</div>
    </div>
  );
}

export function SetupWizard({
  open,
  config,
  setConfig,
  setupChecklist,
  connectionReport,
  isTestingConnection,
  onSaveConfig,
  onTestConnection,
  onClose,
  onComplete,
}: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('welcome');

  const stepIndex = wizardSteps.indexOf(step);
  const allReady = setupChecklist.every(item => item.ready);
  const canFinish = allReady && Boolean(connectionReport?.ok);
  const providerReady = Boolean(config.upstreamBaseUrl && config.upstreamModel);
  const workspaceReady = Boolean(config.workspaceDir && config.clawProjectDir);
  const runtimeReady =
    config.runner === 'binary' ? Boolean(config.clawBinaryPath) : Boolean(config.clawProjectDir);

  const completedSteps = useMemo(
    () => ({
      welcome: false,
      provider: providerReady,
      workspace: workspaceReady,
      runtime: runtimeReady,
      verify: canFinish,
    }),
    [providerReady, workspaceReady, runtimeReady, canFinish],
  );

  if (!open) {
    return null;
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

  function move(delta: -1 | 1) {
    const nextIndex = Math.min(Math.max(stepIndex + delta, 0), wizardSteps.length - 1);
    setStep(wizardSteps[nextIndex]);
  }

  function jumpToRecommendedStep() {
    if (!providerReady) {
      setStep('provider');
      return;
    }
    if (!workspaceReady) {
      setStep('workspace');
      return;
    }
    if (!runtimeReady) {
      setStep('runtime');
      return;
    }
    setStep('verify');
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[rgba(27,22,17,0.34)] p-6 backdrop-blur-[2px]">
      <div className="pointer-events-auto flex max-h-[92vh] w-full max-w-[1180px] overflow-hidden rounded-[32px] border border-[#E1D6C8] bg-[#FCF9F4] shadow-[0_30px_90px_rgba(51,37,18,0.18)]">
        <div className="flex w-[320px] shrink-0 flex-col border-r border-[#E8DED2] bg-[linear-gradient(180deg,#F7F1E7_0%,#F8F5EE_100%)] p-6">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#E5D9C9] bg-white/70 px-3 py-1 text-[12px] text-[#7F7467]">
            <Sparkles size={14} />
            首次启动向导
          </div>

          <div className="mt-5 text-[28px] font-semibold leading-tight text-[#241F17]">
            先完成 claw-code 初始化，然后就能顺畅进入工作。
          </div>
          <div className="mt-3 text-[14px] leading-7 text-[#7C7266]">
            这个向导会在第一次运行前，帮你完成 provider、工作区、运行时和连接验证。
          </div>

          <div className="mt-6 space-y-2">
            {wizardSteps.map(item => (
              <StepBadge key={item} step={item} active={item === step} complete={completedSteps[item]} />
            ))}
          </div>

          <div className="mt-6 rounded-[24px] border border-[#E8DED2] bg-white/75 p-4">
            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8C8173]">
              就绪检查
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
                {step === 'welcome'
                  ? '欢迎'
                  : step === 'provider'
                    ? '模型来源设置'
                    : step === 'workspace'
                      ? '工作区设置'
                      : step === 'runtime'
                        ? '运行时设置'
                        : '完成验证'}
              </div>
              <div className="mt-1 text-[18px] font-semibold text-[#241F17]">
                {step === 'welcome'
                  ? '用最短路径完成第一次成功运行。'
                  : step === 'provider'
                    ? '选择模型回复的来源。'
                    : step === 'workspace'
                      ? '把 Claw 指向正确的本地目录。'
                      : step === 'runtime'
                        ? '告诉应用应该如何启动运行时。'
                        : '进入工作区前，先保存并完成测试。'}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-[#E5D8C9] bg-white px-3 py-2 text-[13px] text-[#6A5F53] hover:bg-[#FAF7F2]"
            >
              <span className="inline-flex items-center gap-2">
                <X size={14} />
                稍后再说
              </span>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {step === 'welcome' ? (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[24px] border border-[#E8DED2] bg-white/80 p-5">
                  <KeyRound size={18} className="text-[#8C8173]" />
                  <div className="mt-3 text-[16px] font-semibold text-[#241F17]">连接 Provider</div>
                  <div className="mt-2 text-[13px] leading-6 text-[#7C7266]">
                    可以直接使用 Kimi、OpenAI 等预设，也可以把网关指向任意兼容 OpenAI 的上游接口。
                  </div>
                </div>
                <div className="rounded-[24px] border border-[#E8DED2] bg-white/80 p-5">
                  <FolderOpen size={18} className="text-[#8C8173]" />
                  <div className="mt-3 text-[16px] font-semibold text-[#241F17]">选择工作区</div>
                  <div className="mt-2 text-[13px] leading-6 text-[#7C7266]">
                    设置 Claw 要操作的项目目录，以及它依赖的本地运行时代码目录。
                  </div>
                </div>
                <div className="rounded-[24px] border border-[#E8DED2] bg-white/80 p-5">
                  <Terminal size={18} className="text-[#8C8173]" />
                  <div className="mt-3 text-[16px] font-semibold text-[#241F17]">验证启动链路</div>
                  <div className="mt-2 text-[13px] leading-6 text-[#7C7266]">
                    先保存配置，再做连接测试，确认运行时可以正常回复后再开始。
                  </div>
                </div>
              </div>
            ) : null}

            {step === 'provider' ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-[#E8DED2] bg-[#FAF6EF] p-4 text-[13px] leading-7 text-[#7B6F61]">
                  选择你的 AI 服务商，填入 API Key 即可。支持国内外主流服务商，也可以自定义接口。
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  {providerPresets.map(preset => {
                    const active =
                      preset.id !== 'custom' &&
                      preset.upstreamBaseUrl === config.upstreamBaseUrl &&
                      preset.upstreamModel === config.upstreamModel;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          setConfig(current => ({
                            ...current,
                            upstreamBaseUrl: preset.upstreamBaseUrl,
                            upstreamModel: preset.upstreamModel,
                            clawModel: preset.clawModel,
                            textMode: preset.textMode,
                          }))
                        }
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

                <div className="rounded-[24px] border border-[#E8DED2] bg-white/80 p-4 text-[13px] leading-6 text-[#7B6F61]">
                  {window.clawDesktop?.getBootstrap
                    ? '桌面模式下，API Key 会与普通配置文件分开保存。'
                    : '浏览器模式只会把 API Key 保存在内存里；桌面版支持更安全的本地存储。'}
                </div>
              </div>
            ) : null}

            {step === 'workspace' ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-[#E8DED2] bg-[#FAF6EF] p-4 text-[13px] leading-7 text-[#7B6F61]">
                  工作区就是 Claw 实际修改文件的目录。Claw 项目目录则是用来启动 agent 逻辑的本地运行时代码树。
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
                  <span className="text-[12px] text-[#8E8376]">Claw 项目目录</span>
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

            {step === 'runtime' ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-[#E8DED2] bg-[#FAF6EF] p-4 text-[13px] leading-7 text-[#7B6F61]">
                  选择应用是优先启动已编译二进制，还是回退到 Cargo。自动模式会优先使用可用的二进制，
                  只有在必要时才调用 Cargo。
                </div>

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

                <label className="block space-y-1.5">
                  <span className="text-[12px] text-[#8E8376]">Claw 二进制路径</span>
                  <div className="flex gap-2">
                    <input
                      value={config.clawBinaryPath}
                      onChange={event => setConfig(current => ({ ...current, clawBinaryPath: event.target.value }))}
                      className="min-w-0 flex-1 rounded-2xl border border-[#E6DCCD] bg-white px-3 py-3 text-[14px] outline-none focus:border-[#C9B9A3]"
                      placeholder="可选：已编译二进制路径"
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
                        setConfig(current => ({ ...current, gatewayPort: Number.isNaN(next) ? 8787 : next }));
                      }}
                      className="w-full rounded-2xl border border-[#E6DCCD] bg-white px-3 py-3 text-[14px] outline-none focus:border-[#C9B9A3]"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {step === 'verify' ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-[#E8DED2] bg-[#FAF6EF] p-4 text-[13px] leading-7 text-[#7B6F61]">
                  先保存当前配置，再执行连接测试。只有当应用能够同时连通运行时和所选 provider 时，才算完成。
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={onSaveConfig}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#DCCFBE] bg-[#F4EEE4] px-4 py-3 text-[14px] font-medium text-[#3A3128] hover:bg-[#EEE5D8]"
                  >
                    <Rocket size={16} />
                    保存配置
                  </button>
                  <button
                    type="button"
                    onClick={onTestConnection}
                    disabled={isTestingConnection}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E5D6CA] bg-white px-4 py-3 text-[14px] text-[#6A5F53] hover:bg-[#F8F3EC] disabled:opacity-50"
                  >
                    <ServerCog size={16} />
                    {isTestingConnection ? '正在测试连接…' : '执行连接测试'}
                  </button>
                </div>

                <div className="space-y-2">
                  {setupChecklist.map(item => (
                    <div key={item.label} className="rounded-2xl border border-[#EFE6DA] bg-white px-3 py-3">
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
                  <div className="rounded-[24px] border border-[#E8DED2] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[14px] font-semibold text-[#241F17]">最近一次连接测试</div>
                        <div className="mt-1 text-[12px] text-[#867B6D]">
                          {connectionReport.testedAt ? formatTimestamp(connectionReport.testedAt) : '刚刚'}
                        </div>
                      </div>
                      <span
                        className={[
                          'rounded-full border px-2 py-0.5 text-[11px]',
                          connectionReport.ok ? checklistTone(true) : checklistTone(false),
                        ].join(' ')}
                      >
                        {connectionReport.ok ? '通过' : '需要处理'}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {connectionReport.checks.map(check => (
                        <div key={check.id} className="rounded-2xl border border-[#EFE6DA] bg-[#FCFAF6] px-3 py-2.5">
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

                {canFinish ? (
                  <div className="rounded-[24px] border border-[#D9E5D0] bg-[#EEF4EA] p-4 text-[#55704B]">
                    <div className="inline-flex items-center gap-2 text-[15px] font-semibold">
                      <Check size={16} />
                      看起来一切都准备好了。
                    </div>
                    <div className="mt-2 text-[13px] leading-6">
                      现在可以离开向导，在工作区开始第一次正式运行。
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t border-[#E8DED2] px-6 py-5">
            <button
              type="button"
              onClick={() => move(-1)}
              disabled={stepIndex === 0}
              className="inline-flex items-center gap-2 rounded-2xl border border-[#E5D8C9] bg-white px-4 py-3 text-[14px] text-[#6A5F53] hover:bg-[#FAF7F2] disabled:opacity-40"
            >
              <ArrowLeft size={16} />
              上一步
            </button>

            <div className="flex items-center gap-3">
              {step === 'welcome' ? (
                <button
                  type="button"
                  onClick={jumpToRecommendedStep}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#2A231C] px-5 py-3 text-[14px] font-medium text-white hover:bg-[#3C3228]"
                >
                  开始配置
                  <ArrowRight size={16} />
                </button>
              ) : step === 'verify' ? (
                <button
                  type="button"
                  onClick={onComplete}
                  disabled={!canFinish}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#2A231C] px-5 py-3 text-[14px] font-medium text-white hover:bg-[#3C3228] disabled:opacity-40"
                >
                  完成向导
                  <Check size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => move(1)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#2A231C] px-5 py-3 text-[14px] font-medium text-white hover:bg-[#3C3228]"
                >
                  下一步
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
