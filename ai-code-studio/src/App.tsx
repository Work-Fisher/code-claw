import { AboutDialog } from './components/AboutDialog';
import { useEffect, useState } from 'react';
import { ConversationPane } from './components/ConversationPane';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { LogsPanel } from './components/LogsPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { SetupSidebar } from './components/SetupSidebar';
import { SetupWizard } from './components/SetupWizard';
import { MemoryPanel } from './components/MemoryPanel';
import {
  api,
  buildFeedEntries,
  currentSession,
  filterFeedEntries,
  getPreflightError,
  hasUnsavedConfig,
  mergeConfig,
} from './app/helpers';
import type {
  AppInfo,
  ConfigState,
  ConnectionReport,
  DesktopBootstrap,
  DiagnosticsReport,
  FeedEntry,
  SetupChecklistItem,
  Snapshot,
  TabKey,
} from './app/types';
import { emptySnapshot } from './app/types';

export default function App() {
  const onboardingKey = 'claw-code:onboarding-complete-v1';
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [config, setConfig] = useState<ConfigState>(emptySnapshot.config);
  const [prompt, setPrompt] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('Chat');
  const [showLogs, setShowLogs] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);
  const [connectionReport, setConnectionReport] = useState<ConnectionReport | null>(null);
  const [diagnosticsReport, setDiagnosticsReport] = useState<DiagnosticsReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hostMessage, setHostMessage] = useState<string | null>(null);
  const [encryptionAvailable, setEncryptionAvailable] = useState<boolean | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [initialHydrated, setInitialHydrated] = useState(false);
  const [pendingUserMessages, setPendingUserMessages] = useState<FeedEntry[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ sessionId: string; name: string } | null>(null);
  const [skills, setSkills] = useState<Array<{ name: string; description: string }>>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialState() {
      try {
        const next = await api<Snapshot>('/api/state');
        let nextConfig = mergeConfig(next.config);

        if (window.clawDesktop?.getBootstrap) {
          try {
            const desktop = await window.clawDesktop.getBootstrap() as DesktopBootstrap;
            setEncryptionAvailable(Boolean(desktop.encryptionAvailable));
            setAppInfo(desktop.appInfo || null);
            if (desktop.upstreamApiKey) {
              nextConfig = {
                ...nextConfig,
                upstreamApiKey: desktop.upstreamApiKey,
              };
              await api('/api/config', {
                method: 'POST',
                body: nextConfig,
              });
            }
          } catch (error) {
            console.warn('Failed to hydrate desktop bootstrap', error);
          }
        }

        if (!cancelled) {
          setSnapshot(next);
          setConfig(nextConfig);
          setInitialHydrated(true);

          api<{ skills: Array<{ name: string; description: string }> }>('/api/skills')
            .then(r => { if (!cancelled) setSkills(r.skills || []) })
            .catch(() => {});
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
          setInitialHydrated(true);
        }
      }
    }

    void loadInitialState();

    const source = new EventSource('/api/events');
    source.onmessage = event => {
      const payload = JSON.parse(event.data) as { type: string; state?: Snapshot };

      if (payload.type === 'state' && payload.state) {
        setSnapshot(payload.state);
        setPendingUserMessages([]);
        setConfig(current => {
          if (
            document.activeElement instanceof HTMLInputElement ||
            document.activeElement instanceof HTMLTextAreaElement ||
            document.activeElement instanceof HTMLSelectElement
          ) {
            return current;
          }
          const merged = mergeConfig(payload.state.config);
          if (!merged.upstreamApiKey && current.upstreamApiKey) {
            merged.upstreamApiKey = current.upstreamApiKey;
          }
          return merged;
        });
      }
    };
    source.onerror = () => {
      source.close();
      if (!cancelled) {
        setTimeout(() => {
          if (!cancelled) {
            window.location.reload();
          }
        }, 1200);
      }
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  useEffect(() => {
    if (!window.clawDesktop?.onHostStatus) {
      return;
    }
    const unsubscribe = window.clawDesktop.onHostStatus(payload => {
      if (payload?.message) {
        setHostMessage(payload.message);
        setErrorMessage(payload.message);
      }
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (!window.clawDesktop?.onCommand) {
      return;
    }

    const unsubscribe = window.clawDesktop.onCommand(payload => {
      switch (payload?.command) {
        case 'open-settings':
          setShowSettings(true);
          break;
        case 'toggle-diagnostics':
          setShowDiagnostics(current => !current);
          break;
        case 'toggle-logs':
          setShowLogs(current => !current);
          break;
        case 'open-wizard':
          setShowWizard(true);
          break;
        case 'open-about':
          setShowAbout(true);
          break;
        case 'new-session':
          void handleReset();
          break;
        case 'refresh-sessions':
          void handleRefreshSessions();
          break;
        case 'restart-launcher':
          void handleRestartLauncher();
          break;
        default:
          break;
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const selectedSession = currentSession(snapshot);
  const allFeedEntries = buildFeedEntries(snapshot);
  const filteredEntries = filterFeedEntries(allFeedEntries, activeTab);
  const feedEntries = activeTab === 'Chat'
    ? [
        ...filteredEntries,
        ...pendingUserMessages.filter(
          p => !filteredEntries.some(f => f.feedType === 'user' && f.content === p.content),
        ),
      ]
    : filteredEntries;
  const unsavedConfig = hasUnsavedConfig(snapshot, config);
  const running = snapshot.run.status === 'running';

  const setupChecklist: SetupChecklistItem[] = [
    {
      label: '上游接口',
      ready: Boolean(config.upstreamBaseUrl && config.upstreamModel),
      detail:
        config.upstreamModel || '必须填写接口地址和模型名；如果 provider 需要密钥，也请一并填写。',
    },
    {
      label: '工作区',
      ready: Boolean(config.workspaceDir),
      detail: config.workspaceDir || '请选择希望 Claw 操作的项目目录。',
    },
    {
      label: '运行时',
      ready: config.runner === 'binary' ? Boolean(config.clawBinaryPath || config.clawProjectDir) : Boolean(config.clawProjectDir),
      detail:
        config.runner === 'binary'
          ? config.clawBinaryPath || '二进制运行模式需要一个已编译的 claw 可执行文件。'
          : config.clawProjectDir || '请指向本地的 claw-code 仓库目录。',
    },
    {
      label: '配置已保存',
      ready: !unsavedConfig,
      detail: unsavedConfig ? '当前还有未保存的配置改动。' : '当前运行配置已经保存。',
    },
  ];
  const setupReady = setupChecklist.every(item => item.ready);

  async function handleSaveConfig() {
    setErrorMessage(null);
    try {
      if (window.clawDesktop?.setSecret) {
        await window.clawDesktop.setSecret('upstreamApiKey', config.upstreamApiKey || '');
      }
      await api('/api/config', {
        method: 'POST',
        body: config,
      });
      setConnectionReport(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    if (!initialHydrated) {
      return;
    }
    const completed = window.localStorage.getItem(onboardingKey) === 'done';
    if (!completed) {
      setShowWizard(true);
    }
  }, [initialHydrated, onboardingKey]);

  useEffect(() => {
    if (!showDiagnostics) {
      return;
    }
    let cancelled = false;

    async function loadDiagnostics() {
      setIsLoadingDiagnostics(true);
      try {
        const report = await api<DiagnosticsReport>('/api/diagnostics');
        if (!cancelled) {
          setDiagnosticsReport(report);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDiagnostics(false);
        }
      }
    }

    void loadDiagnostics();

    return () => {
      cancelled = true;
    };
  }, [
    showDiagnostics,
    snapshot.run.status,
    snapshot.sessions.selectedSessionId,
    snapshot.toolCalls.length,
    snapshot.logs.length,
  ]);

  async function handleTestConnection() {
    setIsTestingConnection(true);
    setErrorMessage(null);
    try {
      const report = await api<ConnectionReport>('/api/test-connection', {
        method: 'POST',
        body: { config },
      });
      setConnectionReport(report);
      if (!report.ok) {
        setShowSettings(true);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsTestingConnection(false);
    }
  }

  async function handleRefreshDiagnostics() {
    setIsLoadingDiagnostics(true);
    try {
      const report = await api<DiagnosticsReport>('/api/diagnostics');
      setDiagnosticsReport(report);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingDiagnostics(false);
    }
  }

  async function handleRenameSession(sessionId: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      await api('/api/sessions/rename', {
        method: 'POST',
        body: { sessionId, summary: trimmed },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function handleDeleteSession(sessionId: string, currentName: string) {
    setDeleteConfirm({ sessionId, name: currentName });
  }

  async function confirmDeleteSession() {
    if (!deleteConfirm) return;
    try {
      await api('/api/sessions/delete', {
        method: 'POST',
        body: { sessionId: deleteConfirm.sessionId },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
    setDeleteConfirm(null);
  }

  async function handleExportDiagnostics() {
    try {
      const response = await api<{ filename: string; payload: unknown }>('/api/diagnostics/export');
      const content = JSON.stringify(response.payload, null, 2);

      if (window.clawDesktop?.saveTextFile) {
        await window.clawDesktop.saveTextFile({
          defaultPath: response.filename,
          content,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        return;
      }

      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = response.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSend() {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;

    const preflightError = getPreflightError(config);
    if (preflightError) {
      setShowSettings(true);
      setErrorMessage(preflightError);
      return;
    }

    const pendingId = `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const pendingEntry: FeedEntry = {
      id: pendingId,
      feedType: 'user',
      role: 'user',
      entryType: 'user',
      title: 'You',
      content: nextPrompt,
      timestamp: new Date().toISOString(),
      streaming: false,
      isError: false,
    };
    setPendingUserMessages(prev => [...prev, pendingEntry]);

    setIsSubmitting(true);
    setErrorMessage(null);
    setActiveTab('Chat');
    setPrompt('');
    try {
      await api('/api/chat', {
        method: 'POST',
        body: {
          prompt: nextPrompt,
          config,
        },
      });
    } catch (error) {
      setPrompt(current => (current ? current : nextPrompt));
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setPendingUserMessages(prev => prev.filter(m => m.id !== pendingId));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStop() {
    try {
      await api('/api/stop', { method: 'POST' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleApprovePendingRun() {
    try {
      await api('/api/approvals/approve', { method: 'POST' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRejectPendingRun() {
    try {
      await api('/api/approvals/reject', { method: 'POST' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleClearQueue() {
    try {
      await api('/api/queue/clear', { method: 'POST' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleReset() {
    try {
      await api('/api/reset', { method: 'POST' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRefreshSessions() {
    try {
      await api('/api/sessions/refresh', { method: 'POST' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSelectSession(sessionId: string | null) {
    try {
      await api('/api/sessions/select', {
        method: 'POST',
        body: { sessionId },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleShutdownGateway() {
    try {
      await api('/api/shutdown', { method: 'POST' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRestartLauncher() {
    try {
      if (window.clawDesktop?.restartLauncher) {
        await window.clawDesktop.restartLauncher();
        setErrorMessage('本地主机已重启，正在刷新运行状态……');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function handleCompleteWizard() {
    window.localStorage.setItem(onboardingKey, 'done');
    setShowWizard(false);
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F6F1E8] text-[#241F17] antialiased">
      <SetupSidebar
        snapshot={snapshot}
        config={config}
        setupReady={setupReady}
        showSettings={showSettings}
        appInfo={appInfo}
        isTestingConnection={isTestingConnection}
        setupChecklist={setupChecklist}
        onReset={() => void handleReset()}
        onRefreshSessions={() => void handleRefreshSessions()}
        onTestConnection={() => void handleTestConnection()}
        onToggleSettings={() => setShowSettings(current => !current)}
        onOpenWizard={() => setShowWizard(true)}
        onOpenAbout={() => setShowAbout(true)}
        onSelectSession={sessionId => void handleSelectSession(sessionId)}
        onRenameSession={(sessionId, currentName) => void handleRenameSession(sessionId, currentName)}
        onDeleteSession={(sessionId, currentName) => void handleDeleteSession(sessionId, currentName)}
        onOpenMemory={() => setShowMemory(true)}
      />

      <ConversationPane
        snapshot={snapshot}
        config={config}
        selectedSession={selectedSession}
        feedEntries={feedEntries}
        prompt={prompt}
        setPrompt={setPrompt}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setupReady={setupReady}
        running={running}
        isSubmitting={isSubmitting}
        showLogs={showLogs}
        showDiagnostics={showDiagnostics}
        errorMessage={errorMessage}
        logsPanel={showLogs ? <LogsPanel logs={snapshot.logs} onHide={() => setShowLogs(false)} /> : null}
        diagnosticsPanel={
          showDiagnostics ? (
            <DiagnosticsPanel
              report={diagnosticsReport}
              loading={isLoadingDiagnostics}
              hostMessage={hostMessage}
              encryptionAvailable={encryptionAvailable}
              onRefresh={() => void handleRefreshDiagnostics()}
              onExport={() => void handleExportDiagnostics()}
              onClose={() => setShowDiagnostics(false)}
            />
          ) : null
        }
        onDismissError={() => setErrorMessage(null)}
        onRefreshSessions={() => void handleRefreshSessions()}
        onToggleLogs={() => setShowLogs(current => !current)}
        onToggleDiagnostics={() => setShowDiagnostics(current => !current)}
        onOpenWizard={() => setShowWizard(true)}
        onOpenSettings={() => setShowSettings(true)}
        onToggleSettings={() => setShowSettings(current => !current)}
        onReset={() => void handleReset()}
        onSend={() => void handleSend()}
        onStop={() => void handleStop()}
        onApprovePendingRun={() => void handleApprovePendingRun()}
        onRejectPendingRun={() => void handleRejectPendingRun()}
        onClearQueue={() => void handleClearQueue()}
        onRenameSession={handleRenameSession}
        skills={skills}
      />

      <SettingsDialog
        open={showSettings}
        config={config}
        setConfig={setConfig}
        isTestingConnection={isTestingConnection}
        connectionReport={connectionReport}
        setupChecklist={setupChecklist}
        onSaveConfig={() => void handleSaveConfig()}
        onTestConnection={() => void handleTestConnection()}
        onShutdownGateway={() => void handleShutdownGateway()}
        onRestartLauncher={() => void handleRestartLauncher()}
        onClose={() => setShowSettings(false)}
      />

      <SetupWizard
        open={showWizard}
        config={config}
        setConfig={setConfig}
        setupChecklist={setupChecklist}
        connectionReport={connectionReport}
        isTestingConnection={isTestingConnection}
        onSaveConfig={() => void handleSaveConfig()}
        onTestConnection={() => void handleTestConnection()}
        onClose={() => setShowWizard(false)}
        onComplete={handleCompleteWizard}
      />

      <AboutDialog
        open={showAbout}
        appInfo={appInfo}
        encryptionAvailable={encryptionAvailable}
        onClose={() => setShowAbout(false)}
      />

      <MemoryPanel
        open={showMemory}
        workspaceDir={config.workspaceDir}
        onClose={() => setShowMemory(false)}
      />

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
          <div className="w-[340px] rounded-2xl border border-[#E5DCCD] bg-[#FAF7F2] p-6 shadow-xl">
            <h3 className="text-[15px] font-semibold text-[#231D16]">删除会话</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[#6B5E4F]">
              确定要删除会话「{deleteConfirm.name}」吗？此操作不可撤销。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border border-[#D4CAB8] bg-white px-4 py-2 text-[13px] text-[#4B4337] transition-colors hover:bg-[#F1ECE3]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteSession()}
                className="rounded-lg bg-[#C0392B] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#A93226]"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
