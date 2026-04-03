export type TextMode = 'openai' | 'anthropic' | 'gemini';

export type ProviderPreset = {
  id: string;
  label: string;
  hint: string;
  upstreamBaseUrl: string;
  upstreamModel: string;
  clawModel: string;
  textMode: TextMode;
};

export const providerPresets: ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    hint: '性价比高，中文能力强',
    upstreamBaseUrl: 'https://api.deepseek.com/v1',
    upstreamModel: 'deepseek-chat',
    clawModel: 'deepseek-chat',
    textMode: 'openai',
  },
  {
    id: 'qwen',
    label: '通义千问',
    hint: '阿里云，国内稳定',
    upstreamBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    upstreamModel: 'qwen3.5-plus',
    clawModel: 'qwen3.5-plus',
    textMode: 'openai',
  },
  {
    id: 'glm',
    label: '智谱 AI',
    hint: '清华系，中文理解强',
    upstreamBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    upstreamModel: 'glm-5',
    clawModel: 'glm-5',
    textMode: 'openai',
  },
  {
    id: 'kimi',
    label: 'Kimi',
    hint: '月之暗面，长文本能力强',
    upstreamBaseUrl: 'https://api.moonshot.cn/v1',
    upstreamModel: 'kimi-k2.5',
    clawModel: 'kimi-k2.5',
    textMode: 'openai',
  },
  {
    id: 'claude',
    label: 'Claude',
    hint: 'Anthropic 官方',
    upstreamBaseUrl: 'https://api.anthropic.com/v1',
    upstreamModel: 'claude-sonnet-4-6',
    clawModel: 'claude-sonnet-4-6',
    textMode: 'anthropic',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    hint: 'Google，有免费额度',
    upstreamBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    upstreamModel: 'gemini-2.5-flash',
    clawModel: 'gemini-2.5-flash',
    textMode: 'gemini',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'GPT 系列',
    upstreamBaseUrl: 'https://api.openai.com/v1',
    upstreamModel: 'gpt-4o',
    clawModel: 'gpt-4o',
    textMode: 'openai',
  },
  {
    id: 'custom',
    label: '自定义',
    hint: '聚合平台或自建服务',
    upstreamBaseUrl: '',
    upstreamModel: '',
    clawModel: '',
    textMode: 'openai',
  },
];
