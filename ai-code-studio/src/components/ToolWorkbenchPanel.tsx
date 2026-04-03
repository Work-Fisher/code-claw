import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Search,
  Wrench,
} from 'lucide-react';
import { formatTimestamp, trimText } from '../app/helpers';
import type { DiffFile, ToolCall } from '../app/types';

type ToolWorkbenchPanelProps = {
  toolCalls: ToolCall[];
};

type FileArtifact = {
  key: string;
  filePath: string;
  patchPreview: string;
  linesAdded: number;
  linesRemoved: number;
  isNewFile: boolean;
  toolIds: string[];
  toolNames: string[];
  statuses: string[];
};

function toolStatusLabel(status?: string | null) {
  switch (status) {
    case 'error':
    case 'failed':
      return '失败';
    case 'success':
    case 'completed':
      return '成功';
    case 'running':
      return '运行中';
    default:
      return '待处理';
  }
}

function toolStatusTone(status?: string | null) {
  switch (status) {
    case 'error':
    case 'failed':
      return 'border-[#EBCFC6] bg-[#FFF1ED] text-[#A05545]';
    case 'success':
    case 'completed':
      return 'border-[#D9E5D0] bg-[#EEF4EA] text-[#55704B]';
    case 'running':
      return 'border-[#F0DDC6] bg-[#FFF5EA] text-[#94663C]';
    default:
      return 'border-[#E4DACD] bg-[#F4F0EA] text-[#7C7062]';
  }
}

function normalizeFileArtifacts(toolCalls: ToolCall[]) {
  const map = new Map<string, FileArtifact>();

  for (const call of toolCalls) {
    const files = Array.isArray(call.diff?.files) ? call.diff.files : [];
    for (const file of files) {
      const key = file.filePath || `${call.id}-${map.size}`;
      const current = map.get(key) || {
        key,
        filePath: file.filePath || '未命名文件',
        patchPreview: '',
        linesAdded: 0,
        linesRemoved: 0,
        isNewFile: false,
        toolIds: [],
        toolNames: [],
        statuses: [],
      };

      current.patchPreview = file.patchPreview || current.patchPreview;
      current.linesAdded += file.linesAdded || 0;
      current.linesRemoved += file.linesRemoved || 0;
      current.isNewFile = current.isNewFile || Boolean(file.isNewFile);

      if (!current.toolIds.includes(call.id)) {
        current.toolIds.push(call.id);
      }
      const toolName = call.title || call.name || '工具';
      if (!current.toolNames.includes(toolName)) {
        current.toolNames.push(toolName);
      }
      if (call.status && !current.statuses.includes(call.status)) {
        current.statuses.push(call.status);
      }

      map.set(key, current);
    }
  }

  return [...map.values()];
}

function FileDiffCard({
  file,
  active,
  onClick,
}: {
  file: FileArtifact;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
        active
          ? 'border-[#DCCFBE] bg-[#F5EFE4]'
          : 'border-[#ECE2D6] bg-white/80 hover:bg-[#FCFAF6]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-[#2C241C]">{file.filePath}</div>
          <div className="mt-1 text-[11px] text-[#8A7F70]">
            {file.isNewFile ? '新文件' : `+${file.linesAdded} / -${file.linesRemoved}`}
          </div>
        </div>
        <span className="rounded-full border border-[#E4DACD] bg-[#F7F2EA] px-2 py-0.5 text-[10px] text-[#7C7062]">
          {file.toolNames.length} 个工具
        </span>
      </div>
    </button>
  );
}

function ToolRunCard({
  call,
  active,
  onClick,
}: {
  call: ToolCall;
  active: boolean;
  onClick: () => void;
}) {
  const title = call.title || call.name || '工具';
  const preview = trimText(call.resultPreview || call.inputPreview, '暂无摘要');

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
        active
          ? 'border-[#DCCFBE] bg-[#F5EFE4]'
          : 'border-[#ECE2D6] bg-white/80 hover:bg-[#FCFAF6]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-[#2C241C]">{title}</div>
          <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#8A7F70]">{preview}</div>
        </div>
        <span className={['rounded-full border px-2 py-0.5 text-[10px]', toolStatusTone(call.status)].join(' ')}>
          {toolStatusLabel(call.status)}
        </span>
      </div>
    </button>
  );
}

