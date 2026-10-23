import React from 'react';
import { ChevronLeft, Search, Phone, Menu } from 'lucide-react';
import { ConversationInfo, LineSettings, LINE_COLORS } from '../types/line';

interface LineHeaderProps {
  conversation: ConversationInfo;
  settings: LineSettings;
}

export const LineHeader: React.FC<LineHeaderProps> = ({ conversation, settings }) => {
  const theme = settings.darkMode ? LINE_COLORS.dark : LINE_COLORS.light;

  return (
    <div
      className="relative z-20 flex h-[52px] shrink-0 items-center justify-between px-3 border-b select-none transition-colors"
      style={{
        backgroundColor: theme.headerBg,
        borderColor: theme.headerBorder,
        color: theme.headerText,
      }}
    >
      {/* Back Button */}
      <div className="flex w-16 items-center">
        <button
          type="button"
          className="flex items-center gap-0.5 -ml-1 p-1 rounded-full hover:opacity-75 transition-opacity"
          aria-label="Back"
        >
          <ChevronLeft size={28} strokeWidth={2.2} />
        </button>
      </div>

      {/* Center Chat Title */}
      <div className="flex-1 min-w-0 text-center px-1">
        <h2 className="text-[17px] font-bold tracking-tight truncate flex items-center justify-center gap-1.5">
          <span>{conversation.headerName || 'LINE Chat'}</span>
          {conversation.isGroupChat && (
            <span className="text-[15px] font-normal opacity-85 tabular-nums">
              ({conversation.participants.length + 1})
            </span>
          )}
        </h2>
      </div>

      {/* Right Icons: Search, Call, Menu */}
      <div
        className="flex w-24 items-center justify-end gap-3.5"
        style={{ color: settings.darkMode ? theme.headerMuted : '#111827' }}
      >
        <button type="button" className="hover:opacity-75 transition-opacity p-0.5" aria-label="Search">
          <Search size={20} strokeWidth={2.2} />
        </button>
        <button type="button" className="hover:opacity-75 transition-opacity p-0.5" aria-label="Voice Call">
          <Phone size={19} strokeWidth={2.2} />
        </button>
        <button type="button" className="hover:opacity-75 transition-opacity p-0.5" aria-label="Chat Menu">
          <Menu size={22} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
};
