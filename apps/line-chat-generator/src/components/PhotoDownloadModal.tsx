import React, { useState } from 'react';
import {
  X,
  Camera,
  Crown,
  Sparkles,
  Download,
  Check,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { ProStatus } from '../utils/proStore';

interface PhotoDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: {
    scale: number;
    watermark: boolean;
    isPro: boolean;
  }) => Promise<void>;
  isExporting: boolean;
  proStatus: ProStatus;
  onOpenUpgrade: () => void;
}

export const PhotoDownloadModal: React.FC<PhotoDownloadModalProps> = ({
  isOpen,
  onClose,
  onExport,
  isExporting,
  proStatus,
  onOpenUpgrade,
}) => {
  const [scale, setScale] = useState<number>(proStatus.isPro ? 3 : 2);

  if (!isOpen) return null;

  const handleFreeDownload = async () => {
    await onExport({
      scale: 2,
      watermark: true,
      isPro: false,
    });
    onClose();
  };

  const handleProDownload = async () => {
    if (!proStatus.isPro) {
      onOpenUpgrade();
      return;
    }
    await onExport({
      scale: scale,
      watermark: false,
      isPro: true,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-100">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-2xl bg-[#06C755]/20 text-[#06C755] flex items-center justify-center border border-[#06C755]/30">
            <Camera size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">下載擬真對話截圖</h3>
            <p className="text-xs text-slate-400">
              選擇適合您的圖片導出規格與浮水印設定
            </p>
          </div>
        </div>

        {/* Options Stack */}
        <div className="space-y-3.5 mb-6">
          {/* Option A: PRO Watermark-Free (Highlighted) */}
          <div
            className={`relative p-4 rounded-2xl border transition-all ${
              proStatus.isPro
                ? 'bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                : 'bg-gradient-to-br from-amber-950/20 via-slate-900 to-slate-900 border-amber-500/40 hover:border-amber-500/60'
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Crown size={14} />
                </span>
                <span className="text-sm font-extrabold text-white">
                  👑 PRO 超高清無浮水印下載
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {proStatus.isPro ? '已解鎖' : '極致品質'}
              </span>
            </div>

            <p className="text-xs text-slate-300 mb-3">
              100% 純淨無任何浮水印、支援 3x Retina 4K 像素解析度，字體與貼圖清晰銳利。
            </p>

            {/* Scale selection for Pro */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs mb-3">
              <span className="text-slate-400">輸出解析度：</span>
              <div className="flex gap-1.5">
                {[
                  { label: '2x HD', val: 2 },
                  { label: '3x 4K Retina', val: 3 },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setScale(item.val)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                      scale === item.val
                        ? 'bg-emerald-500 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleProDownload}
              disabled={isExporting}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                proStatus.isPro
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/20'
              }`}
            >
              {proStatus.isPro ? (
                <>
                  <Sparkles size={14} />
                  <span>
                    {isExporting ? '高清渲染中...' : '✨ 立即以 PRO 4K 導出 (無浮水印)'}
                  </span>
                </>
              ) : (
                <>
                  <Lock size={14} />
                  <span>解鎖 PRO 尊榮無浮水印下載 (NT$39 起)</span>
                </>
              )}
            </button>
          </div>

          {/* Option B: Free Download with Watermark */}
          <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 hover:bg-slate-800/60 transition-colors">
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2">
                <Download size={14} className="text-slate-400" />
                <span className="text-sm font-bold text-slate-200">
                  免費標準下載 (Free)
                </span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                免費無限制
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              標準 2x 高畫質 PNG，畫面右下方附帶微型浮水印標記（如供個人非商業參考）。
            </p>

            <button
              type="button"
              onClick={handleFreeDownload}
              disabled={isExporting}
              className="w-full py-2 px-4 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Download size={14} />
              <span>{isExporting ? '生成中...' : '免費下載 (帶官方浮水印)'}</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
          <span>支援 PNG 格式，自動觸發相機快門音</span>
          {!proStatus.isPro && (
            <button
              type="button"
              onClick={onOpenUpgrade}
              className="text-amber-400 hover:underline flex items-center gap-1"
            >
              <Crown size={11} />
              <span>輸入序號啟用 PRO</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
