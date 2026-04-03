import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Save, Trash2, Plus, FileText } from 'lucide-react';
import { api } from '../app/helpers';
import type { BootstrapFile } from '../app/types';

const PER_FILE_LIMIT = 20_000;

type SoulEditorProps = {
  workspaceDir: string;
};

export function SoulEditor({ workspaceDir }: SoulEditorProps) {
  const [files, setFiles] = useState<BootstrapFile[]>([]);
  const [totalChars, setTotalChars] = useState(0);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);

  const loadFiles = useCallback(async () => {
    try {
      const data = await api<{ files: BootstrapFile[]; totalChars: number }>('/api/bootstrap');
      setFiles(data.files);
      setTotalChars(data.totalChars);
      if (!activeFile && data.files.length > 0) {
        setActiveFile(data.files[0].name);
        setEditContent(data.files[0].content);
      }
    } catch { /* ignore */ }
  }, [activeFile]);

  useEffect(() => {
    if (workspaceDir) loadFiles();
  }, [workspaceDir, loadFiles]);

  function selectFile(name: string) {
    const file = files.find(f => f.name === name);
    if (file) {
      setActiveFile(name);
      setEditContent(file.content);
    }
  }

  async function handleSave() {
    if (!activeFile) return;
    setSaving(true);
    try {
      await api(`/api/bootstrap/${encodeURIComponent(activeFile)}`, {
        method: 'POST',
        body: JSON.stringify({ content: editContent }),
      });
      await loadFiles();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(name: string) {
    if (name === 'SOUL.md') return;
    try {
      await api(`/api/bootstrap/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (activeFile === name) {
        setActiveFile(null);
        setEditContent('');
      }
      await loadFiles();
    } catch { /* ignore */ }
  }

  async function handleCreateFile() {
    let name = newFileName.trim();
    if (!name) return;
    if (!name.endsWith('.md')) name += '.md';
    try {
      await api(`/api/bootstrap/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: JSON.stringify({ content: `# ${name.replace('.md', '')}\n\n` }),
      });
      setNewFileName('');
      setShowNewFile(false);
      await loadFiles();
      setActiveFile(name);
    } catch { /* ignore */ }
  }

  const currentFile = files.find(f => f.name === activeFile);
  const isDirty = currentFile ? editContent !== currentFile.content : false;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-[#7C7266]">
          Bootstrap 文件链 &mdash; 注入到每次对话的系统上下文中
        </div>
        <div className="flex items-center gap-3 text-[12px] text-[#9B8E7E]">
          <span>总计 {totalChars.toLocaleString()} 字符 / 80,000 上限</span>
          <button type="button" onClick={loadFiles} className="rounded p-1 hover:bg-[#EDE6DA]">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* File tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {files.map(file => (
          <button
            key={file.name}
            type="button"
            onClick={() => selectFile(file.name)}
            className={[
              'group flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] transition-colors',
              activeFile === file.name
                ? 'border-[#D8CAB8] bg-[#F4EEE4] text-[#241F17]'
                : 'border-[#E8DED2] bg-white text-[#7B6F61] hover:bg-[#FAF6EF]',
            ].join(' ')}
          >
            <FileText size={12} />
            {file.name}
            <span className="ml-1 text-[10px] opacity-50">{file.charCount.toLocaleString()}</span>
            {file.name !== 'SOUL.md' && file.name !== 'IDENTITY.md' && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); handleDelete(file.name); }}
                className="ml-1 hidden rounded p-0.5 text-[#B99E83] hover:bg-[#EDE6DA] hover:text-red-500 group-hover:inline-flex"
              >
                <Trash2 size={10} />
              </button>
            )}
          </button>
        ))}

        {showNewFile ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newFileName}
              onChange={e => setNewFileName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFile()}
              placeholder="filename.md"
              className="w-[120px] rounded-lg border border-[#E8DED2] bg-white px-2 py-1 text-[12px] outline-none focus:border-[#D0C3B0]"
              autoFocus
            />
            <button type="button" onClick={handleCreateFile} className="rounded p-1 text-[#7B6F61] hover:bg-[#EDE6DA]">
              <Save size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNewFile(true)}
            className="flex items-center gap-1 rounded-lg border border-dashed border-[#D8CAB8] px-2.5 py-1.5 text-[12px] text-[#9B8E7E] hover:bg-[#FAF6EF]"
          >
            <Plus size={12} />
            新建
          </button>
        )}
      </div>

      {/* Editor */}
      {activeFile ? (
        <div className="flex flex-1 flex-col gap-2">
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            className="flex-1 resize-none rounded-2xl border border-[#E8DED2] bg-white p-4 font-mono text-[13px] leading-6 text-[#2B241C] outline-none focus:border-[#D0C3B0]"
            spellCheck={false}
          />
          <div className="flex items-center justify-between">
            <span className={[
              'text-[12px]',
              editContent.length > PER_FILE_LIMIT ? 'text-red-500' : 'text-[#9B8E7E]',
            ].join(' ')}>
              {editContent.length.toLocaleString()} / {PER_FILE_LIMIT.toLocaleString()} 字符
              {isDirty && <span className="ml-2 text-amber-600">未保存</span>}
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="flex items-center gap-1.5 rounded-xl border border-[#D8CAB8] bg-[#F4EEE4] px-4 py-2 text-[13px] font-medium text-[#241F17] transition-colors hover:bg-[#EDE6DA] disabled:opacity-40"
            >
              <Save size={13} />
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-[14px] text-[#9B8E7E]">
          选择一个文件开始编辑
        </div>
      )}
    </div>
  );
}
