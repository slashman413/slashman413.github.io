import React, { useState } from 'react';
import { Play, Pause, FileText, Download, MapPin, Phone, PhoneMissed, Video, AlertCircle } from 'lucide-react';
import { LineMessage, Participant, LineSettings, LINE_COLORS, OFFICIAL_LINE_WAVEFORM } from '../types/line';
import { STICKERS } from '../utils/stickers';

interface MessageBubbleProps {
  message: LineMessage;
  settings: LineSettings;
  participants: Participant[];
  isGroupChat: boolean;
  onEditMessage?: (msg: LineMessage) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  settings,
  participants,
  isGroupChat,
  onEditMessage,
}) => {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const theme = settings.darkMode ? LINE_COLORS.dark : LINE_COLORS.light;
  const isSender = message.isSender;

  // Find participant info if receiver in group chat
  const senderParticipant = !isSender && message.senderId
    ? participants.find((p) => p.id === message.senderId)
    : participants[0];

  const participantName = senderParticipant?.name || 'Friend';
  const participantAvatar = senderParticipant?.avatar;
  const participantColor = senderParticipant?.color || '#06C755';

  // Read status text
  const getReadStatusText = () => {
    if (!settings.showReadReceipts || !isSender) return null;
    if (message.status === 'read') {
      if (isGroupChat && (message.lineReadCount ?? 0) > 0) {
        return settings.language === 'ja'
          ? `既読 ${message.lineReadCount}`
          : settings.language === 'en'
          ? `Read ${message.lineReadCount}`
          : `已讀 ${message.lineReadCount}`;
      }
      return settings.language === 'ja' ? '既読' : settings.language === 'en' ? 'Read' : '已讀';
    }
    if (message.status === 'failed') {
      return (
        <span className="text-red-500 flex items-center gap-0.5">
          <AlertCircle size={10} />
          {settings.language === 'en' ? 'Failed' : '傳送失敗'}
        </span>
      );
    }
    return null;
  };

  // 1. System Centered Event (e.g. joined group, left group)
  if (message.type === 'system_event') {
    return (
      <div className="my-2 flex justify-center text-center select-none">
        <span
          className="rounded-full px-3 py-1 text-[11px] font-medium backdrop-blur-sm"
          style={{
            backgroundColor: theme.sectionHeaderBg,
            color: theme.sectionHeaderText,
          }}
        >
          {message.text || '系統訊息'}
        </span>
      </div>
    );
  }

  // 2. Deleted / Unsent Message
  if (message.type === 'deleted') {
    return (
      <div className={`my-1.5 flex ${isSender ? 'justify-end' : 'justify-start items-start gap-2.5'}`}>
        {!isSender && (
          <div className="size-8 rounded-full overflow-hidden bg-slate-300 shrink-0">
            {participantAvatar ? (
              <img src={participantAvatar} alt={participantName} className="size-full object-cover" />
            ) : (
              <div className="size-full flex items-center justify-center font-bold text-white text-xs" style={{ backgroundColor: participantColor }}>
                {participantName.slice(0, 1)}
              </div>
            )}
          </div>
        )}
        <div
          className="rounded-[16px] px-3.5 py-2 text-xs italic select-none max-w-[75%]"
          style={{
            backgroundColor: settings.darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
            color: settings.darkMode ? '#9CA3AF' : '#6B7280',
          }}
        >
          {message.text || (isSender ? '您已收回訊息' : `${participantName} 已收回訊息`)}
        </div>
      </div>
    );
  }

  // Waveform rendering for voice message
  const waveform = message.audioWaveform || OFFICIAL_LINE_WAVEFORM;

  // Render Inner Content by Type
  const renderContent = () => {
    switch (message.type) {
      // --- Sticker (Transparent, No bubble background!) ---
      case 'sticker': {
        const found = STICKERS.find((s) => s.id === message.mediaUrl) || STICKERS[0];
        return (
          <div className="p-1 select-none">
            {message.mediaUrl?.startsWith('http') || message.mediaUrl?.startsWith('data:') ? (
              <img src={message.mediaUrl} alt="Sticker" className="max-w-[130px] max-h-[130px] object-contain" />
            ) : (
              <div
                className="w-28 h-28 shrink-0 drop-shadow-sm hover:scale-105 transition-transform"
                dangerouslySetInnerHTML={{ __html: found.svg }}
              />
            )}
          </div>
        );
      }

      // --- Photo / Image ---
      case 'photo': {
        const sampleUrl = message.mediaUrl || 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80';
        return (
          <div className="rounded-[16px] overflow-hidden max-w-[240px]">
            <img src={sampleUrl} alt="Photo" className="w-full h-auto max-h-[260px] object-cover" />
            {message.text && (
              <div className="px-3 py-2 text-[14px] leading-snug">
                {message.text}
              </div>
            )}
          </div>
        );
      }

      // --- Video Message ---
      case 'video': {
        const thumbUrl = message.mediaUrl || 'https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&w=600&q=80';
        return (
          <div className="relative rounded-[16px] overflow-hidden max-w-[240px] group cursor-pointer">
            <img src={thumbUrl} alt="Video Thumbnail" className="w-full h-40 object-cover" />
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <div className="w-11 h-11 rounded-full bg-white/80 flex items-center justify-center text-slate-900 group-hover:scale-110 transition-transform">
                <Play size={20} fill="currentColor" className="translate-x-[1px]" />
              </div>
            </div>
            <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white font-medium flex items-center gap-1">
              <Video size={11} />
              <span>0:45</span>
            </div>
          </div>
        );
      }

      // --- Voice Message (38-bar waveform) ---
      case 'voice': {
        const duration = message.audioDuration || 15;
        const minutes = Math.floor(duration / 60);
        const seconds = (duration % 60).toString().padStart(2, '0');
        const activeBarCount = isPlayingAudio ? Math.floor(waveform.length * 0.6) : 0;

        return (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 min-w-[170px] select-none">
            <button
              type="button"
              onClick={() => setIsPlayingAudio(!isPlayingAudio)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80"
              style={{
                backgroundColor: isSender ? (settings.darkMode ? '#22C55E' : '#06C755') : (settings.darkMode ? '#38BDF8' : '#06C755'),
                color: '#FFFFFF',
              }}
            >
              {isPlayingAudio ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="translate-x-[1px]" />}
            </button>
            <div className="flex h-[18px] flex-1 items-center justify-between gap-[2px]">
              {waveform.map((bar, i) => (
                <span
                  key={i}
                  className="w-[2px] rounded-full transition-all"
                  style={{
                    height: `${Math.max(3, (bar / 100) * 18)}px`,
                    backgroundColor:
                      i < activeBarCount
                        ? isSender
                          ? '#101820'
                          : '#06C755'
                        : settings.darkMode
                        ? 'rgba(234, 240, 243, 0.35)'
                        : 'rgba(75, 85, 99, 0.35)',
                  }}
                />
              ))}
            </div>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums opacity-90">
              {minutes}:{seconds}
            </span>
          </div>
        );
      }

      // --- File Card ---
      case 'file': {
        return (
          <div className="flex items-center gap-3 p-3 min-w-[210px] select-none">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
              <FileText size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate leading-snug">
                {message.fileName || 'Document.pdf'}
              </p>
              <p className="text-[11px] opacity-75">{message.fileSize || '1.8 MB'}</p>
            </div>
            <Download size={16} className="opacity-70 shrink-0" />
          </div>
        );
      }

      // --- Location Map Card ---
      case 'location': {
        return (
          <div className="overflow-hidden rounded-[16px] max-w-[230px] select-none">
            <div className="h-28 bg-emerald-100 dark:bg-slate-800 relative flex items-center justify-center">
              {/* Map background illustration */}
              <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#06C755_1px,transparent_1px)] [background-size:12px_12px]" />
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg animate-bounce">
                  <MapPin size={18} />
                </div>
              </div>
            </div>
            <div className="p-3">
              <p className="text-[14px] font-bold truncate leading-snug">
                {message.locationTitle || '台北車站'}
              </p>
              <p className="text-[11px] opacity-75 truncate mt-0.5">
                {message.locationAddress || '台北市中正區忠孝西路一段49號'}
              </p>
            </div>
          </div>
        );
      }

      // --- Call Event Card ---
      case 'call_event': {
        const isMissed = message.callStatus === 'missed';
        return (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 select-none">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: isMissed ? '#EF4444' : '#06C755' }}
            >
              {isMissed ? <PhoneMissed size={16} /> : <Phone size={16} />}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-tight">
                {isMissed ? '未接來電' : '語音通話'}
              </p>
              {!isMissed && (
                <p className="text-[11px] opacity-80 mt-0.5">
                  通話時間 {message.callDuration || '04:15'}
                </p>
              )}
            </div>
          </div>
        );
      }

      // --- Standard Text Message ---
      default: {
        return (
          <div className="px-3.5 py-2 text-[15px] leading-[1.4] break-words whitespace-pre-wrap">
            {message.text || ''}
          </div>
        );
      }
    }
  };

  const isSticker = message.type === 'sticker';

  return (
    <div
      className={`relative my-1 flex items-end gap-1.5 ${
        isSender ? 'justify-end' : 'justify-start'
      }`}
      onClick={() => onEditMessage?.(message)}
    >
      {/* Receiver Avatar (Left) */}
      {!isSender && (
        <div className="flex flex-col items-center self-start mr-1">
          <div className="size-9 rounded-full overflow-hidden bg-slate-300 shrink-0 shadow-sm">
            {participantAvatar ? (
              <img src={participantAvatar} alt={participantName} className="size-full object-cover" />
            ) : (
              <div
                className="size-full flex items-center justify-center font-bold text-white text-xs select-none"
                style={{ backgroundColor: participantColor }}
              >
                {participantName.slice(0, 1)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Message Column */}
      <div className={`flex flex-col max-w-[72%] ${isSender ? 'items-end' : 'items-start'}`}>
        {/* Participant Name on top (in Group Chat) */}
        {!isSender && isGroupChat && (
          <span
            className="text-[11px] font-semibold mb-1 ml-0.5 truncate select-none"
            style={{ color: settings.darkMode ? '#CBD5E1' : '#4B5563' }}
          >
            {participantName}
          </span>
        )}

        <div className={`relative flex items-end gap-1.5 ${isSender ? 'flex-row-reverse' : 'flex-row'}`}>
          {/* Message Bubble Container */}
          <div
            className={`relative rounded-[18px] transition-all overflow-hidden ${
              isSticker
                ? 'bg-transparent shadow-none'
                : 'shadow-sm'
            }`}
            style={{
              backgroundColor: isSticker
                ? 'transparent'
                : isSender
                ? theme.senderBubble
                : theme.receiverBubble,
              borderColor: isSticker ? 'transparent' : theme.bubbleBorder,
              color: isSticker
                ? theme.textPrimary
                : isSender
                ? settings.darkMode ? '#FFFFFF' : '#111827'
                : theme.textPrimary,
              boxShadow: isSticker ? 'none' : theme.bubbleShadow,
            }}
          >
            {renderContent()}
          </div>

          {/* Time & Read Receipts */}
          {!message.hideTime && (
            <div
              className={`flex shrink-0 flex-col text-[10px] font-medium tabular-nums select-none ${
                isSender ? 'items-end text-right' : 'items-start text-left'
              }`}
              style={{ color: theme.timeText }}
            >
              {isSender && (
                <span className="font-semibold leading-none mb-0.5">
                  {getReadStatusText()}
                </span>
              )}
              <span className="leading-none opacity-85">{message.time}</span>
            </div>
          )}
        </div>

        {/* Message Reaction Badges floating below bubble */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={`-mt-2 z-10 flex items-center gap-1 ${isSender ? 'mr-2' : 'ml-2'}`}>
            {message.reactions.map((r, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-md bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 select-none animate-in fade-in"
              >
                <span>{r.emoji}</span>
                {r.count > 1 && <span className="font-bold text-[10px]">{r.count}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
