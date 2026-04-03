import { X } from 'lucide-react';
import { formatTimestamp } from '../app/helpers';
import type { LogEntry } from '../app/types';

type LogsPanelProps = {
  logs: LogEntry[];
  onHide: () => void;
};

export function LogsPanel({ logs, onHide }: LogsPanelProps) {
  return (
    <div className="mx-auto mb-3 w-full max-w-[980px] rounded-[18px] border border-[#E6DDCF] bg-white shadow-[0_18px_44px_rgba(88,66,39,0.06)]">
      <div className="flex items-center justify-between border-b border-[#F0E8DE] px-4 py-3 text-[12px] text-[#7F7467]">
        <span className="font-medium text-[#2C251D]">运行日志</span>
        <button
          type="button"
          onClick={onHide}
          className="inline-flex items-center gap-1 rounded-xl border border-[#E7DFD3] bg-[#FAF7F2] px-2.5 py-1 text-[12px] text-[#6D6256] hover:bg-white"
        >
          <X size={12} />
          收起
        </button>
      </div>
      <div className="max-h-[240px] overflow-y-auto px-4 py-3">
        {logs.length > 0 ? (
          <div className="space-y-2">
            {logs.slice(-120).map(log => (
              <div
                key={log.id}
                className="rounded-2xl border border-[#EFE6DA] bg-[#FCFAF6] px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3 text-[11px] text-[#8D8173]">
                  <span className="font-medium text-[#5C5247]">{log.source}</span>
                  <span>{formatTimestamp(log.timestamp)}</span>
                </div>
                <div className="mt-1 whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-[#5C5247]">
                  {log.text}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#E4DACD] px-4 py-5 text-[13px] text-[#978C7E]">
            执行连接测试或开始对话后，日志会显示在这里。
          </div>
        )}
      </div>
    </div>
  );
}
