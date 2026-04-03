import { useEffect, useState, useCallback } from 'react';
import { Brain, RefreshCw, Search, FileText, Trash2, Plus, Save, X, Sparkles } from 'lucide-react';
import { api } from '../app/helpers';
import type { MemoryManifestItem, MemoryFile } from '../app/types';

type MemoryPanelProps = {
  open: boolean;
  workspaceDir: string;
  onClose: () => void;
};

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  user: { label: '用户', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  feedback: { label: '反馈', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  project: { label: '项目', color: 'bg-green-50 text-green-700 border-green-200' },
  reference: { label: '引用', color: 'bg-purple-50 text-purple-700 border-purple-200' },
};

export function MemoryPanel({ open, workspaceDir, onClose }: MemoryPanelProps) {
  const [index, setIndex] = useState('');
  const [manifest, setManifest] = useState<MemoryManifestItem[]>([]);
  const [logs, setLogs] = useState('');
  const [activeView, setActiveView] = useState<'overview' | 'file' | 'search'>('overview');
  const [activeFile, setActiveFile] = useState<MemoryFile | null>(null);
  const [editContent, setEditContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryFile[]>([]);
  const [searching, setSearching] = useState(false);
  const [dreaming, setDreaming] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      const data = await api<{ index: string; manifest: MemoryManifestItem[]; logs: string }>('/api/memory');
      setIndex(data.index);
      setManifest(data.manifest);
      setLogs(data.logs);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open && workspaceDir) loadOverview();
  }, [open, workspaceDir, loadOverview]);

  async function openFile(filename: string) {
    try {
      const file = await api<MemoryFile>(`/api/memory/file/${encodeURIComponent(filename)}`);
      setActiveFile(file);
      setEditContent(file.content);
      setActiveView('file');
    } catch { /* ignore */ }
  }

  async function handleSaveFile() {
    if (!activeFile) return;
    setSaving(true);
    try {
      await api(`/api/memory/file/${encodeURIComponent(activeFile.filename)}`, {
        method: 'POST',
        body: JSON.stringify({ content: editContent, frontmatter: activeFile.frontmatter }),
      });
      await loadOverview();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDeleteFile(filename: string) {
    try {
      await api(`/api/memory/file/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      if (activeFile?.filename === filename) {
        setActiveFile(null);
        setActiveView('overview');
      }
      await loadOverview();
    } catch { /* ignore */ }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await api<{ results: MemoryFile[] }>('/api/memory/search', {
        method: 'POST',
        body: JSON.stringify({ query: searchQuery }),
      });
      setSearchResults(data.results);
      setActiveView('search');
    } catch { /* ignore */ }
    setSearching(false);
  }

  const [dreamResult, setDreamResult] = useState<string | null>(null);

  async function handleDream() {
    setDreaming(true);
    setDreamResult(null);
    try {
      const result = await api<{ ok: boolean; summary?: string; error?: string }>('/api/memory/dream', { method: 'POST' });
      if (result.ok) {
        setDreamResult(result.summary || '整合完成');
        await loadOverview();
      } else {
        setDreamResult(`失败: ${result.error || '未知错误'}`);
      }
    } catch (err) {
      setDreamResult(`请求失败: ${String(err)}`);
    }
    setDreaming(false);
  }

  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[rgba(27,22,17,0.30)] p-6 backdrop-blur-[2px]">
      <div className="pointer-events-auto flex max-h-[85vh] w-full max-w-[900px] flex-col overflow-hidden rounded-[30px] border border-[#E1D6C8] bg-[#FCF9F4] shadow-[0_30px_90px_rgba(51,37,18,0.18)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E8DED2] px-6 py-4">
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-[#7C7266]" />
            <span className="text-[16px] font-semibold text-[#241F17]">记忆系统</span>
            <span className="ml-2 text-[12px] text-[#9B8E7E]">{manifest.length} 个记忆文件</span>
          </div>
          <div className="flex items-center gap-2">
            {dreamResult && (
              <span className={`text-[11px] ${dreamResult.startsWith('失败') || dreamResult.startsWith('请求') ? 'text-red-500' : 'text-green-600'}`}>
                {dreamResult}
              </span>
            )}
            <button onClick={handleDream} disabled={dreaming} className="flex items-center gap-1.5 rounded-xl border border-[#D8CAB8] bg-[#F4EEE4] px-3 py-1.5 text-[12px] text-[#3A3128] hover:bg-[#EDE6DA] disabled:opacity-50">
              <Sparkles size={12} />
              {dreaming ? '整合中...' : '记忆整合'}
            </button>
            <button onClick={loadOverview} className="rounded-lg p-1.5 text-[#7C7266] hover:bg-[#EDE6DA]">
              <RefreshCw size={14} />
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-[#7C7266] hover:bg-[#EDE6DA]">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-2 border-b border-[#E8DED2] px-6 py-3">
          <Search size={14} className="text-[#9B8E7E]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="搜索记忆（LLM 语义检索）..."
            className="flex-1 bg-transparent text-[13px] text-[#2B241C] outline-none placeholder:text-[#B5A99A]"
          />
          <button onClick={handleSearch} disabled={searching} className="rounded-lg border border-[#D8CAB8] px-3 py-1 text-[12px] text-[#7B6F61] hover:bg-[#EDE6DA] disabled:opacity-50">
            {searching ? '检索中...' : '搜索'}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeView === 'overview' && (
            <div className="space-y-4">
              {/* Memory files */}
              <div>
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#8C8173]">记忆文件</div>
                {manifest.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#D8CAB8] p-4 text-center text-[13px] text-[#9B8E7E]">
                    暂无记忆。对话结束后会自动记录，也可手动触发"记忆整合"。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {manifest.map(m => {
                      const typeInfo = TYPE_LABELS[m.type] || TYPE_LABELS.project;
                      return (
                        <div key={m.filename} className="group flex items-center justify-between rounded-2xl border border-[#EFE6DA] bg-white px-4 py-3 transition-colors hover:bg-[#FAF6EF]">
                          <button type="button" onClick={() => openFile(m.filename)} className="flex flex-1 items-center gap-3 text-left">
                            <FileText size={14} className="shrink-0 text-[#9B8E7E]" />
                            <div>
                              <div className="text-[13px] font-medium text-[#2B241C]">{m.name}</div>
                              <div className="text-[11px] text-[#9B8E7E]">{m.description}</div>
                            </div>
                          </button>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${typeInfo.color}`}>{typeInfo.label}</span>
                            <span className="text-[10px] text-[#B5A99A]">{m.charCount} 字</span>
                            <button
                              onClick={() => handleDeleteFile(m.filename)}
                              className="hidden rounded p-1 text-[#B99E83] hover:text-red-500 group-hover:block"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent logs */}
              {logs && (
                <div>
                  <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#8C8173]">最近日志</div>
                  <pre className="max-h-[200px] overflow-y-auto rounded-2xl border border-[#EFE6DA] bg-white p-4 font-mono text-[11px] leading-5 text-[#5A5046]">
                    {logs}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeView === 'file' && activeFile && (
            <div className="flex h-full flex-col gap-3">
              <div className="flex items-center justify-between">
                <button onClick={() => setActiveView('overview')} className="text-[12px] text-[#7B6F61] hover:underline">
                  &larr; 返回
                </button>
                <span className="text-[13px] font-medium text-[#2B241C]">{activeFile.frontmatter.name || activeFile.filename}</span>
              </div>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="min-h-[300px] flex-1 resize-none rounded-2xl border border-[#E8DED2] bg-white p-4 font-mono text-[12px] leading-5 text-[#2B241C] outline-none focus:border-[#D0C3B0]"
                spellCheck={false}
              />
              <div className="flex justify-end">
                <button onClick={handleSaveFile} disabled={saving} className="flex items-center gap-1.5 rounded-xl border border-[#D8CAB8] bg-[#F4EEE4] px-4 py-2 text-[13px] font-medium text-[#241F17] hover:bg-[#EDE6DA] disabled:opacity-40">
                  <Save size={13} />
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          )}

          {activeView === 'search' && (
            <div className="space-y-3">
              <button onClick={() => setActiveView('overview')} className="text-[12px] text-[#7B6F61] hover:underline">
                &larr; 返回
              </button>
              {searchResults.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#D8CAB8] p-4 text-center text-[13px] text-[#9B8E7E]">
                  未找到相关记忆。
                </div>
              ) : (
                searchResults.map(file => (
                  <div key={file.filename} className="rounded-2xl border border-[#EFE6DA] bg-white p-4">
                    <div className="mb-2 text-[13px] font-medium text-[#2B241C]">{file.frontmatter.name || file.filename}</div>
                    <pre className="max-h-[150px] overflow-y-auto font-mono text-[11px] leading-5 text-[#5A5046]">
                      {file.content}
                    </pre>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
