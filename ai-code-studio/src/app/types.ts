export type ConfigState = {
  upstreamBaseUrl: string;
  upstreamApiKey: string;
  upstreamModel: string;
  clawModel: string;
  textMode: 'openai' | 'anthropic' | 'gemini';
  workspaceDir: string;
  clawProjectDir: string;
  clawBinaryPath: string;
  gatewayHost: string;
  gatewayPort: number;
  permissionMode: 'read-only' | 'workspace-write' | 'danger-full-access';
  runner: 'auto' | 'cargo' | 'binary';
};

export type SessionItem = {
  sessionId: string;
  summary?: string;
  lastModified?: number;
  cwd?: string;
  gitBranch?: string;
  runStatus?: 'idle' | 'running' | 'completed' | 'failed' | 'stopped' | 'interrupted' | null;
  runMessage?: string | null;
};

export type DiffFile = {
  filePath: string;
  isNewFile?: boolean;
  linesAdded?: number;
  linesRemoved?: number;
  patchPreview?: string;
};

export type DiffBundle = {
  files?: DiffFile[];
  stats?: {
    filesChanged?: number;
  };
};

export type TranscriptEntry = {
  id: string;
  role?: 'assistant' | 'user' | 'tool';
  entryType?: string;
  title?: string;
  content?: string;
  timestamp?: string;
  streaming?: boolean;
  isError?: boolean;
  diff?: DiffBundle | null;
  meta?: string | null;
  toolUseId?: string;
  toolName?: string;
  status?: string;
};

export type ToolCall = {
  id: string;
  title?: string;
  name?: string;
  status?: string;
  inputPreview?: string;
  resultPreview?: string;
  startedAt?: string;
  completedAt?: string | null;
  diff?: DiffBundle | null;
};

export type QueuedRunSummary = {
  id: string;
  sessionId: string | null;
  promptPreview: string;
  createdAt: string;
  permissionMode: ConfigState['permissionMode'];
};

export type PendingApproval = {
  id: string;
  sessionId: string | null;
  promptPreview: string;
  createdAt: string;
  riskLevel: 'medium' | 'high';
  title: string;
  reasons: string[];
  permissionMode: ConfigState['permissionMode'];
};

export type TimelineEntry = {
  id: string;
  kind?: string;
  status?: string;
  title?: string;
  content?: string;
  timestamp?: string;
};

export type RunState = {
  status: string;
  sessionId: string | null;
  resumeSessionId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  outputFormat: string;
  model: string | null;
  cwd: string | null;
  permissionMode: string | null;
  contextMode?: 'fresh' | 'carry-over';
  contextMessageCount?: number;
  carriedMessageCount?: number;
  availableTools: string[];
  queue: QueuedRunSummary[];
  pendingApproval: PendingApproval | null;
  lastResult: {
    totalCostUsd?: number;
    numTurns?: number;
  } | null;
};

export type LogEntry = {
  id: string;
  source: string;
  level: string;
  text: string;
  timestamp: string;
};

export type Snapshot = {
  status: string;
  gateway: {
    status: string;
    url: string | null;
  };
  run: RunState;
  config: ConfigState;
  sessions: {
    status: string;
    items: SessionItem[];
    selectedSessionId: string | null;
    error?: string | null;
  };
  transcript: TranscriptEntry[];
  toolCalls: ToolCall[];
  timeline: TimelineEntry[];
  logs: LogEntry[];
};

export type FeedEntry =
  | ({ feedType: 'user' | 'assistant' | 'tool_use' | 'tool_result' } & TranscriptEntry)
  | ({ feedType: 'activity' } & TimelineEntry);

export type ConnectionCheck = {
  id: string;
  title: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
};

export type ConnectionReport = {
  ok: boolean;
  checks: ConnectionCheck[];
  gatewayUrl?: string | null;
  sampleText?: string | null;
  testedAt?: string | null;
};

export type DiagnosticsReport = {
  generatedAt: string;
  gateway: {
    status: string;
    url: string | null;
  };
  run: {
    status: string;
    sessionId: string | null;
    resumeSessionId: string | null;
    model: string | null;
    cwd: string | null;
    permissionMode: string | null;
    contextMessageCount?: number;
    carriedMessageCount?: number;
    startedAt: string | null;
    endedAt: string | null;
    queueCount: number;
    pendingApproval: PendingApproval | null;
  };
  config: {
    runner: ConfigState['runner'];
    workspaceDir: string;
    clawProjectDir: string;
    clawBinaryPath: string;
    gatewayHost: string;
    gatewayPort: number;
  };
  paths: {
    workspaceDir: string;
    workspaceType: string;
    clawProjectDir: string;
    clawProjectType: string;
    clawBinaryPath: string;
    clawBinaryType: string;
  };
  sessions: {
    total: number;
    selectedSessionId: string | null;
    running: number;
    failed: number;
    interrupted: number;
    completed: number;
    stopped: number;
  };
  tools: {
    total: number;
    failed: number;
    changedFiles: number;
    lastToolName: string | null;
  };
  selectedSession: {
    sessionId: string | null;
    summary: string | null;
    runStatus: string | null;
    runMessage: string | null;
    lastModified: number | null;
  };
  logs: {
    total: number;
    recent: LogEntry[];
  };
};

/* ── Bootstrap (soul) types ──────────────────────────── */
export type BootstrapFile = {
  name: string;
  content: string;
  charCount: number;
};

/* ── Memory types ────────────────────────────────────── */
export type MemoryManifestItem = {
  name: string;
  description: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  filename: string;
  charCount: number;
  lastModified?: string;
};

export type MemoryFile = {
  filename: string;
  content: string;
  frontmatter: {
    name: string;
    description: string;
    type: string;
  };
};

export type SetupChecklistItem = {
  label: string;
  ready: boolean;
  detail: string;
};

export type TabKey = 'Chat' | 'Cowork' | 'Code';

export type AppInfo = {
  productName: string;
  version: string;
  description: string;
  electronVersion: string;
  nodeVersion: string;
  chromeVersion: string;
  platform: string;
  launcherUrl: string;
  userDataPath?: string;
};

export type DesktopBootstrap = {
  isDesktop: boolean;
  upstreamApiKey: string;
  encryptionAvailable: boolean;
  appInfo?: AppInfo | null;
};

export const emptySnapshot: Snapshot = {
  status: 'idle',
  gateway: { status: 'stopped', url: null },
  run: {
    status: 'idle',
    sessionId: null,
    resumeSessionId: null,
    startedAt: null,
    endedAt: null,
    outputFormat: 'json',
    model: null,
    cwd: null,
    permissionMode: null,
    contextMode: 'fresh',
    contextMessageCount: 0,
    carriedMessageCount: 0,
    availableTools: [],
    queue: [],
    pendingApproval: null,
    lastResult: null,
  },
  config: {
    upstreamBaseUrl: '',
    upstreamApiKey: '',
    upstreamModel: '',
    clawModel: 'sonnet',
    textMode: 'openai',
    workspaceDir: '',
    clawProjectDir: '',
    clawBinaryPath: '',
    gatewayHost: '127.0.0.1',
    gatewayPort: 8787,
    permissionMode: 'workspace-write',
    runner: 'auto',
  },
  sessions: {
    status: 'idle',
    items: [],
    selectedSessionId: null,
    error: null,
  },
  transcript: [],
  toolCalls: [],
  timeline: [],
  logs: [],
};
