import { Cpu, Info, Package, ShieldCheck, X } from 'lucide-react';
import type { AppInfo } from '../app/types';

type AboutDialogProps = {
  open: boolean;
  appInfo: AppInfo | null;
  encryptionAvailable: boolean | null;
  onClose: () => void;
};

export function AboutDialog({
  open,
  appInfo,
  encryptionAvailable,
  onClose,
}: AboutDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[rgba(27,22,17,0.34)] p-6 backdrop-blur-[2px]">
      <div className="pointer-events-auto w-full max-w-[760px] overflow-hidden rounded-[30px] border border-[#E1D6C8] bg-[#FCF9F4] shadow-[0_30px_90px_rgba(51,37,18,0.18)]">
        <div className="flex items-start justify-between border-b border-[#E8DED2] px-6 py-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#E5D9C9] bg-white/70 px-3 py-1 text-[12px] text-[#7F7467]">
              <Info size={14} />
              关于应用
            </div>
            <div className="mt-3 text-[24px] font-semibold text-[#241F17]">
              {appInfo?.productName || 'claw-code'}
            </div>
            <div className="mt-1 text-[14px] leading-7 text-[#7C7266]">
              {appInfo?.description || '本地桌面版 claw-code 运行工作台'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-[#E5D8C9] bg-white px-3 py-2 text-[13px] text-[#6A5F53] hover:bg-[#FAF7F2]"
          >
            <span className="inline-flex items-center gap-2">
              <X size={14} />
              关闭
            </span>
          </button>
        </div>

        <div className="grid gap-4 px-6 py-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-[24px] border border-[#E8DED2] bg-[#FAF6EF] p-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[#241F17]">
                <Package size={15} />
                版本信息
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3">
                  <div className="text-[12px] text-[#8A7F70]">应用版本</div>
                  <div className="mt-1 text-[18px] font-semibold text-[#241F17]">
                    v{appInfo?.version || '0.1.0'}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3">
                  <div className="text-[12px] text-[#8A7F70]">平台</div>
                  <div className="mt-1 text-[14px] font-medium text-[#241F17]">
                    {appInfo?.platform || 'desktop'}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-[#E8DED2] bg-[#FAF6EF] p-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[#241F17]">
                <Cpu size={15} />
                运行环境
              </div>
              <div className="mt-3 space-y-3">
                <div className="rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3 text-[13px] text-[#5F564A]">
                  Electron {appInfo?.electronVersion || '-'}
                </div>
                <div className="rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3 text-[13px] text-[#5F564A]">
                  Node.js {appInfo?.nodeVersion || '-'}
                </div>
                <div className="rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3 text-[13px] text-[#5F564A]">
                  Chromium {appInfo?.chromeVersion || '-'}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-[#E8DED2] bg-[#FAF6EF] p-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[#241F17]">
                <ShieldCheck size={15} />
                桌面集成
              </div>
              <div className="mt-3 space-y-3">
                <div className="rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3">
                  <div className="text-[12px] text-[#8A7F70]">安全存储</div>
                  <div className="mt-1 text-[14px] font-medium text-[#241F17]">
                    {encryptionAvailable == null ? '未知' : encryptionAvailable ? '可用' : '不可用'}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3">
                  <div className="text-[12px] text-[#8A7F70]">本地主机地址</div>
                  <div className="mt-1 break-all text-[13px] leading-6 text-[#5F564A]">
                    {appInfo?.launcherUrl || 'http://127.0.0.1:8891'}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#ECE2D6] bg-white px-3 py-3">
                  <div className="text-[12px] text-[#8A7F70]">用户数据目录</div>
                  <div className="mt-1 break-all text-[13px] leading-6 text-[#5F564A]">
                    {appInfo?.userDataPath || '未提供'}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-[#E8DED2] bg-[#FFF8EE] p-4 text-[13px] leading-7 text-[#7A6447]">
              当前版本已经集成桌面壳、本地宿主、设置、诊断、导出、队列与审批流。
              后续发布时，只需要替换新的安装包，不必手动改动运行目录。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
