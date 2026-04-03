import { useEffect, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { CompanionWidget } from '../buddy/CompanionWidget';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  FolderOpen,
  LoaderCircle,
  Plus,
  Square,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import {
  describeIssue,
  formatCurrency,
  formatTimestamp,
  issueToneClass,
  labelForPermissionMode,
  labelForSessionRunStatus,
  sessionRunTone,
  statusTone,
  titleForActivity,
  trimText,
} from '../app/helpers';
import type { ConfigState, FeedEntry, SessionItem, Snapshot, TabKey, TranscriptEntry } from '../app/types';

function ActivityCard({ entry }: { entry: FeedEntry }) {
  const diffFiles = ('diff' in entry ? entry.diff?.files : undefined) || [];

  return (
    <details className="group rounded-2xl border border-[#E7DFD3] bg-white/75">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] text-[#84796A]">
        <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
        <span className={statusTone(entry.status)}>{titleForActivity(entry)}</span>
      </summary>
      <div className="space-y-3 border-t border-[#EFE8DD] px-4 pb-4 pt-1">
        {'meta' in entry && entry.meta ? (
          <div className="text-[12px] text-[#9C907F]">{entry.meta}</div>
        ) : null}

        {'content' in entry && trimText(entry.content) ? (
          <pre className="whitespace-pre-wrap break-words rounded-2xl bg-[#FBF8F3] p-3 font-mono text-[12px] leading-6 text-[#5B5145]">
            {trimText(entry.content)}
          </pre>
        ) : null}

        {diffFiles.map(file => (
          <div key={file.filePath} className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] p-3">
            <div className="mb-2 flex items-center justify-between gap-4 text-[12px] text-[#6B6155]">
              <span className="truncate">{file.filePath}</span>
              <span className="shrink-0">
                {file.isNewFile ? '新文件' : `+${file.linesAdded || 0} / -${file.linesRemoved || 0}`}
              </span>
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[#786C5D]">
              {trimText(file.patchPreview, '暂无补丁预览。')}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}

function MessageCard({ entry }: { entry: FeedEntry }) {
  const isPending = entry.id.startsWith('pending-');
  if (entry.feedType === 'user') {
    return (
      <div className="ml-auto flex max-w-[58%] justify-end">
        <div className={[
          'rounded-[18px] border border-[#E4DACB] bg-[#EFE8DD] px-4 py-3 shadow-[0_10px_28px_rgba(74,57,28,0.06)]',
          isPending ? 'opacity-70' : '',
        ].join(' ')}>
          <div className="mb-1 text-[11px] text-[#9A8F80]">你</div>
          <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-[#332C24]">
            {trimText(entry.content)}
          </div>
        </div>
      </div>
    );
  }

  if (entry.feedType === 'assistant' && entry.isError) {
    const issue = describeIssue(entry.content);

    return (
      <div className="max-w-[82%]">
        <div className="mb-2 text-[11px] text-[#9A8F80]">
          助手
          {entry.timestamp ? ` - ${formatTimestamp(entry.timestamp)}` : ''}
        </div>
        <div className={['rounded-[20px] border px-4 py-4', issueToneClass(issue.tone)].join(' ')}>
          <div className="text-[15px] font-semibold">{issue.title}</div>
          <div className="mt-2 text-[14px] leading-7">{issue.detail}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[82%]">
      <div className="mb-2 text-[11px] text-[#9A8F80]">
        {entry.feedType === 'assistant' ? '助手' : entry.title}
        {entry.timestamp ? ` - ${formatTimestamp(entry.timestamp)}` : ''}
      </div>
      <div className="whitespace-pre-wrap break-words text-[15px] leading-8 text-[#2C241C]">
        {trimText(entry.content)}
      </div>
      {entry.feedType === 'assistant' && entry.streaming ? (
        <div className="mt-3 flex items-center gap-2 text-[14px] italic text-[#C06B47]">
          <span className="h-1 w-1 rounded-full bg-current" />
          正在生成……
        </div>
      ) : null}
    </div>
  );
}

function toolIcon(name?: string) {
  const n = (name || '').toLowerCase();
  if (n === 'bash') return '🖥️';
  if (n === 'read_file') return '📄';
  if (n === 'write_file' || n === 'edit_file') return '✏️';
  if (n === 'glob_search') return '📂';
  if (n === 'grep_search') return '🔍';
  if (n === 'webfetch' || n === 'web_fetch') return '🌐';
  if (n === 'websearch' || n === 'web_search') return '🔎';
  if (n === 'todowrite' || n === 'todo_write') return '📋';
  if (n === 'agent') return '🤖';
  if (n === 'notebookedit' || n === 'notebook_edit') return '📓';
  return '⚙️';
}

function toolLabel(name?: string) {
  const n = (name || '').toLowerCase();
  if (n === 'bash') return '执行命令';
  if (n === 'read_file') return '读取文件';
  if (n === 'write_file') return '写入文件';
  if (n === 'edit_file') return '编辑文件';
  if (n === 'glob_search') return '搜索文件';
  if (n === 'grep_search') return '搜索内容';
  if (n === 'webfetch' || n === 'web_fetch') return '获取网页';
  if (n === 'websearch' || n === 'web_search') return '搜索网络';
  if (n === 'todowrite' || n === 'todo_write') return '更新任务';
  if (n === 'agent') return '子代理';
  if (n === 'notebookedit' || n === 'notebook_edit') return '编辑笔记本';
  return name || '工具';
}

function isBashTool(name?: string) {
  return (name || '').toLowerCase() === 'bash';
}

function isFileTool(name?: string) {
  const n = (name || '').toLowerCase();
  return n === 'read_file' || n === 'write_file' || n === 'edit_file';
}

function DiffBlock({ patchPreview }: { patchPreview?: string }) {
  if (!patchPreview) return null;
  const lines = patchPreview.split('\n');
  return (
    <pre className="overflow-x-auto rounded-xl bg-[#1E1E1E] p-3 font-mono text-[11px] leading-5">
      {lines.map((line, i) => {
        let cls = 'text-[#D4D4D4]';
        if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-[#4EC96F] bg-[#1A3A1A]';
        else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-[#F07178] bg-[#3A1A1A]';
        else if (line.startsWith('@@')) cls = 'text-[#569CD6]';
        return <div key={i} className={cls}>{line || ' '}</div>;
      })}
    </pre>
  );
}

function ToolCard({
  entry,
}: {
  entry: TranscriptEntry & { feedType: 'tool_use' | 'tool_result' };
}) {
  const diffFiles = ('diff' in entry ? entry.diff?.files : undefined) || [];
  const status = entry.status || (entry.isError ? 'error' : 'success');
  const name = entry.toolName || entry.title || '';
  const isBash = isBashTool(name);
  const isFile = isFileTool(name);
  const hasDiff = diffFiles.length > 0;
  const content = trimText(entry.content);

  if (entry.feedType === 'tool_use') {
    return (
      <details className="group max-w-[88%]">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-[#E7DFD3] bg-[#F9F6F1] px-3 py-2 text-[13px] text-[#5C5247] transition-colors hover:bg-[#F4EEE4]">
          <span>{toolIcon(name)}</span>
          <span className="font-medium">{toolLabel(name)}</span>
          <ChevronRight className="ml-auto h-3.5 w-3.5 text-[#A99D8D] transition-transform group-open:rotate-90" />
        </summary>
        {content ? (
          <div className="mt-1 ml-6 rounded-xl bg-[#FBF8F3] px-3 py-2 font-mono text-[11px] leading-5 text-[#6B6155]">
            {content.length > 300 ? `${content.slice(0, 300)}…` : content}
          </div>
        ) : null}
      </details>
    );
  }

  if (isBash && content) {
    return (
      <details className="group max-w-[88%]" open>
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-[#E7DFD3] bg-[#F9F6F1] px-3 py-2 text-[13px] text-[#5C5247] transition-colors hover:bg-[#F4EEE4]">
          <span>🖥️</span>
          <span className="font-medium">命令输出</span>
          {status === 'error' ? (
            <span className="rounded-full border border-[#EBCFC6] bg-[#FFF1ED] px-2 py-0.5 text-[10px] text-[#A05545]">失败</span>
          ) : null}
          <ChevronRight className="ml-auto h-3.5 w-3.5 text-[#A99D8D] transition-transform group-open:rotate-90" />
        </summary>
        <pre className={[
          'mt-1 ml-6 overflow-x-auto rounded-xl p-3 font-mono text-[11px] leading-5',
          status === 'error'
            ? 'bg-[#2D1517] text-[#F07178]'
            : 'bg-[#1E1E1E] text-[#D4D4D4]',
        ].join(' ')}>
          {content}
        </pre>
      </details>
    );
  }

  if (hasDiff) {
    return (
      <div className="max-w-[88%] space-y-1">
        {diffFiles.map(file => (
          <details key={file.filePath} className="group" open>
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-[#E7DFD3] bg-[#F9F6F1] px-3 py-2 text-[13px] text-[#5C5247] transition-colors hover:bg-[#F4EEE4]">
              <span>{file.isNewFile ? '📄' : '✏️'}</span>
              <span className="min-w-0 truncate font-medium">{file.filePath}</span>
              <span className="ml-auto shrink-0 text-[11px] text-[#8A7F70]">
                {file.isNewFile ? '新文件' : `+${file.linesAdded || 0} / -${file.linesRemoved || 0}`}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-[#A99D8D] transition-transform group-open:rotate-90" />
            </summary>
            <div className="mt-1 ml-6">
              <DiffBlock patchPreview={file.patchPreview} />
            </div>
          </details>
        ))}
      </div>
    );
  }

  if (isFile && content) {
    return (
      <details className="group max-w-[88%]" open>
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-[#E7DFD3] bg-[#F9F6F1] px-3 py-2 text-[13px] text-[#5C5247] transition-colors hover:bg-[#F4EEE4]">
          <span>{toolIcon(name)}</span>
          <span className="font-medium">{toolLabel(name)}</span>
          <ChevronRight className="ml-auto h-3.5 w-3.5 text-[#A99D8D] transition-transform group-open:rotate-90" />
        </summary>
        <pre className="mt-1 ml-6 overflow-x-auto rounded-xl bg-[#1E1E1E] p-3 font-mono text-[11px] leading-5 text-[#D4D4D4]">
          {content.length > 2000 ? `${content.slice(0, 2000)}\n…(已截断)` : content}
        </pre>
      </details>
    );
  }

  return (
    <details className="group max-w-[88%]">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-[#E7DFD3] bg-[#F9F6F1] px-3 py-2 text-[13px] text-[#5C5247] transition-colors hover:bg-[#F4EEE4]">
        <span>{toolIcon(name)}</span>
        <span className="font-medium">{toolLabel(name)}</span>
        {status === 'error' ? (
          <span className="rounded-full border border-[#EBCFC6] bg-[#FFF1ED] px-2 py-0.5 text-[10px] text-[#A05545]">失败</span>
        ) : null}
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-[#A99D8D] transition-transform group-open:rotate-90" />
      </summary>
      {content ? (
        <div className="mt-1 ml-6 rounded-xl bg-[#FBF8F3] px-3 py-2 font-mono text-[11px] leading-5 text-[#6B6155]">
          {content.length > 500 ? `${content.slice(0, 500)}…` : content}
        </div>
      ) : null}
    </details>
  );
}

type ConversationPaneProps = {
  snapshot: Snapshot;
  config: ConfigState;
  selectedSession: SessionItem | null;
  feedEntries: FeedEntry[];
  prompt: string;
  setPrompt: Dispatch<SetStateAction<string>>;
  activeTab: TabKey;
  setActiveTab: Dispatch<SetStateAction<TabKey>>;
  setupReady: boolean;
  running: boolean;
  isSubmitting: boolean;
  showLogs: boolean;
  showDiagnostics: boolean;
  errorMessage: string | null;
  logsPanel?: ReactNode;
  diagnosticsPanel?: ReactNode;
  onDismissError: () => void;
  onRefreshSessions: () => void;
  onToggleLogs: () => void;
  onToggleDiagnostics: () => void;
  onOpenWizard: () => void;
  onOpenSettings: () => void;
  onToggleSettings: () => void;
  onReset: () => void;
  onSend: () => void;
  onStop: () => void;
  onApprovePendingRun: () => void;
  onRejectPendingRun: () => void;
  onClearQueue: () => void;
  onRenameSession: (sessionId: string, currentName: string) => void;
  skills: Array<{ name: string; description: string }>;
};

export function ConversationPane({
  snapshot,
  config,
  selectedSession,
  feedEntries,
  prompt,
  setPrompt,
  activeTab,
  setActiveTab,
  setupReady,
  running,
  isSubmitting,
  showLogs,
  showDiagnostics,
  errorMessage,
  logsPanel,
  diagnosticsPanel,
  onDismissError,
  onRefreshSessions,
  onToggleLogs,
  onToggleDiagnostics,
  onOpenWizard,
  onOpenSettings,
  onToggleSettings,
  onReset,
  onSend,
  onStop,
  onApprovePendingRun,
  onRejectPendingRun,
  onClearQueue,
  onRenameSession,
  skills,
}: ConversationPaneProps) {
  const feedViewportRef = useRef<HTMLDivElement | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const issue = errorMessage ? describeIssue(errorMessage) : null;
  const contextReady = (snapshot.run.contextMessageCount || 0) > 1;
  const carriedMessages = snapshot.run.carriedMessageCount || 0;
  const sessionRunStatus = selectedSession?.runStatus || null;
  const sessionRunMessage = trimText(selectedSession?.runMessage, '');
  const pendingApproval = snapshot.run.pendingApproval;
  const queuedRuns = snapshot.run.queue || [];

  useEffect(() => {
    const viewport = feedViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [
    activeTab,
    feedEntries.length,
    selectedSession?.sessionId,
    snapshot.run.status,
    pendingApproval?.id,
    queuedRuns.length,
  ]);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-[#FBFAF7]">
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[#E7DFD3] bg-[#FAF7F2] px-5 pt-[36px]" style={{ height: 'calc(52px + 36px)', WebkitAppRegion: 'drag' } as React.CSSProperties}>
        {isRenaming ? (
          <form
            className="inline-flex items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = renameValue.trim();
              if (trimmed && selectedSession) {
                onRenameSession(selectedSession.sessionId, trimmed);
              }
              setIsRenaming(false);
            }}
          >
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => {
                const trimmed = renameValue.trim();
                if (trimmed && selectedSession) {
                  onRenameSession(selectedSession.sessionId, trimmed);
                }
                setIsRenaming(false);
              }}
              onKeyDown={(e) => { if (e.key === 'Escape') setIsRenaming(false); }}
              className="rounded-md border border-[#D4CAB8] bg-white px-2 py-1 text-[15px] font-semibold text-[#231D16] outline-none focus:border-[#B4A796]"
              autoFocus
            />
          </form>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-2 text-[15px] font-semibold text-[#231D16] hover:text-[#4B4337]"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={() => {
              setRenameValue(selectedSession?.summary || '');
              setIsRenaming(true);
            }}
          >
            {selectedSession?.summary || 'claw-code 会话'}
            <ChevronDown size={16} className="text-[#9B8F80]" />
          </button>
        )}
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {running ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F0DDC6] bg-[#FFF7EE] px-2.5 py-1 text-[11px] text-[#94663C]">
              <LoaderCircle size={12} className="animate-spin" />
              运行中
            </span>
          ) : null}
          <button
            type="button"
            onClick={onToggleDiagnostics}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#8A7F70] transition-colors hover:bg-[#EDE6DA]"
            title="诊断"
          >
            <Wrench size={15} />
          </button>
          <button
            type="button"
            onClick={onToggleLogs}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#8A7F70] transition-colors hover:bg-[#EDE6DA]"
            title="日志"
          >
            <Terminal size={15} />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="absolute right-3 top-3 z-10 w-[180px]">
          <CompanionWidget
            runStatus={snapshot.run.status}
            lastRunResult={
              snapshot.run.status === 'idle' && snapshot.timeline.length > 0
                ? snapshot.timeline[snapshot.timeline.length - 1]?.status === 'error'
                  ? 'error'
                  : 'success'
                : null
            }
          />
        </div>
        <div ref={feedViewportRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[820px] flex-col gap-5 px-6 py-8">
            {pendingApproval ? (
              <div className="rounded-[22px] border border-[#F0DDC6] bg-[#FFF7EE] p-4 shadow-[0_12px_30px_rgba(120,84,41,0.08)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#94663C]">
                      <AlertTriangle size={14} />
                      待审批运行
                    </div>
                    <div className="mt-2 text-[18px] font-semibold text-[#3C2E1F]">{pendingApproval.title}</div>
                    <div className="mt-2 text-[14px] leading-7 text-[#7A5C37]">
                      这条请求暂时没有直接执行，正在等待你确认。
                    </div>
                  </div>
                  <span className="rounded-full border border-[#E7CFAF] bg-white px-3 py-1 text-[11px] text-[#94663C]">
                    {pendingApproval.riskLevel === 'high' ? '高风险' : '需确认'}
                  </span>
                </div>

                <div className="mt-4 rounded-2xl border border-[#EBCFC6] bg-white/80 px-4 py-3">
                  <div className="text-[12px] text-[#8A7F70]">请求摘要</div>
                  <div className="mt-1 text-[14px] leading-7 text-[#2C241C]">{pendingApproval.promptPreview}</div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {pendingApproval.reasons.map(reason => (
                    <div key={reason} className="rounded-2xl border border-[#ECD8C1] bg-[#FFFAF3] px-4 py-3 text-[13px] leading-6 text-[#7A5C37]">
                      {reason}
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={onApprovePendingRun}
                    className="rounded-2xl bg-[#2A231C] px-4 py-2.5 text-[13px] text-white transition-colors hover:bg-[#3C3228]"
                  >
                    批准并继续
                  </button>
                  <button
                    type="button"
                    onClick={onRejectPendingRun}
                    className="rounded-2xl border border-[#E5D6CA] bg-white px-4 py-2.5 text-[13px] text-[#6A5F53] transition-colors hover:bg-[#F8F3EC]"
                  >
                    取消这次运行
                  </button>
                </div>
              </div>
            ) : null}

            {queuedRuns.length > 0 ? (
              <div className="rounded-[22px] border border-[#E7DFD3] bg-white/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8C8173]">
                      <Clock3 size={14} />
                      等待队列
                    </div>
                    <div className="mt-2 text-[18px] font-semibold text-[#241F17]">
                      还有 {queuedRuns.length} 条请求在等待当前任务之后执行。
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClearQueue}
                    className="rounded-2xl border border-[#E5D6CA] bg-white px-3 py-2 text-[12px] text-[#6A5F53] hover:bg-[#F8F3EC]"
                  >
                    清空队列
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {queuedRuns.slice(0, 4).map(item => (
                    <div key={item.id} className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-[#2C241C]">{item.promptPreview}</div>
                          <div className="mt-1 text-[11px] text-[#8A7F70]">
                            {item.sessionId || '当前会话'} · {formatTimestamp(item.createdAt)}
                          </div>
                        </div>
                        <span className="rounded-full border border-[#E4DACD] bg-white px-2 py-0.5 text-[10px] text-[#6C6154]">
                          {labelForPermissionMode(item.permissionMode)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {queuedRuns.length > 4 ? (
                    <div className="text-[12px] text-[#8A7F70]">其余 {queuedRuns.length - 4} 条请求仍在队列中。</div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {feedEntries.length > 0 ? (
              <>
                {feedEntries.map(entry =>
                  entry.feedType === 'user' || entry.feedType === 'assistant' ? (
                    <MessageCard key={entry.id} entry={entry} />
                  ) : entry.feedType === 'tool_use' || entry.feedType === 'tool_result' ? (
                    <ToolCard key={entry.id} entry={entry as TranscriptEntry & { feedType: 'tool_use' | 'tool_result' }} />
                  ) : null,
                )}
                {running && feedEntries.length > 0 && feedEntries[feedEntries.length - 1]?.feedType === 'user' ? (
                  <div className="flex items-center gap-2 text-[13px] text-[#9A8F80]">
                    <LoaderCircle size={14} className="animate-spin text-[#C4956A]" />
                    <span className="italic">Spinning...</span>
                    {snapshot.run.lastResult?.numTurns ? (
                      <span className="ml-auto text-[11px] text-[#B5AA9B]">
                        {snapshot.run.lastResult.numTurns} 轮
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
                <div className="text-[15px] font-medium text-[#2C251D]">
                  {setupReady ? '有什么可以帮你的？' : '先完成初始化'}
                </div>
                <div className="mt-2 text-[13px] text-[#877B6C]">
                  {setupReady
                    ? '在下面输入你的任务，Claw 会帮你读取、修改文件和执行命令。'
                    : '请先完成启动向导或打开设置配置 provider。'}
                </div>
                {!setupReady ? (
                  <div className="mt-4 flex gap-3">
                    <button type="button" onClick={onOpenWizard} className="rounded-xl bg-[#2A231C] px-3 py-2 text-[13px] text-white hover:bg-[#3C3228]">
                      启动向导
                    </button>
                    <button type="button" onClick={onOpenSettings} className="rounded-xl border border-[#E5D8C9] bg-white px-3 py-2 text-[13px] text-[#5F564A] hover:bg-[#F8F3EC]">
                      设置
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pb-3">
          {issue ? (
            <div
              className={[
                'mx-auto mb-3 w-full max-w-[980px] rounded-2xl border px-4 py-4',
                issueToneClass(issue.tone),
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3">
                  <X size={16} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold">{issue.title}</div>
                    <div className="mt-1 text-[13px] leading-6">{issue.detail}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={onOpenSettings}
                        className="rounded-xl border border-current/15 bg-white/70 px-3 py-1.5 text-[12px] font-medium text-inherit"
                      >
                        打开设置
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onDismissError}
                  className="rounded-xl border border-current/15 bg-white/70 px-2 py-1 text-[12px] text-inherit"
                >
                  关闭
                </button>
              </div>
            </div>
          ) : null}

          <div className="relative mx-auto w-full max-w-[820px]">
            {prompt.startsWith('/') && !prompt.includes(' ') && skills.length > 0 && (
              <div className="absolute bottom-full left-0 z-10 mb-1 w-full max-h-[200px] overflow-y-auto rounded-xl border border-[#E6DDCF] bg-white shadow-lg">
                {skills
                  .filter(s => s.name.toLowerCase().startsWith(prompt.slice(1).toLowerCase()))
                  .map(s => (
                    <button
                      key={s.name}
                      type="button"
                      className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-[#F5F0E8]"
                      onClick={() => setPrompt(`/${s.name} `)}
                    >
                      <span className="font-medium text-[#2A231C]">/{s.name}</span>
                      <span className="truncate text-[#9A8F80]">{s.description}</span>
                    </button>
                  ))}
              </div>
            )}
          <div className="rounded-[16px] border border-[#E6DDCF] bg-white shadow-[0_8px_32px_rgba(88,66,39,0.06)]">
            <textarea
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (!running && !isSubmitting) {
                    onSend();
                  }
                }
              }}
              className="min-h-[56px] w-full resize-none bg-transparent px-4 py-3.5 text-[14px] leading-6 text-[#2D261E] outline-none placeholder:text-[#A99D8D]"
              placeholder="Reply..."
            />

            <div className="flex items-center justify-between gap-3 border-t border-[#F0E8DE] px-3 py-2">
              <div className="flex items-center gap-3 text-[11px] text-[#9A8F80]">
                {contextReady ? (
                  <span>{snapshot.run.contextMessageCount} msgs in context</span>
                ) : null}
                {snapshot.run.lastResult?.numTurns ? (
                  <span>{snapshot.run.lastResult.numTurns} turns · {formatCurrency(snapshot.run.lastResult.totalCostUsd)}</span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#9A8F80]">
                  {snapshot.run.model || config.clawModel || config.upstreamModel || '模型'}
                </span>
                <button
                  type="button"
                  onClick={running ? onStop : onSend}
                  disabled={isSubmitting}
                  className={[
                    'flex h-8 w-8 items-center justify-center rounded-full bg-[#2A231C] text-white transition-colors hover:bg-[#3C3228]',
                    isSubmitting ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  {running ? (
                    <Square size={12} />
                  ) : isSubmitting ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>

        {diagnosticsPanel}

        {logsPanel}

        <footer className="flex h-7 items-center justify-between border-t border-[#E7DFD3] bg-[#FBFAF7] px-4 text-[11px] text-[#9A8F80]">
          <span className="inline-flex items-center gap-1 truncate">
            <FolderOpen size={11} />
            {snapshot.run.cwd || config.workspaceDir || '工作区'}
          </span>
          <div className="flex items-center gap-3">
            {snapshot.run.lastResult?.numTurns ? (
              <span>{snapshot.run.lastResult.numTurns} 轮 · {formatCurrency(snapshot.run.lastResult.totalCostUsd)}</span>
            ) : null}
          </div>
        </footer>
      </div>
    </main>
  );
}
