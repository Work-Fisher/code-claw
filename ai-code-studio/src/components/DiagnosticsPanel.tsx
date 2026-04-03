import { Activity, RefreshCw, ShieldCheck, Wrench, X } from 'lucide-react';
import {
  formatRelativeTime,
  formatTimestamp,
  labelForGatewayStatus,
  labelForPermissionMode,
  labelForRunStatus,
  labelForRunner,
  labelForSessionRunStatus,
  sessionRunTone,
} from '../app/helpers';
import type { DiagnosticsReport } from '../app/types';

function pathTypeLabel(type: string) {
  switch (type) {
    case 'directory':
      return '目录';
    case 'file':
      return '文件';
    case 'missing':
      return '缺失';
    default:
      return type || '未知';
  }
}

function pathTone(type: string) {
  switch (type) {
    case 'directory':
    case 'file':
      return 'bg-[#EEF4EA] text-[#55704B] border-[#D9E5D0]';
    case 'missing':
      return 'bg-[#FFF1ED] text-[#A05545] border-[#EBCFC6]';
    default:
      return 'bg-[#F4F0EA] text-[#7C7062] border-[#E4DACD]';
  }
}

type DiagnosticsPanelProps = {
  report: DiagnosticsReport | null;
  loading: boolean;
  hostMessage: string | null;
  encryptionAvailable: boolean | null;
  onRefresh: () => void;
  onExport: () => void;
  onClose: () => void;
};

