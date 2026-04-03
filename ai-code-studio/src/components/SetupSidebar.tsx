import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Brain,
  Plus,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import {
  labelForRunStatus,
  labelForSessionRunStatus,
  sessionRunTone,
} from '../app/helpers';
import { providerPresets } from '../app/providerPresets';
import type { AppInfo, ConfigState, SessionItem, SetupChecklistItem, Snapshot } from '../app/types';

function SidebarAction({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors',
        active ? 'bg-[#EFE8DD] text-[#241F17]' : 'text-[#2E281F] hover:bg-[#F1ECE3]',
        disabled ? 'cursor-not-allowed opacity-55 hover:bg-transparent' : '',
      ].join(' ')}
    >
      <span className="text-[#8C8173]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function SessionRow({
  session,
  active,
  disabled,
  onClick,
  onDelete,
}: {
  session: SessionItem;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const showBadge = session.runStatus && session.runStatus !== 'idle';

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={[
          'flex w-full items-start gap-3 rounded-xl px-3 py-2 pr-8 text-left text-[13px] transition-all',
          active ? 'bg-[#EFE8DD] text-[#241F17]' : 'text-[#4B4337] hover:bg-[#F1ECE3]',
          disabled ? 'cursor-not-allowed opacity-70' : '',
        ].join(' ')}
      >
        <span
          className={[
            'mt-1 h-2.5 w-2.5 rounded-full border border-[#B4A796] transition-colors',
            active ? 'bg-[#B4A796]' : 'bg-transparent',
          ].join(' ')}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{session.summary || 'claw-code 会话'}</span>
          {showBadge ? (
            <span
              className={[
                'mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px]',
                sessionRunTone(session.runStatus),
              ].join(' ')}
            >
              {labelForSessionRunStatus(session.runStatus)}
            </span>
          ) : null}
        </span>
      </button>
      {!disabled && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden items-center justify-center rounded-md p-1 text-[#A09382] transition-colors hover:bg-[#E5DCCD] hover:text-[#6B5E4F] group-hover:flex"
          title="删除会话"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

type SetupSidebarProps = {
  snapshot: Snapshot;
  config: ConfigState;
  setupReady: boolean;
  showSettings: boolean;
  appInfo: AppInfo | null;
  isTestingConnection: boolean;
  setupChecklist: SetupChecklistItem[];
  onReset: () => void;
  onRefreshSessions: () => void;
  onTestConnection: () => void;
  onToggleSettings: () => void;
  onOpenWizard: () => void;
  onOpenAbout: () => void;
  onSelectSession: (sessionId: string | null) => void;
  onRenameSession: (sessionId: string, currentName: string) => void;
  onDeleteSession: (sessionId: string, currentName: string) => void;
  onOpenMemory?: () => void;
};

export function SetupSidebar({
  snapshot,
  config,
  setupReady,
  showSettings,
  appInfo,
  isTestingConnection,
  setupChecklist,
  onReset,
  onRefreshSessions,
  onTestConnection,
  onToggleSettings,
  onOpenWizard,
  onOpenAbout,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onOpenMemory,
}: SetupSidebarProps) {
  const [search, setSearch] = useState('');
  const running = snapshot.run.status === 'running';
  const hasQueuedOrApproval =
    Boolean(snapshot.run.pendingApproval) || (snapshot.run.queue?.length || 0) > 0;
  const busy = running || hasQueuedOrApproval;
  const selectedSession =
    snapshot.sessions.items.find(item => item.sessionId === snapshot.sessions.selectedSessionId) || null;

  const currentPreset =
    providerPresets.find(
      preset =>
        preset.upstreamBaseUrl === config.upstreamBaseUrl &&
        preset.upstreamModel === config.upstreamModel,
    ) || null;

  const filteredSessions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return snapshot.sessions.items;
    }
    return snapshot.sessions.items.filter(session =>
      `${session.summary || ''} ${session.sessionId}`.toLowerCase().includes(keyword),
    );
  }, [search, snapshot.sessions.items]);

  return (
    <aside className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-[#E8E0D4] bg-[#F7F4EC]">
      <div className="h-[36px] shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      <div className="px-3 pb-2">
        <SidebarAction
          icon={<Plus size={16} />}
          label="New session"
          disabled={busy}
          onClick={busy ? undefined : onReset}
        />
        <SidebarAction
          icon={<Brain size={16} />}
          label="Memory"
          onClick={onOpenMemory}
        />
        <SidebarAction
          icon={<Settings2 size={16} />}
          label="Settings"
          active={showSettings}
          onClick={onToggleSettings}
        />
      </div>

      <div className="border-t border-[#E8E0D4]" />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-3">
        <div className="mb-2 rounded-lg border border-[#E5DCCD] bg-white/70 px-2.5 py-1.5">
          <div className="flex items-center gap-2 text-[#8D8173]">
            <Search size={13} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-[12px] text-[#2B241C] outline-none placeholder:text-[#A09382]"
            />
          </div>
        </div>

        <div className="space-y-0.5">
          {filteredSessions.length > 0 ? (
            filteredSessions.map(session => (
              <SessionRow
                key={session.sessionId}
                session={session}
                active={session.sessionId === snapshot.sessions.selectedSessionId}
                disabled={busy}
                onClick={() => onSelectSession(session.sessionId)}
                onDelete={() => onDeleteSession(session.sessionId, session.summary || 'claw-code 会话')}
              />
            ))
          ) : (
            <div className="py-4 text-center text-[12px] text-[#978C7E]">
              {snapshot.sessions.items.length > 0 ? '没有匹配的会话' : '暂无会话'}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[#E8E0D4] px-3 py-2 text-[11px] text-[#8A7F70]">
        <div className="flex items-center justify-between">
          <span className="truncate">{currentPreset?.label || config.upstreamModel || 'No model'}</span>
          <span>{labelForRunStatus(snapshot.run.status)}</span>
        </div>
      </div>
    </aside>
  );
}
