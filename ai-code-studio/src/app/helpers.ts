import type {
  ConfigState,
  ConnectionCheck,
  FeedEntry,
  Snapshot,
  TabKey,
  TranscriptEntry,
} from './types';

export async function api<T>(path: string, init?: Omit<RequestInit, 'body'> & { body?: unknown }) {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `请求失败：${response.status}`);
  }
  return payload;
}

export function formatRelativeTime(value?: number | string | null) {
  if (!value) return '';
  const time = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(time)) return '';
  const delta = Date.now() - time;
  if (delta < 60_000) return '刚刚';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  return `${Math.floor(delta / 86_400_000)} 天前`;
}

export function formatTimestamp(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatCurrency(value?: number | null) {
  return value ? `US$${value.toFixed(4)}` : 'US$0.0000';
}

export function trimText(value?: string | null, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function currentSession(snapshot: Snapshot) {
  const selected = snapshot.sessions.selectedSessionId || snapshot.run.sessionId;
  return snapshot.sessions.items.find(item => item.sessionId === selected) || null;
}

export function buildFeedEntries(snapshot: Snapshot) {
  type OrderedFeedEntry = FeedEntry & { __order: number; __source: string };
  const entries: OrderedFeedEntry[] = [];
  let order = 0;

  for (const item of snapshot.timeline) {
    if (['task', 'summary', 'result', 'tool_summary', 'status'].includes(item.kind || '')) {
      entries.push({ ...item, feedType: 'activity', __order: order++, __source: 'timeline' } as OrderedFeedEntry);
    }
  }

  for (const item of snapshot.transcript) {
    const feedType =
      item.entryType === 'tool_use' || item.entryType === 'tool_result'
        ? item.entryType
        : item.role === 'user'
          ? 'user'
          : 'assistant';

    entries.push({
      ...item,
      feedType,
      __order: order++,
      __source: 'transcript',
    } as OrderedFeedEntry);
  }

  entries.sort((left, right) => {
    if (left.__source === right.__source) {
      return left.__order - right.__order;
    }
    const a = Date.parse((left as { timestamp?: string }).timestamp || '') || 0;
    const b = Date.parse((right as { timestamp?: string }).timestamp || '') || 0;
    if (a !== b) return a - b;
    return left.__order - right.__order;
  });

  return entries.map(({ __order: _o, __source: _s, ...entry }) => entry as FeedEntry);
}

export function filterFeedEntries(entries: FeedEntry[], tab: TabKey) {
  switch (tab) {
    case 'Chat':
      return entries.filter(entry =>
        entry.feedType === 'user' ||
        entry.feedType === 'assistant' ||
        entry.feedType === 'tool_use' ||
        entry.feedType === 'tool_result',
      );
    case 'Code':
      return entries.filter(entry => entry.feedType !== 'user' && entry.feedType !== 'assistant');
    default:
      return entries;
  }
}

export function mergeConfig(source: ConfigState) {
  return {
    upstreamBaseUrl: source.upstreamBaseUrl || '',
    upstreamApiKey: source.upstreamApiKey || '',
    upstreamModel: source.upstreamModel || '',
    clawModel: source.clawModel || 'sonnet',
    textMode:
      source.textMode === 'anthropic' || source.textMode === 'gemini'
        ? source.textMode
        : 'openai',
    workspaceDir: source.workspaceDir || '',
    clawProjectDir: source.clawProjectDir || '',
    clawBinaryPath: source.clawBinaryPath || '',
    gatewayHost: source.gatewayHost || '127.0.0.1',
    gatewayPort: source.gatewayPort || 8787,
    permissionMode:
      source.permissionMode === 'read-only' ||
      source.permissionMode === 'danger-full-access'
        ? source.permissionMode
        : 'workspace-write',
    runner:
      source.runner === 'cargo' || source.runner === 'binary' ? source.runner : 'auto',
  } as ConfigState;
}

export function hasUnsavedConfig(snapshot: Snapshot, config: ConfigState) {
  // Ignore upstreamApiKey — it's always empty in snapshot (stored in Electron
  // secure storage, not on disk) but present in local config after hydration.
  const a = { ...mergeConfig(snapshot.config), upstreamApiKey: '' };
  const b = { ...mergeConfig(config), upstreamApiKey: '' };
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function getPreflightError(config: ConfigState) {
  if (!config.upstreamBaseUrl || !config.upstreamModel) {
    return '开始运行前，请先补全上游接口地址和模型名。';
  }
  if (!config.workspaceDir) {
    return '开始运行前，请先选择工作区目录。';
  }
  if (!config.clawProjectDir) {
    return '开始运行前，请先设置 Claw 项目目录。';
  }
  if (config.runner === 'binary' && !config.clawBinaryPath) {
    return '当前选择了二进制运行方式，请先填写 Claw 可执行文件路径。';
  }
  return null;
}

export function checklistTone(ready: boolean, warn = false) {
  if (ready) return 'bg-[#EEF4EA] text-[#55704B] border-[#D9E5D0]';
  if (warn) return 'bg-[#FFF5EA] text-[#94663C] border-[#F0DDC6]';
  return 'bg-[#FFF1ED] text-[#A05545] border-[#EBCFC6]';
}

export function connectionTone(status: ConnectionCheck['status']) {
  switch (status) {
    case 'pass':
      return 'bg-[#EEF4EA] text-[#55704B] border-[#D9E5D0]';
    case 'warn':
      return 'bg-[#FFF5EA] text-[#94663C] border-[#F0DDC6]';
    default:
      return 'bg-[#FFF1ED] text-[#A05545] border-[#EBCFC6]';
  }
}

export function labelForConnectionStatus(status: ConnectionCheck['status']) {
  switch (status) {
    case 'pass':
      return '通过';
    case 'warn':
      return '警告';
    default:
      return '失败';
  }
}

export function describeIssue(message?: string | null) {
  const text = trimText(message);
  if (!text) {
    return {
      title: '运行失败',
      detail: '请查看运行日志了解更多信息。',
      tone: 'error' as const,
    };
  }

  if (/at capacity|provider is busy|different upstream model|busy right now/i.test(text)) {
    return {
      title: '上游模型繁忙',
      detail:
        '本地链路已经接通，但当前模型负载过高。请稍后重试，或切换到其他上游模型。',
      tone: 'warn' as const,
    };
  }

  if (/rate limiting|rate limit|too many requests|quota/i.test(text)) {
    return {
      title: '上游触发限流',
      detail:
        '请稍等片刻后重试。如果持续出现，可以更换密钥或切换到更空闲的模型。',
      tone: 'warn' as const,
    };
  }

  if (/api key was rejected|api key|unauthorized/i.test(text)) {
    return {
      title: 'API Key 无效',
      detail: '请打开配置面板，确认当前 API Key 与所选 provider 匹配。',
      tone: 'error' as const,
    };
  }

  if (/model name was not accepted|unknown model|not accepted/i.test(text)) {
    return {
      title: '模型名称需要检查',
      detail:
        '请确认上游模型和 Claw 模型字段填写的是可用的真实模型名。',
      tone: 'error' as const,
    };
  }

  if (/could not reach the upstream api|network connection|base url/i.test(text)) {
    return {
      title: '无法连接上游服务',
      detail:
        '请检查上游接口地址、网络连接，然后重新执行连接测试。',
      tone: 'error' as const,
    };
  }

  if (/timed out|timeout/i.test(text)) {
    return {
      title: '请求超时',
      detail: '当前 provider 可能响应较慢。请稍后重试，或重新做一次连接测试。',
      tone: 'warn' as const,
    };
  }

  return {
    title: '运行失败',
    detail: text,
    tone: 'error' as const,
  };
}

export function issueToneClass(tone: 'warn' | 'error') {
  return tone === 'warn'
    ? 'border-[#F0DDC6] bg-[#FFF7EE] text-[#94663C]'
    : 'border-[#E8C6BC] bg-[#FFF2EE] text-[#A34D3E]';
}

export function labelForPermissionMode(mode?: string | null) {
  switch (mode) {
    case 'read-only':
      return '只读';
    case 'danger-full-access':
      return '完全访问';
    case 'workspace-write':
      return '工作区可写';
    default:
      return '工作区可写';
  }
}

export function labelForRunner(runner?: string | null) {
  switch (runner) {
    case 'cargo':
      return 'Cargo';
    case 'binary':
      return '二进制';
    default:
      return '自动';
  }
}

export function labelForGatewayStatus(status?: string | null) {
  switch (status) {
    case 'ready':
      return '已就绪';
    case 'starting':
      return '启动中';
    case 'stopped':
      return '已停止';
    case 'error':
      return '异常';
    default:
      return status || '未知';
  }
}

export function labelForRunStatus(status?: string | null) {
  switch (status) {
    case 'running':
      return '运行中';
    case 'idle':
      return '空闲';
    case 'ready':
      return '已就绪';
    case 'error':
      return '异常';
    default:
      return status || '未知';
  }
}

export function labelForSessionRunStatus(status?: string | null) {
  switch (status) {
    case 'running':
      return '运行中';
    case 'failed':
      return '失败';
    case 'stopped':
      return '已停止';
    case 'interrupted':
      return '已中断';
    case 'completed':
      return '已完成';
    default:
      return '空闲';
  }
}

export function sessionRunTone(status?: string | null) {
  switch (status) {
    case 'running':
      return 'bg-[#FFF5EA] text-[#94663C] border-[#F0DDC6]';
    case 'failed':
    case 'interrupted':
      return 'bg-[#FFF1ED] text-[#A05545] border-[#EBCFC6]';
    case 'stopped':
      return 'bg-[#F4F0EA] text-[#6E6255] border-[#E4DACD]';
    case 'completed':
      return 'bg-[#EEF4EA] text-[#55704B] border-[#D9E5D0]';
    default:
      return 'bg-[#F4F0EA] text-[#7C7062] border-[#E4DACD]';
  }
}

export function titleForActivity(entry: FeedEntry) {
  if (entry.feedType === 'activity') {
    return entry.title || entry.kind || '活动';
  }
  if (entry.feedType === 'tool_result' && entry.diff?.stats?.filesChanged) {
    return `已编辑 ${entry.diff.stats.filesChanged} 个文件`;
  }
  if (entry.feedType === 'tool_use') {
    return entry.title || entry.toolName || '工具调用';
  }
  return entry.title || '活动';
}

export function statusTone(status?: string) {
  switch (status) {
    case 'error':
    case 'failed':
      return 'text-[#B64B3E]';
    case 'success':
      return 'text-[#5E7A55]';
    case 'running':
      return 'text-[#957742]';
    default:
      return 'text-[#8A7F70]';
  }
}

export function isAssistantEntry(entry: FeedEntry): entry is Extract<FeedEntry, TranscriptEntry> {
  return entry.feedType === 'assistant';
}