function FileDiffDetail({ file }: { file: FileArtifact | null }) {
  if (!file) {
    return (
      <div className="rounded-2xl border border-dashed border-[#E4DACD] px-4 py-8 text-[13px] text-[#978C7E]">
        选择一个改动文件后，这里会显示补丁预览和相关工具。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[12px] text-[#8A7F70]">改动文件</div>
            <div className="mt-1 break-all text-[15px] font-semibold text-[#241F17]">{file.filePath}</div>
          </div>
          <span className="rounded-full border border-[#E4DACD] bg-white px-2.5 py-1 text-[11px] text-[#6C6154]">
            {file.isNewFile ? '新文件' : `+${file.linesAdded} / -${file.linesRemoved}`}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {file.toolNames.map(toolName => (
            <span
              key={`${file.key}-${toolName}`}
              className="rounded-full border border-[#E5D8C9] bg-white px-2.5 py-1 text-[11px] text-[#6C6154]"
            >
              {toolName}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[#ECE2D6] bg-white/80 p-4">
        <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8C8173]">补丁预览</div>
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-[#FBF8F3] p-4 font-mono text-[12px] leading-6 text-[#5B5145]">
          {trimText(file.patchPreview, '暂时没有补丁预览。')}
        </pre>
      </div>
    </div>
  );
}

function ToolRunDetail({ call }: { call: ToolCall | null }) {
  if (!call) {
    return (
      <div className="rounded-2xl border border-dashed border-[#E4DACD] px-4 py-8 text-[13px] text-[#978C7E]">
        选择一次工具调用后，这里会显示输入、结果和关联文件。
      </div>
    );
  }

  const files = Array.isArray(call.diff?.files) ? call.diff?.files || [] : [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[12px] text-[#8A7F70]">工具调用</div>
            <div className="mt-1 text-[15px] font-semibold text-[#241F17]">
              {call.title || call.name || '工具'}
            </div>
          </div>
          <span className={['rounded-full border px-2.5 py-1 text-[11px]', toolStatusTone(call.status)].join(' ')}>
            {toolStatusLabel(call.status)}
          </span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 text-[12px] text-[#7B6F61]">
          <div>
            <div className="text-[#8A7F70]">开始时间</div>
            <div className="mt-1 text-[#241F17]">{formatTimestamp(call.startedAt || null) || '未知'}</div>
          </div>
          <div>
            <div className="text-[#8A7F70]">结束时间</div>
            <div className="mt-1 text-[#241F17]">{formatTimestamp(call.completedAt || null) || '未知'}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#ECE2D6] bg-white/80 p-4">
          <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8C8173]">输入摘要</div>
          <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-[#FBF8F3] p-4 font-mono text-[12px] leading-6 text-[#5B5145]">
            {trimText(call.inputPreview, '这次工具没有可展示的输入摘要。')}
          </pre>
        </div>

        <div className="rounded-2xl border border-[#ECE2D6] bg-white/80 p-4">
          <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8C8173]">结果摘要</div>
          <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-[#FBF8F3] p-4 font-mono text-[12px] leading-6 text-[#5B5145]">
            {trimText(call.resultPreview, '这次工具没有文本结果摘要。')}
          </pre>
        </div>
      </div>

      <div className="rounded-2xl border border-[#ECE2D6] bg-white/80 p-4">
        <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8C8173]">关联文件</div>
        {files.length > 0 ? (
          <div className="space-y-3">
            {files.map((file: DiffFile) => (
              <div key={`${call.id}-${file.filePath}`} className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-[13px] font-medium text-[#2C241C]">{file.filePath}</div>
                  <span className="rounded-full border border-[#E4DACD] bg-white px-2 py-0.5 text-[10px] text-[#6C6154]">
                    {file.isNewFile ? '新文件' : `+${file.linesAdded || 0} / -${file.linesRemoved || 0}`}
                  </span>
                </div>
                <pre className="mt-3 max-h-[200px] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-white p-3 font-mono text-[11px] leading-5 text-[#786C5D]">
                  {trimText(file.patchPreview, '暂时没有补丁预览。')}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#E4DACD] px-4 py-5 text-[13px] text-[#978C7E]">
            这次工具没有留下可展示的文件改动。
          </div>
        )}
      </div>
    </div>
  );
}

export function ToolWorkbenchPanel({ toolCalls }: ToolWorkbenchPanelProps) {
  const [activeTab, setActiveTab] = useState<'tools' | 'files'>('tools');
  const [query, setQuery] = useState('');
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [selectedFileKey, setSelectedFileKey] = useState<string | null>(null);

  const fileArtifacts = useMemo(() => normalizeFileArtifacts(toolCalls), [toolCalls]);
  const failedCount = useMemo(
    () => toolCalls.filter(call => call.status === 'error' || call.status === 'failed').length,
    [toolCalls],
  );

  const filteredTools = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return toolCalls;
    }
    return toolCalls.filter(call =>
      `${call.title || ''} ${call.name || ''} ${call.inputPreview || ''} ${call.resultPreview || ''}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [query, toolCalls]);

  const filteredFiles = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return fileArtifacts;
    }
    return fileArtifacts.filter(file =>
      `${file.filePath} ${file.toolNames.join(' ')} ${file.patchPreview}`.toLowerCase().includes(keyword),
    );
  }, [fileArtifacts, query]);

  useEffect(() => {
    if (activeTab === 'tools') {
      if (!filteredTools.some(call => call.id === selectedToolId)) {
        setSelectedToolId(filteredTools[0]?.id || null);
      }
      return;
    }
    if (!filteredFiles.some(file => file.key === selectedFileKey)) {
      setSelectedFileKey(filteredFiles[0]?.key || null);
    }
  }, [activeTab, filteredFiles, filteredTools, selectedFileKey, selectedToolId]);

  useEffect(() => {
    if (activeTab === 'files' && fileArtifacts.length === 0) {
      setActiveTab('tools');
      return;
    }
    if (activeTab === 'tools' && toolCalls.length === 0 && fileArtifacts.length > 0) {
      setActiveTab('files');
    }
  }, [activeTab, fileArtifacts.length, toolCalls.length]);

  const selectedTool = filteredTools.find(call => call.id === selectedToolId) || null;
  const selectedFile = filteredFiles.find(file => file.key === selectedFileKey) || null;

  return (
    <section className="rounded-[24px] border border-[#E7DFD3] bg-white/70 p-4 shadow-[0_16px_42px_rgba(85,63,36,0.05)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8C8173]">工具工作台</div>
          <div className="mt-1 text-[18px] font-semibold text-[#241F17]">把工具运行和文件改动收成一处查看。</div>
          <div className="mt-1 text-[13px] leading-6 text-[#7B6F61]">
            这里会聚合本会话里所有工具调用、失败项和文件补丁，方便你快速判断这一轮到底改了什么。
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] px-3 py-3">
            <div className="text-[12px] text-[#8A7F70]">工具调用</div>
            <div className="mt-1 text-[18px] font-semibold text-[#241F17]">{toolCalls.length}</div>
          </div>
          <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] px-3 py-3">
            <div className="text-[12px] text-[#8A7F70]">改动文件</div>
            <div className="mt-1 text-[18px] font-semibold text-[#241F17]">{fileArtifacts.length}</div>
          </div>
          <div className="rounded-2xl border border-[#ECE2D6] bg-[#FCFAF6] px-3 py-3">
            <div className="text-[12px] text-[#8A7F70]">失败工具</div>
            <div className="mt-1 text-[18px] font-semibold text-[#241F17]">{failedCount}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex rounded-[16px] bg-[#EDE6DA] p-1">
          <button
            type="button"
            onClick={() => setActiveTab('tools')}
            className={[
              'inline-flex items-center gap-2 rounded-[12px] px-4 py-2 text-[13px] transition-colors',
              activeTab === 'tools'
                ? 'bg-[#FAF7F2] text-[#221C15] shadow-[inset_0_0_0_1px_rgba(84,62,33,0.08)]'
                : 'text-[#867B6D] hover:text-[#221C15]',
            ].join(' ')}
          >
            <Wrench size={14} />
            工具运行
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={[
              'inline-flex items-center gap-2 rounded-[12px] px-4 py-2 text-[13px] transition-colors',
              activeTab === 'files'
                ? 'bg-[#FAF7F2] text-[#221C15] shadow-[inset_0_0_0_1px_rgba(84,62,33,0.08)]'
                : 'text-[#867B6D] hover:text-[#221C15]',
            ].join(' ')}
          >
            <FileCode2 size={14} />
            文件改动
          </button>
        </div>

        <label className="flex items-center gap-2 rounded-2xl border border-[#E5DCCD] bg-white/80 px-3 py-2.5 text-[13px] text-[#7A6F62] lg:min-w-[300px]">
          <Search size={14} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={activeTab === 'tools' ? '搜索工具名或结果摘要' : '搜索文件路径或补丁'}
            className="w-full bg-transparent text-[#2C241C] outline-none placeholder:text-[#A09382]"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-2">
          {activeTab === 'tools' ? (
            filteredTools.length > 0 ? (
              filteredTools.map(call => (
                <ToolRunCard
                  key={call.id}
                  call={call}
                  active={call.id === selectedToolId}
                  onClick={() => setSelectedToolId(call.id)}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-[#E4DACD] px-4 py-8 text-[13px] text-[#978C7E]">
                没有匹配的工具调用。
              </div>
            )
          ) : filteredFiles.length > 0 ? (
            filteredFiles.map(file => (
              <FileDiffCard
                key={file.key}
                file={file}
                active={file.key === selectedFileKey}
                onClick={() => setSelectedFileKey(file.key)}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-[#E4DACD] px-4 py-8 text-[13px] text-[#978C7E]">
              没有匹配的文件改动。
            </div>
          )}
        </div>

        <div>
          {activeTab === 'tools' ? <ToolRunDetail call={selectedTool} /> : <FileDiffDetail file={selectedFile} />}
        </div>
      </div>

      {failedCount > 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#F0DDC6] bg-[#FFF7EE] px-4 py-3 text-[13px] leading-6 text-[#94663C]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>本会话里有 {failedCount} 次工具调用失败，建议优先检查失败工具的输入和返回结果。</div>
        </div>
      ) : (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#D9E5D0] bg-[#EEF4EA] px-4 py-3 text-[13px] leading-6 text-[#55704B]">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <div>当前工具调用都已成功完成，优先关注文件改动页签即可快速审阅本轮修改。</div>
        </div>
      )}
    </section>
  );
}
