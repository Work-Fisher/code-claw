export type Mood = 'idle' | 'working' | 'success' | 'error' | 'sleepy' | 'petted';

const QUIPS: Record<Mood, string[]> = {
  idle: [
    '今天写什么呢？',
    '（翻看你的代码）',
    '这个变量名不错嘛',
    '…',
    '嗯哼~',
    '要不要来个重构？',
    '（偷看隔壁的 PR）',
    '我觉得可以加个注释',
  ],
  working: [
    '正在干活，别催！',
    '让我看看…',
    '嗯…这个有点意思',
    '（快速翻阅文件中）',
    '交给我！',
    '分析中…别眨眼',
    '（敲键盘的声音）',
  ],
  success: [
    '搞定啦！🎉',
    '完美！',
    '这不就好了嘛',
    '又是优雅的一天',
    '（得意地摇尾巴）',
    'Ship it! 🚀',
    '一次过！太厉害了吧',
  ],
  error: [
    '别慌，我们再看看',
    '嗯…有个小问题',
    '（紧张地搓手）',
    '这不是 bug，这是 feature…吧？',
    '换个思路试试？',
    '上游的锅！（大概）',
    '深呼吸…',
  ],
  sleepy: [
    'zzZ…',
    '（打了个哈欠）',
    '…zzz…还在吗…',
    '（趴在键盘上）',
    '五分钟…再五分钟…',
  ],
  petted: [
    '嘿嘿~',
    '（开心地蹭蹭）',
    '再摸摸！',
    '喵~…不对，我不是猫',
    '♡',
    '你手好温暖',
    '（翻肚皮）',
    '（幸福地眯眼）',
  ],
};

export function getQuip(mood: Mood): string {
  const pool = QUIPS[mood];
  return pool[Math.floor(Math.random() * pool.length)]!;
}