export function DiagnosticsPanel({
  report,
  loading,
  hostMessage,
  encryptionAvailable,
  onRefresh,
  onExport,
  onClose,
}: DiagnosticsPanelProps) {
  return (
    <section className="border-t border-[#E7DFD3] bg-[#F8F4ED] px-4 py-4">
      <div className="mx-auto w-full max-w-[980px] rounded-[22px] border border-[#E2D8CB] bg-white/75 p-4 shadow-[0_18px_40px_rgba(85,63,36,0.06)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8C8173]">
              运行诊断
            </div>
            <div className="mt-1 text-[18px] font-semibold text-[#241F17]">
              用来检查当前会话、运行时、路径和恢复状态
            </div>
            <div className="mt-1 text-[12px] text-[#8A7F70]">
              {report?.generatedAt ? `更新于 ${formatTimestamp(report.generatedAt)}` : '等待首次加载'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExport}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E4DACD] bg-white px-3 py-2 text-[12px] text-[#5F564A] hover:bg-[#F8F3EC]"
            >
              导出
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E4DACD] bg-white px-3 py-2 text-[12px] text-[#5F564A] hover:bg-[#F8F3EC]"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              刷新
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E4DACD] bg-white px-3 py-2 text-[12px] text-[#5F564A] hover:bg-[#F8F3EC]"
            >
              <X size={14} />
              收起
            </button>
          </div>
        </div>

        {hostMessage ? (
          <div className="mt-4 rounded-2xl border border-[#F0DDC6] bg-[#FFF7EE] px-4 py-3 text-[13px] leading-6 text-[#94663C]">
            <div className="font-medium">桌面宿主提示</div>
            <div className="mt-1">{hostMessage}</div>
          </div>
        ) : null}

        {report ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] px-4 py-3">
                <div className="text-[12px] text-[#8A7F70]">网关</div>
                <div className="mt-1 text-[16px] font-semibold text-[#241F17]">
                  {labelForGatewayStatus(report.gateway.status)}
                </div>
              </div>
              <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] px-4 py-3">
                <div className="text-[12px] text-[#8A7F70]">运行态</div>
                <div className="mt-1 text-[16px] font-semibold text-[#241F17]">
                  {labelForRunStatus(report.run.status)}
                </div>
              </div>
              <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] px-4 py-3">
                <div className="text-[12px] text-[#8A7F70]">会话总数</div>
                <div className="mt-1 text-[16px] font-semibold text-[#241F17]">{report.sessions.total}</div>
              </div>
              <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] px-4 py-3">
                <div className="text-[12px] text-[#8A7F70]">安全存储</div>
                <div className="mt-1 text-[16px] font-semibold text-[#241F17]">
                  {encryptionAvailable == null ? '未知' : encryptionAvailable ? '可用' : '不可用'}
                </div>
              </div>
              <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] px-4 py-3">
                <div className="text-[12px] text-[#8A7F70]">等待队列</div>
                <div className="mt-1 text-[16px] font-semibold text-[#241F17]">{report.run.queueCount}</div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] p-4">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#241F17]">
                  <Activity size={15} />
                  当前运行
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-[12px] text-[#8A7F70]">模型</div>
                    <div className="mt-1 text-[13px] text-[#241F17]">{report.run.model || '未启动'}</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-[#8A7F70]">权限</div>
                    <div className="mt-1 text-[13px] text-[#241F17]">
                      {labelForPermissionMode(report.run.permissionMode)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[12px] text-[#8A7F70]">运行方式</div>
                    <div className="mt-1 text-[13px] text-[#241F17]">{labelForRunner(report.config.runner)}</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-[#8A7F70]">上下文</div>
                    <div className="mt-1 text-[13px] text-[#241F17]">
                      {report.run.contextMessageCount || 0} 条，延续 {report.run.carriedMessageCount || 0} 条
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-[12px] text-[#8A7F70]">工作目录</div>
                    <div className="mt-1 break-all text-[13px] text-[#241F17]">{report.run.cwd || '未设置'}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] p-4">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#241F17]">
                  <ShieldCheck size={15} />
                  恢复状态
                </div>
                <div className="mt-3 space-y-3">
                  <div className="text-[12px] text-[#8A7F70]">当前会话</div>
                  <div className="text-[14px] font-medium text-[#241F17]">
                    {report.selectedSession.summary || '未选中会话'}
                  </div>
                  {report.selectedSession.runStatus ? (
                    <span
                      className={[
                        'inline-flex rounded-full border px-2.5 py-1 text-[11px]',
                        sessionRunTone(report.selectedSession.runStatus),
                      ].join(' ')}
                    >
                      {labelForSessionRunStatus(report.selectedSession.runStatus)}
                    </span>
                  ) : null}
                  {report.selectedSession.runMessage ? (
                    <div className="rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3 text-[13px] leading-6 text-[#5F564A]">
                      {report.selectedSession.runMessage}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3 text-[12px] text-[#7B6F61]">
                    <div>中断会话：{report.sessions.interrupted}</div>
                    <div>失败会话：{report.sessions.failed}</div>
                    <div>运行中：{report.sessions.running}</div>
                    <div>已完成：{report.sessions.completed}</div>
                  </div>
                  {report.run.pendingApproval ? (
                    <div className="rounded-2xl border border-[#F0DDC6] bg-[#FFF7EE] px-3 py-3 text-[13px] leading-6 text-[#94663C]">
                      <div className="font-medium">{report.run.pendingApproval.title}</div>
                      <div className="mt-1">{report.run.pendingApproval.promptPreview}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] p-4">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#241F17]">
                  <Wrench size={15} />
                  工具流概览
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3">
                    <div className="text-[12px] text-[#8A7F70]">工具调用</div>
                    <div className="mt-1 text-[18px] font-semibold text-[#241F17]">{report.tools.total}</div>
                  </div>
                  <div className="rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3">
                    <div className="text-[12px] text-[#8A7F70]">失败工具</div>
                    <div className="mt-1 text-[18px] font-semibold text-[#241F17]">{report.tools.failed}</div>
                  </div>
                  <div className="rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3">
                    <div className="text-[12px] text-[#8A7F70]">改动文件</div>
                    <div className="mt-1 text-[18px] font-semibold text-[#241F17]">{report.tools.changedFiles}</div>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3 text-[13px] text-[#5F564A]">
                  最近工具：{report.tools.lastToolName || '暂无'}
                </div>
              </div>

              <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] p-4">
                <div className="text-[13px] font-semibold text-[#241F17]">路径检查</div>
                <div className="mt-3 space-y-3">
                  {[
                    ['工作区', report.paths.workspaceDir, report.paths.workspaceType],
                    ['claw-code 目录', report.paths.clawProjectDir, report.paths.clawProjectType],
                    ['二进制路径', report.paths.clawBinaryPath, report.paths.clawBinaryType],
                  ].map(([label, value, type]) => (
                    <div key={label} className="rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[12px] font-medium text-[#241F17]">{label}</div>
                        <span className={['rounded-full border px-2 py-0.5 text-[11px]', pathTone(type)].join(' ')}>
                          {pathTypeLabel(type)}
                        </span>
                      </div>
                      <div className="mt-2 break-all text-[12px] leading-6 text-[#7B6F61]">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] p-4">
              <div className="text-[13px] font-semibold text-[#241F17]">最近日志</div>
              <div className="mt-1 text-[12px] text-[#8A7F70]">共 {report.logs.total} 条</div>
              <div className="mt-3 space-y-2">
                {report.logs.recent.length > 0 ? (
                  report.logs.recent
                    .slice()
                    .reverse()
                    .map(entry => (
                      <div key={entry.id} className="rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3">
                        <div className="flex items-center justify-between gap-3 text-[12px] text-[#8A7F70]">
                          <span>{entry.source}</span>
                          <span>{formatTimestamp(entry.timestamp)}</span>
                        </div>
                        <div className="mt-1 text-[13px] leading-6 text-[#5F564A]">{entry.text}</div>
                      </div>
                    ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#E4DACD] px-4 py-5 text-[13px] text-[#978C7E]">
                    暂无日志。
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-[#E4DACD] px-4 py-6 text-[13px] text-[#978C7E]">
            {loading ? '正在加载诊断信息…' : '还没有诊断数据。'}
          </div>
        )}
      </div>
    </section>
  );
}
