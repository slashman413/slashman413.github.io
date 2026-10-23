import React from 'react';
import {
  X,
  Video,
  Crown,
  Sparkles,
  Check,
  Lock,
  Play,
  Zap,
} from 'lucide-react';
import { ProStatus } from '../utils/proStore';

interface VideoDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartRecording: (options: {
    watermark: boolean;
    fps: number;
    isPro: boolean;
  }) => void;
  isRecording: boolean;
  proStatus: ProStatus;
  onOpenUpgrade: () => void;
}

export const VideoDownloadModal: React.FC<VideoDownloadModalProps> = ({
  isOpen,
  onClose,
  onStartRecording,
  isRecording,
  proStatus,
  onOpenUpgrade,
}) => {
  if (!isOpen) return null;

  const handleFreeRecord = () => {
    onStartRecording({
      watermark: true,
      fps: 30,
      isPro: false,
    });
    onClose();
  };

  const handleProRecord = () => {
    if (!proStatus.isPro) {
      onOpenUpgrade();
      return;
    }
    onStartRecording({
      watermark: false,
      fps: 60,
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
          <div className="h-10 w-10 rounded-2xl bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
            <Video size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">錄製動態對話短影音</h3>
            <p className="text-xs text-slate-400">
              輸出為短影片 (WebM)，適合 TikTok、Reels 與 YouTube Shorts
            </p>
          </div>
        </div>

        {/* Options Stack */}
        <div className="space-y-3.5 mb-6">
          {/* Option A: PRO 60FPS Watermark-Free */}
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
                  👑 PRO 60FPS 超流暢無浮水印錄製
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {proStatus.isPro ? '已解鎖' : '最佳畫質'}
              </span>
            </div>

            <ul className="space-y-1.5 text-xs text-slate-300 mb-4">
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>100% 純淨畫面，無任何浮水印膠囊或標籤</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>60FPS 高影格率，擬真打字與彈跳動態極致順暢</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>無限制影片長度，支援長篇劇情完整錄製</span>
              </li>
            </ul>

            <button
              type="button"
              onClick={handleProRecord}
              disabled={isRecording}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                proStatus.isPro
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/20'
              }`}
            >
              {proStatus.isPro ? (
                <>
                  <Sparkles size={14} />
                  <span>✨ 立即以 PRO 模式開始錄製 (無浮水印)</span>
                </>
              ) : (
                <>
                  <Lock size={14} />
                  <span>解鎖 PRO 尊榮無浮水印錄影 (NT$39 起)</span>
                </>
              )}
            </button>
          </div>

          {/* Option B: Free Recording with Watermark */}
          <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 hover:bg-slate-800/60 transition-colors">
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2">
                <Play size={14} className="text-slate-400" />
                <span className="text-sm font-bold text-slate-200">
                  免費標準錄製 (Free)
                </span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                標準畫質
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              標準 30FPS 錄製，錄製期間畫面右下方附帶微型浮水印標記。
            </p>

            <button
              type="button"
              onClick={handleFreeRecord}
              disabled={isRecording}
              className="w-full py-2 px-4 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Video size={14} />
              <span>開始免費錄製 (帶官方浮水印)</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
          <span>錄製時將自動從第一則訊息開始播放</span>
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
