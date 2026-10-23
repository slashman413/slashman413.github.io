import React from 'react';
import { Plus, Camera, Image, Mic, Send } from 'lucide-react';
import { LineSettings, LINE_COLORS } from '../types/line';

interface LineFooterProps {
  settings: LineSettings;
  typedDraft?: string;
}

export const LineFooter: React.FC<LineFooterProps> = ({ settings, typedDraft = '' }) => {
  const theme = settings.darkMode ? LINE_COLORS.dark : LINE_COLORS.light;
  const hasText = typedDraft.trim().length > 0;

  return (
    <div
      className="relative z-20 flex shrink-0 items-center gap-2.5 px-3 py-2 border-t select-none transition-colors"
      style={{
        backgroundColor: theme.footerBg,
        borderColor: theme.footerBorder,
      }}
    >
      {/* Left Action Buttons */}
      <div className="flex items-center gap-2.5" style={{ color: theme.footerMuted }}>
        <button
          type="button"
          className="p-1 hover:opacity-75 transition-opacity"
          aria-label="Add Attachment"
        >
          <Plus size={22} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className="p-1 hover:opacity-75 transition-opacity"
          aria-label="Camera"
        >
          <Camera size={21} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="p-1 hover:opacity-75 transition-opacity"
          aria-label="Photo Gallery"
        >
          <Image size={21} strokeWidth={2} />
        </button>
      </div>

      {/* Middle Text Input Bubble */}
      <div
        className="flex min-h-[36px] flex-1 items-center rounded-full border px-3.5 text-sm transition-colors"
        style={{
          backgroundColor: theme.inputBg,
          borderColor: theme.inputBorder,
          color: theme.textPrimary,
        }}
      >
        <span
          className="truncate text-[15px] select-none"
          style={{
            color: hasText ? theme.textPrimary : theme.inputPlaceholder,
          }}
        >
          {hasText ? typedDraft : 'Aa'}
        </span>
      </div>

      {/* Right: Mic or Send Button */}
      <div className="flex items-center">
        {hasText ? (
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#06C755] text-white hover:opacity-90 shadow-sm transition-transform active:scale-95"
            aria-label="Send Message"
          >
            <Send size={15} strokeWidth={2.4} className="translate-x-[1px]" />
          </button>
        ) : (
          <button
            type="button"
            className="p-1.5 hover:opacity-75 transition-opacity"
            style={{ color: theme.footerMuted }}
            aria-label="Voice Message"
          >
            <Mic size={22} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
};
