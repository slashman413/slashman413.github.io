export type MessageType =
  | 'text'
  | 'photo'
  | 'sticker'
  | 'voice'
  | 'video'
  | 'file'
  | 'location'
  | 'call_event'
  | 'system_event'
  | 'deleted';

export type ReadStatus = 'none' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Reaction {
  emoji: string;
  count: number;
}

export interface Participant {
  id: string;
  name: string;
  avatar?: string;
  color?: string;
}

export interface LineMessage {
  id: string;
  type: MessageType;
  isSender: boolean;
  senderId?: string;
  time: string;
  hideTime?: boolean;
  status: ReadStatus;
  lineReadCount?: number;
  text?: string;
  mediaUrl?: string;
  audioDuration?: number;
  audioWaveform?: number[];
  fileName?: string;
  fileSize?: string;
  locationTitle?: string;
  locationAddress?: string;
  callType?: 'voice' | 'video';
  callStatus?: 'connected' | 'missed' | 'declined';
  callDuration?: string;
  reactions?: Reaction[];
  typingDelay?: number;
}

export type PhoneModel = 'iphone-17-pro' | 'iphone-16' | 'pixel-8' | 'screen-only';

export interface LineSettings {
  darkMode: boolean;
  wallpaper?: string;
  phoneModel: PhoneModel;
  phoneFrame: boolean;
  showStatusBar: boolean;
  batteryLevel: number;
  isCharging: boolean;
  wifiSignal: 0 | 1 | 2 | 3;
  cellularSignal: 0 | 1 | 2 | 3 | 4;
  networkType: '5G' | 'LTE' | '4G' | 'WiFi';
  statusBarTime: string;
  autoStepTimes: boolean;
  autoStepMinutes: number;
  showReadReceipts: boolean;
  showConversationDate: boolean;
  conversationDateText: string;
  enableSoundEffects: boolean;
  typingSpeed: 'slow' | 'normal' | 'fast';
  watermarkText: string;
  showWatermark: boolean;
  language: 'zh-TW' | 'ja' | 'en' | 'th';
}

export interface ConversationInfo {
  isGroupChat: boolean;
  headerName: string;
  headerAvatar?: string;
  participants: Participant[];
}

export interface LineChatProject {
  id: string;
  title: string;
  settings: LineSettings;
  conversation: ConversationInfo;
  messages: LineMessage[];
}

// 38-bar waveform official LINE pattern
export const OFFICIAL_LINE_WAVEFORM = [
  22, 46, 28, 54, 35, 64, 24, 58, 39, 70, 26, 50, 32, 60, 44, 72, 29, 56, 36, 66,
  25, 52, 34, 62, 30, 48, 41, 68, 23, 55, 37, 65, 27, 51, 43, 74, 31, 59,
];

// LINE Theme colors extracted directly from TheFake line-chat-generator
export const LINE_COLORS = {
  light: {
    bg: '#8CABD9', // LINE classic blue background
    headerBg: '#FFFFFF',
    headerBorder: 'rgba(15, 23, 42, 0.08)',
    headerText: '#111827',
    headerMuted: '#06C755',
    textPrimary: '#101820',
    textSecondary: '#4B5563',
    senderBubble: '#9CEB68',
    receiverBubble: '#FDFDFC',
    bubbleBorder: 'rgba(12, 34, 48, 0.06)',
    sectionHeaderBg: 'rgba(0, 0, 0, 0.22)',
    sectionHeaderText: '#FFFFFF',
    footerBg: '#FFFFFF',
    footerBorder: 'rgba(15, 23, 42, 0.08)',
    footerMuted: '#6B7280',
    inputBg: '#F3F4F6',
    inputBorder: 'rgba(15, 23, 42, 0.06)',
    inputPlaceholder: '#9CA3AF',
    timeText: 'rgba(75, 85, 99, 0.88)',
    timeTextSender: 'rgba(30, 41, 59, 0.75)',
    timeTextOnWallpaper: 'rgba(255, 255, 255, 0.85)',
    checkRead: '#06C755',
    bubbleShadow: '0 1px 1px rgba(15, 23, 42, 0.12)',
  },
  dark: {
    bg: '#15242E',
    headerBg: '#0B6F3A',
    headerBorder: 'rgba(5, 34, 22, 0.55)',
    headerText: '#F1FFF4',
    headerMuted: 'rgba(241, 255, 244, 0.85)',
    textPrimary: '#EAF0F3',
    textSecondary: '#A8B3BA',
    senderBubble: '#28743D',
    receiverBubble: '#24333C',
    bubbleBorder: 'rgba(255, 255, 255, 0.06)',
    sectionHeaderBg: 'rgba(255, 255, 255, 0.14)',
    sectionHeaderText: '#D8E3E8',
    footerBg: '#111D25',
    footerBorder: 'rgba(255, 255, 255, 0.08)',
    footerMuted: '#A8B3BA',
    inputBg: '#202C35',
    inputBorder: 'rgba(255, 255, 255, 0.08)',
    inputPlaceholder: '#A8B3BA',
    timeText: 'rgba(216, 227, 232, 0.72)',
    timeTextSender: 'rgba(216, 227, 232, 0.72)',
    timeTextOnWallpaper: 'rgba(216, 227, 232, 0.85)',
    checkRead: '#22C55E',
    bubbleShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
  },
};
