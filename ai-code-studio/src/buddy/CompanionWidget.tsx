import { useEffect, useRef, useState } from 'react';
import { hatchCompanion } from './companion';
import { getQuip, type Mood } from './quips';
import { renderSprite } from './sprites';
import { RARITY_COLORS, RARITY_STARS, STAT_NAMES, type Companion } from './types';

const TICK_MS = 500;
const IDLE_SEQUENCE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0];
const SLEEPY_TIMEOUT = 120_000;
const BUBBLE_DURATION = 5_000;
const PET_HEARTS_DURATION = 2_000;
const RUNS_PER_EGG = 3;

const STORAGE_KEY = 'claw-buddy-state';

type BuddyState = {
  collection: Companion[];
  activeIndex: number;
  eggs: number;
  totalRuns: number;
  petCount: number;
};

function loadState(): BuddyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BuddyState;
      if (parsed.collection?.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  const starter = hatchCompanion(`starter-${Date.now()}`);
  const state: BuddyState = { collection: [starter], activeIndex: 0, eggs: 1, totalRuns: 0, petCount: 0 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

function saveState(state: BuddyState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function moodFromRunStatus(status: string | null | undefined, lastActivity: number): Mood {
  if (status === 'running') return 'working';
  if (Date.now() - lastActivity > SLEEPY_TIMEOUT) return 'sleepy';
  return 'idle';
}

type CompanionWidgetProps = {
  runStatus?: string | null;
  lastRunResult?: 'success' | 'error' | null;
};

export function CompanionWidget({ runStatus, lastRunResult }: CompanionWidgetProps) {
  const [state, setState] = useState<BuddyState>(loadState);
  const [tick, setTick] = useState(0);
  const [mood, setMood] = useState<Mood>('idle');
  const [bubble, setBubble] = useState<string | null>(null);
  const [showHearts, setShowHearts] = useState(false);
  const [view, setView] = useState<'sprite' | 'collection' | 'hatch'>('sprite');
  const [hatchPhase, setHatchPhase] = useState<0 | 1 | 2 | 3>(0); // 0=idle, 1=shake, 2=crack, 3=reveal
  const lastActivityRef = useRef(Date.now());
  const prevRunStatusRef = useRef(runStatus);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const companion = state.collection[state.activeIndex] || state.collection[0]!;

  // Track completed runs → earn eggs
  useEffect(() => {
    const prev = prevRunStatusRef.current;
    prevRunStatusRef.current = runStatus;
    if (prev === 'running' && runStatus !== 'running' && lastRunResult !== 'error') {
      setState(s => {
        const nextRuns = s.totalRuns + 1;
        const earnedEgg = nextRuns % RUNS_PER_EGG === 0;
        const next = { ...s, totalRuns: nextRuns, eggs: earnedEgg ? s.eggs + 1 : s.eggs };
        saveState(next);
        if (earnedEgg) {
          showBubbleText(`获得了一个蛋！(${next.eggs} 个待孵化)`);
        }
        return next;
      });
    }
  }, [runStatus, lastRunResult]);

  // Tick animation
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Mood from run status
  useEffect(() => {
    const prev = prevRunStatusRef.current;
    if (runStatus === 'running') {
      lastActivityRef.current = Date.now();
      setMood('working');
      showBubbleQuip('working');
      return;
    }
    if (prev === 'running' && runStatus !== 'running') {
      lastActivityRef.current = Date.now();
      const result = lastRunResult === 'error' ? 'error' : 'success';
      setMood(result);
      showBubbleQuip(result);
      setTimeout(() => setMood('idle'), 8000);
      return;
    }
    const idleCheck = setInterval(() => {
      setMood(moodFromRunStatus(runStatus, lastActivityRef.current));
    }, 10_000);
    return () => clearInterval(idleCheck);
  }, [runStatus, lastRunResult]);

  function showBubbleText(text: string) {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubble(text);
    bubbleTimerRef.current = setTimeout(() => setBubble(null), BUBBLE_DURATION);
  }

  function showBubbleQuip(m: Mood) {
    showBubbleText(getQuip(m));
  }

  function handlePet() {
    lastActivityRef.current = Date.now();
    setShowHearts(true);
    showBubbleQuip('petted');
    setState(s => {
      const next = { ...s, petCount: s.petCount + 1 };
      saveState(next);
      return next;
    });
    setTimeout(() => setShowHearts(false), PET_HEARTS_DURATION);
  }

  function handleHatch() {
    if (state.eggs <= 0 || hatchPhase !== 0) return;
    setHatchPhase(1); // shake
    setTimeout(() => setHatchPhase(2), 1200); // crack
    setTimeout(() => {
      setHatchPhase(3); // reveal
      const newBuddy = hatchCompanion(`egg-${Date.now()}-${Math.random()}`);
      setState(s => {
        const next: BuddyState = {
          ...s,
          collection: [...s.collection, newBuddy],
          activeIndex: s.collection.length,
          eggs: s.eggs - 1,
        };
        saveState(next);
        return next;
      });
      showBubbleText(`${newBuddy.name} 孵化成功！(${newBuddy.rarity})`);
    }, 2400);
    setTimeout(() => {
      setHatchPhase(0);
      setView('sprite');
    }, 4000);
  }

  function handleSelect(index: number) {
    setState(s => {
      const next = { ...s, activeIndex: index };
      saveState(next);
      return next;
    });
    setView('sprite');
  }

  const frameIndex = IDLE_SEQUENCE[tick % IDLE_SEQUENCE.length]!;
  const frame = frameIndex < 0 ? 0 : frameIndex;
  const moodEye = mood === 'sleepy' ? '-' : mood === 'error' ? '×' : undefined;
  const displayBones = moodEye ? { ...companion, eye: moodEye as typeof companion.eye } : companion;
  const spriteLines = renderSprite(displayBones, frame);
  const rarityColor = RARITY_COLORS[companion.rarity];
  const runsToNextEgg = RUNS_PER_EGG - (state.totalRuns % RUNS_PER_EGG);

  // ── Collection view ──
  if (view === 'collection') {
    return (
      <div className="select-none">
        <div className="rounded-2xl border border-[#E5DBCE] bg-[#FAF7F2] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#8C8173]">收藏 ({state.collection.length})</span>
            <button onClick={() => setView('sprite')} className="text-[11px] text-[#A99D8D] hover:text-[#5C5247]">返回</button>
          </div>
          <div className="max-h-[200px] space-y-1 overflow-y-auto">
            {state.collection.map((c, i) => (
              <button
                key={`${c.name}-${c.hatchedAt}`}
                onClick={() => handleSelect(i)}
                className={[
                  'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12px] transition-colors',
                  i === state.activeIndex ? 'bg-[#EDE6DA] text-[#241F17]' : 'text-[#7B6F61] hover:bg-[#F4EEE4]',
                ].join(' ')}
              >
                <span style={{ color: RARITY_COLORS[c.rarity] }}>{RARITY_STARS[c.rarity]}</span>
                <span className="flex-1 truncate font-medium">{c.name}</span>
                <span className="text-[10px] text-[#A99D8D]">{c.species}</span>
              </button>
            ))}
          </div>
          {state.eggs > 0 ? (
            <button
              onClick={() => setView('hatch')}
              className="mt-2 w-full rounded-xl bg-[#2A231C] py-2 text-[12px] text-white hover:bg-[#3C3228]"
            >
              孵化新伙伴 (剩余 {state.eggs} 蛋)
            </button>
          ) : (
            <div className="mt-2 text-center text-[10px] text-[#A99D8D]">
              再完成 {runsToNextEgg} 次任务可获得新蛋
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Hatch view ──
  if (view === 'hatch') {
    const eggFrames = ['🥚', '🥚', '💥', '✨'];
    const eggLabels = ['', '在动了…', '裂开了！', `${companion.name} 来了！`];
    const eggClasses = [
      '',
      'animate-[wiggle_0.3s_ease-in-out_infinite]',
      'animate-ping',
      'animate-bounce',
    ];

    return (
      <div className="select-none">
        <style>{`@keyframes wiggle { 0%,100% { transform: rotate(0deg) } 25% { transform: rotate(-12deg) } 75% { transform: rotate(12deg) } }`}</style>
        <div className="rounded-2xl border border-[#E5DBCE] bg-[#FAF7F2] p-3 text-center">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#8C8173]">孵化</span>
            {hatchPhase === 0 ? (
              <button onClick={() => setView('sprite')} className="text-[10px] text-[#A99D8D] hover:text-[#5C5247]">返回</button>
            ) : null}
          </div>

          {hatchPhase > 0 ? (
            <div className="py-4">
              {hatchPhase === 3 ? (
                <pre
                  className="mx-auto w-fit animate-bounce font-mono text-[10px] leading-[13px]"
                  style={{ color: RARITY_COLORS[companion.rarity] }}
                >
                  {spriteLines.join('\n')}
                </pre>
              ) : (
                <div className={['text-[32px] transition-all', eggClasses[hatchPhase]].join(' ')}>
                  {eggFrames[hatchPhase]}
                </div>
              )}
              <div className="mt-2 text-[12px] text-[#94663C]">{eggLabels[hatchPhase]}</div>
            </div>
          ) : (
            <>
              <div className="py-3">
                <div className="text-[28px]">🥚</div>
                <div className="mt-1 text-[12px] text-[#5C5247]">
                  <span className="font-semibold text-[#C4956A]">{state.eggs}</span> 个蛋
                </div>
                <div className="mt-0.5 text-[9px] text-[#A99D8D]">
                  每 {RUNS_PER_EGG} 次成功运行 +1
                </div>
              </div>
              <button
                onClick={handleHatch}
                disabled={state.eggs <= 0}
                className="w-full rounded-xl bg-[#2A231C] py-1.5 text-[12px] text-white hover:bg-[#3C3228] disabled:opacity-40"
              >
                孵化！
              </button>
              <div className="mt-1 text-[9px] text-[#B5AA9B]">
                ★1% legendary · 4% epic · 10% rare
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Sprite view (default) ──
  return (
    <div className="select-none">
      <div
        className="relative overflow-hidden rounded-2xl border border-[#E5DBCE] bg-[#FAF7F2] px-3 pb-2 pt-2"
        style={{ borderColor: companion.shiny ? '#E8D5A0' : undefined }}
      >
        {bubble ? (
          <div className="mb-2 rounded-xl border border-[#E8DED2] bg-white px-3 py-1.5 text-[11px] leading-5 text-[#5C5247] italic">
            {bubble}
          </div>
        ) : null}

        {showHearts ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center gap-2 animate-bounce text-[14px]">
            <span className="text-red-400">♥</span>
            <span className="text-pink-300">♥</span>
            <span className="text-red-300">♥</span>
          </div>
        ) : null}

        <div className="group cursor-pointer" onClick={handlePet} title="点击摸头">
          <pre
            className="mx-auto w-fit text-center font-mono text-[10px] leading-[13px] transition-transform group-hover:scale-105"
            style={{ color: rarityColor }}
          >
            {spriteLines.join('\n')}
          </pre>
        </div>

        <div className="mt-1 flex items-center justify-center gap-1.5">
          <span className="text-[12px] font-semibold" style={{ color: rarityColor }}>{companion.name}</span>
          <span className="text-[10px]" style={{ color: rarityColor }}>{RARITY_STARS[companion.rarity]}</span>
          {companion.shiny ? <span className="text-[9px] text-[#C4A44A]">✦</span> : null}
        </div>

        <div className="mt-0.5 text-center text-[9px] text-[#A99D8D]">
          {companion.species} · 摸了{state.petCount}次 · 蛋×{state.eggs}
        </div>

        <div className="mt-1.5 flex items-center justify-center gap-1">
          <button
            onClick={() => setView('collection')}
            className="rounded-lg border border-[#E5DBCE] bg-white px-2 py-0.5 text-[10px] text-[#7B6F61] hover:bg-[#F4EEE4]"
          >
            收藏 {state.collection.length}
          </button>
          {state.eggs > 0 ? (
            <button
              onClick={() => setView('hatch')}
              className="rounded-lg border border-[#E8D5A0] bg-[#FFF9EE] px-2 py-0.5 text-[10px] text-[#94663C] hover:bg-[#FFF3DD]"
            >
              🥚 孵化
            </button>
          ) : (
            <span className="text-[9px] text-[#B5AA9B]">
              还差{runsToNextEgg}次任务得蛋
            </span>
          )}
        </div>

        {/* Stats - show on double click area */}
        <details className="mt-1">
          <summary className="cursor-pointer text-center text-[9px] text-[#B5AA9B] hover:text-[#7B6F61]">属性</summary>
          <div className="mt-1 space-y-0.5">
            {STAT_NAMES.map(stat => (
              <div key={stat} className="flex items-center gap-1.5 text-[9px]">
                <span className="w-[58px] text-[#8A7F70]">{stat}</span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#EDE6DA]">
                  <div className="h-full rounded-full" style={{ width: `${companion.stats[stat]}%`, backgroundColor: rarityColor }} />
                </div>
                <span className="w-4 text-right text-[#8A7F70]">{companion.stats[stat]}</span>
              </div>
            ))}
            <div className="mt-0.5 text-[9px] italic text-[#A99D8D] leading-3">{companion.personality}</div>
          </div>
        </details>
      </div>
    </div>
  );
}
