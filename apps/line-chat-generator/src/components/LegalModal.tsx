import React from 'react';
import { ShieldAlert, X, CheckCircle } from 'lucide-react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700/80 p-6 shadow-2xl text-slate-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 text-amber-400 mb-4">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <ShieldAlert size={28} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">免責聲明與使用規範 (Terms of Use)</h3>
            <p className="text-xs text-slate-400">LINE Chat Generator 合規使用原則</p>
          </div>
        </div>

        <div className="space-y-3.5 text-sm text-slate-300 leading-relaxed max-h-[60vh] overflow-y-auto pr-1">
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <h4 className="font-semibold text-white mb-1 flex items-center gap-1.5">
              <CheckCircle size={15} className="text-emerald-400" />
              合法允許之使用情境
            </h4>
            <ul className="list-disc list-inside text-xs space-y-1 text-slate-300">
              <li>影音短劇創作、小說劇情編排（TikTok、YouTube Shorts、Reels）。</li>
              <li>UI/UX 產品設計提案、教學簡報、軟體操作說明。</li>
              <li>社群網路幽默迷因（Meme）、朋友間開玩笑。</li>
            </ul>
          </div>

          <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/30">
            <h4 className="font-semibold text-red-400 mb-1 flex items-center gap-1.5">
              <ShieldAlert size={15} />
              嚴格禁止之違法情事
            </h4>
            <ul className="list-disc list-inside text-xs space-y-1 text-red-200/90">
              <li>偽造司法訴訟證據或法律舉證文件。</li>
              <li>冒充他人名義散布不實言論、毀謗或損害名譽。</li>
              <li>製作釣魚詐騙、金錢索討、假借貸或各類非法詐欺宣傳。</li>
            </ul>
          </div>

          <p className="text-xs text-slate-400">
            本工具僅為前端介面模擬器，不代表 LINE Corporation 官方服務。用戶須對產出內容自負全部法律責任。
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-bold text-white text-sm transition-transform active:scale-95 shadow-lg shadow-emerald-500/20"
          >
            我已理解並同意規範
          </button>
        </div>
      </div>
    </div>
  );
};
