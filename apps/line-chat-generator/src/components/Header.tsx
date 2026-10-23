import React, { useState } from 'react';
import {
  Camera,
  Sparkles,
  Shield,
  Moon,
  Sun,
  ChevronDown,
  Crown,
  Lock,
} from 'lucide-react';
import { PRESET_TEMPLATES } from '../utils/templates';
import { LineChatProject } from '../types/line';
import { ProStatus } from '../utils/proStore';

interface HeaderProps {
  onOpenPhotoDownload: () => void;
  isExporting: boolean;
  onSelectTemplate: (project: LineChatProject) => void;
  onOpenLegal: () => void;
  onOpenUpgrade: () => void;
  proStatus: ProStatus;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  language: string;
  onChangeLanguage: (lang: 'zh-TW' | 'ja' | 'en' | 'th') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenPhotoDownload,
  isExporting,
  onSelectTemplate,
  onOpenLegal,
  onOpenUpgrade,
  proStatus,
  darkMode,
  onToggleDarkMode,
  language,
  onChangeLanguage,
}) => {
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-900/95 backdrop-blur-md px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#06C755] text-white shadow-lg shadow-[#06C755]/20 ring-1 ring-white/20">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M12 2C6.48 2 2 5.82 2 10.53c0 2.94 1.77 5.53 4.49 7.02l-.93 3.44a.5.5 0 0 0 .7.56l4.13-2.12c.52.07 1.06.1 1.61.1 5.52 0 10-3.82 10-8.53S17.52 2 12 2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-extrabold tracking-tight text-white">
                LINE Chat Generator
              </h1>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              擬真 LINE 對話截圖與影片生成工具
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Pro Upgrade / Membership Button */}
          {proStatus.isPro ? (
            <button
              type="button"
              onClick={onOpenUpgrade}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-emerald-500/15 to-teal-500/15 border border-amber-500/40 text-amber-300 hover:border-amber-400 text-xs font-bold transition-all shadow-sm"
              title="檢視 PRO 會員授權狀態"
            >
              <Crown size={14} className="text-amber-400" />
              <span className="hidden sm:inline">👑 PRO 會員中</span>
              <span className="sm:hidden">PRO</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenUpgrade}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-md transition-all active:scale-95"
              title="解鎖無浮水印 4K 截圖與影片導出"
            >
              <Crown size={14} />
              <span className="hidden sm:inline">升級 PRO</span>
              <span className="sm:hidden">PRO</span>
            </button>
          )}

          {/* Template Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setTemplateMenuOpen(!templateMenuOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-xs font-semibold text-slate-200 border border-slate-700/60 transition-colors"
            >
              <Sparkles size={14} className="text-amber-400" />
              <span className="hidden md:inline">情境範本</span>
              <ChevronDown size={13} className="text-slate-400" />
            </button>

            {templateMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl bg-slate-800 border border-slate-700 shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  載入熱門範本
                </div>
                {Object.entries(PRESET_TEMPLATES).map(([key, tpl]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      onSelectTemplate(tpl);
                      setTemplateMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-700/80 flex items-center justify-between transition-colors"
                  >
                    <span>{tpl.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Language Switcher */}
          <select
            value={language}
            onChange={(e) =>
              onChangeLanguage(e.target.value as 'zh-TW' | 'ja' | 'en' | 'th')
            }
            className="hidden sm:block rounded-xl bg-slate-800 border border-slate-700/60 px-2 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="zh-TW">繁體中文</option>
            <option value="ja">日本語</option>
            <option value="en">English</option>
            <option value="th">ไทย</option>
          </select>

          {/* Theme Toggle (Dark/Light on Phone) */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-colors"
            title={darkMode ? '切換為淺色模式' : '切換為深色模式'}
          >
            {darkMode ? (
              <Sun size={15} className="text-amber-400" />
            ) : (
              <Moon size={15} />
            )}
          </button>

          {/* Screenshot Export Button */}
          <button
            type="button"
            onClick={onOpenPhotoDownload}
            disabled={isExporting}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs shadow-lg active:scale-95 transition-all ${
              proStatus.isPro
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-emerald-500/25'
                : 'bg-[#06C755] hover:bg-[#05b34c] text-white shadow-[#06C755]/25'
            }`}
          >
            <Camera size={15} />
            <span>{isExporting ? '生成中...' : '下載相片 (PNG)'}</span>
          </button>

          {/* Legal Modal Trigger */}
          <button
            type="button"
            onClick={onOpenLegal}
            className="p-2 text-slate-400 hover:text-amber-400 rounded-xl hover:bg-slate-800 transition-colors"
            title="免責聲明與使用規範"
          >
            <Shield size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};
