import React, { useState } from 'react';
import {
  MessageSquare,
  Users,
  Smartphone,
  FileCode,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  Smile,
  Mic,
  Image,
  Video,
  FileText,
  MapPin,
  Phone,
  AlertTriangle,
  RotateCcw,
  Upload,
  Download,
  Crown,
  Lock,
  Sparkles,
} from 'lucide-react';
import {
  LineMessage,
  MessageType,
  Participant,
  LineSettings,
  ConversationInfo,
  PhoneModel,
} from '../types/line';
import { STICKERS } from '../utils/stickers';
import { parseScriptToMessages } from '../utils/scriptParser';
import { ProStatus } from '../utils/proStore';

interface EditorDrawerProps {
  messages: LineMessage[];
  onUpdateMessages: (msgs: LineMessage[]) => void;
  conversation: ConversationInfo;
  onUpdateConversation: (conv: ConversationInfo) => void;
  settings: LineSettings;
  onUpdateSettings: (settings: LineSettings) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  proStatus?: ProStatus;
  onOpenUpgrade?: () => void;
}

export const EditorDrawer: React.FC<EditorDrawerProps> = ({
  messages,
  onUpdateMessages,
  conversation,
  onUpdateConversation,
  settings,
  onUpdateSettings,
  onExportJson,
  onImportJson,
  proStatus,
  onOpenUpgrade,
}) => {
  const [activeTab, setActiveTab] = useState<'messages' | 'participants' | 'device' | 'script'>('messages');

  // New message form state
  const [isSender, setIsSender] = useState(true);
  const [msgType, setMsgType] = useState<MessageType>('text');
  const [msgText, setMsgText] = useState('');
  const [selectedSenderId, setSelectedSenderId] = useState(conversation.participants[0]?.id || '');
  const [selectedSticker, setSelectedSticker] = useState(STICKERS[0].id);
  const [scriptInput, setScriptInput] = useState('');

  // Add Message Handler
  const handleAddMessage = () => {
    let nextTime = '09:41';
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      if (settings.autoStepTimes && last.time) {
        const parts = last.time.split(':').map((p) => parseInt(p, 10));
        let h = parts[0] || 9;
        let m = (parts[1] || 41) + settings.autoStepMinutes;
        if (m >= 60) {
          h = (h + Math.floor(m / 60)) % 24;
          m = m % 60;
        }
        nextTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      } else {
        nextTime = last.time;
      }
    }

    const newMsg: LineMessage = {
      id: 'msg-' + Date.now() + Math.random().toString(36).substr(2, 4),
      type: msgType,
      isSender,
      senderId: !isSender ? selectedSenderId : undefined,
      time: nextTime,
      status: isSender ? 'read' : 'none',
      lineReadCount: conversation.isGroupChat && isSender ? conversation.participants.length : undefined,
      text: msgType === 'text' ? msgText : undefined,
      mediaUrl: msgType === 'sticker' ? selectedSticker : undefined,
      audioDuration: msgType === 'voice' ? 12 : undefined,
      fileName: msgType === 'file' ? '合約書_final.pdf' : undefined,
      fileSize: msgType === 'file' ? '2.4 MB' : undefined,
      locationTitle: msgType === 'location' ? '台北車站' : undefined,
      locationAddress: msgType === 'location' ? '台北市中正區忠孝西路一段49號' : undefined,
      callType: msgType === 'call_event' ? 'voice' : undefined,
      callStatus: msgType === 'call_event' ? 'connected' : undefined,
      callDuration: msgType === 'call_event' ? '05:32' : undefined,
    };

    onUpdateMessages([...messages, newMsg]);
    setMsgText('');
  };

  // Reorder messages
  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= messages.length) return;
    const updated = [...messages];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, moved);
    onUpdateMessages(updated);
  };

  // Duplicate message
  const handleDuplicate = (index: number) => {
    const orig = messages[index];
    const cloned: LineMessage = {
      ...orig,
      id: 'msg-' + Date.now() + Math.random().toString(36).substr(2, 4),
    };
    const updated = [...messages];
    updated.splice(index + 1, 0, cloned);
    onUpdateMessages(updated);
  };

  // Delete message
  const handleDelete = (index: number) => {
    onUpdateMessages(messages.filter((_, i) => i !== index));
  };

  // Script Mode Parse
  const handleParseScript = () => {
    if (!scriptInput.trim()) return;
    const parsed = parseScriptToMessages(
      scriptInput,
      conversation.participants,
      settings.statusBarTime || '09:41',
      settings.autoStepMinutes
    );
    onUpdateMessages([...messages, ...parsed]);
    setScriptInput('');
    setActiveTab('messages');
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-slate-200">
      {/* Drawer Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 p-1.5 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('messages')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'messages'
              ? 'bg-[#06C755] text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <MessageSquare size={14} />
          <span>訊息清單</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('participants')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'participants'
              ? 'bg-[#06C755] text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Users size={14} />
          <span>成員群組</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('device')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'device'
              ? 'bg-[#06C755] text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Smartphone size={14} />
          <span>機型設定</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('script')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'script'
              ? 'bg-[#06C755] text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <FileCode size={14} />
          <span>劇本模式</span>
        </button>
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* ================= TAB 1: MESSAGES ================= */}
        {activeTab === 'messages' && (
          <div className="space-y-5">
            {/* Add Message Box */}
            <div className="rounded-2xl bg-slate-800/70 p-4 border border-slate-700/70 shadow-lg space-y-3.5">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Plus size={15} className="text-[#06C755]" />
                新增對話訊息
              </h3>

              {/* Sender Toggle */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsSender(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                    isSender
                      ? 'bg-[#06C755] border-[#06C755] text-white shadow-md'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  我方 (右側綠色)
                </button>
                <button
                  type="button"
                  onClick={() => setIsSender(false)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                    !isSender
                      ? 'bg-slate-100 border-slate-200 text-slate-900 shadow-md'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  對方 (左側白色)
                </button>
              </div>

              {/* In Group Chat: Select Participant for Receiver */}
              {!isSender && conversation.participants.length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    發送成員 (對方)
                  </label>
                  <select
                    value={selectedSenderId}
                    onChange={(e) => setSelectedSenderId(e.target.value)}
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {conversation.participants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Message Type Selector */}
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  訊息型態 (10種)
                </label>
                <div className="grid grid-cols-5 gap-1.5 text-xs">
                  {[
                    { id: 'text', label: '文字', icon: MessageSquare },
                    { id: 'sticker', label: '貼圖', icon: Smile },
                    { id: 'voice', label: '語音', icon: Mic },
                    { id: 'photo', label: '照片', icon: Image },
                    { id: 'video', label: '影片', icon: Video },
                    { id: 'file', label: '檔案', icon: FileText },
                    { id: 'location', label: '定位', icon: MapPin },
                    { id: 'call_event', label: '通話', icon: Phone },
                    { id: 'system_event', label: '廣播', icon: AlertTriangle },
                    { id: 'deleted', label: '收回', icon: RotateCcw },
                  ].map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setMsgType(t.id as MessageType)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[11px] font-medium transition-all ${
                          msgType === t.id
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold'
                            : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Icon size={14} />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text Input */}
              {msgType === 'text' && (
                <div>
                  <textarea
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    placeholder="輸入對話內容..."
                    rows={2}
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                  />
                </div>
              )}

              {/* Sticker Selector */}
              {msgType === 'sticker' && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                    選擇 LINE 經典貼圖
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {STICKERS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSticker(s.id)}
                        className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                          selectedSticker === s.id
                            ? 'border-[#06C755] bg-emerald-500/10'
                            : 'border-slate-700 bg-slate-900/80 hover:border-slate-600'
                        }`}
                      >
                        <div
                          className="w-12 h-12"
                          dangerouslySetInnerHTML={{ __html: s.svg }}
                        />
                        <span className="text-[10px] text-slate-300 truncate w-full text-center">
                          {s.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAddMessage}
                className="w-full py-2.5 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-bold text-xs shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-1.5"
              >
                <Plus size={16} />
                <span>加入訊息到對話</span>
              </button>
            </div>

            {/* Current Messages List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-1">
                <span>目前訊息串 ({messages.length})</span>
                <button
                  type="button"
                  onClick={() => onUpdateMessages([])}
                  className="text-red-400 hover:text-red-300 text-[11px]"
                >
                  清空全部
                </button>
              </div>

              {messages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-xs text-slate-500">
                  尚無訊息，請在上方新增或切換至「劇本模式」快速匯入。
                </div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {messages.map((m, idx) => (
                    <div
                      key={m.id}
                      className="group flex items-center justify-between gap-2 rounded-xl bg-slate-800/80 p-2.5 border border-slate-700/60 hover:border-slate-600 transition-all text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            m.isSender ? 'bg-[#06C755]' : 'bg-blue-400'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[11px] text-slate-300">
                              {m.isSender ? '我' : '對方'}
                            </span>
                            <span className="text-[10px] text-slate-500 tabular-nums">
                              {m.time}
                            </span>
                            <span className="text-[10px] px-1 rounded bg-slate-700 text-slate-300">
                              {m.type}
                            </span>
                          </div>
                          <p className="truncate text-slate-300 text-[11px] mt-0.5">
                            {m.text || `[${m.type} 訊息]`}
                          </p>
                        </div>
                      </div>

                      {/* Action buttons: Up, Down, Copy, Delete */}
                      <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => handleMove(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 hover:text-white disabled:opacity-30 rounded hover:bg-slate-700"
                          title="上移"
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(idx, 'down')}
                          disabled={idx === messages.length - 1}
                          className="p-1 hover:text-white disabled:opacity-30 rounded hover:bg-slate-700"
                          title="下移"
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(idx)}
                          className="p-1 hover:text-white rounded hover:bg-slate-700"
                          title="複製"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(idx)}
                          className="p-1 text-red-400 hover:text-red-300 rounded hover:bg-slate-700"
                          title="刪除"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: PARTICIPANTS ================= */}
        {activeTab === 'participants' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-800/70 p-4 border border-slate-700/70 shadow-lg space-y-4">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                聊天模式與成員管理
              </h3>

              {/* Group Chat Toggle */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-xs font-semibold text-white">群組聊天模式</p>
                  <p className="text-[11px] text-slate-400">啟用後顯示成員名稱與頭像標籤</p>
                </div>
                <input
                  type="checkbox"
                  checked={conversation.isGroupChat}
                  onChange={(e) =>
                    onUpdateConversation({ ...conversation, isGroupChat: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 bg-slate-900 border-slate-700"
                />
              </div>

              {/* Chat Title */}
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  {conversation.isGroupChat ? '群組名稱' : '聊天對象姓名'}
                </label>
                <input
                  type="text"
                  value={conversation.headerName}
                  onChange={(e) =>
                    onUpdateConversation({ ...conversation, headerName: e.target.value })
                  }
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Participants list */}
              <div className="space-y-2 pt-2 border-t border-slate-700">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span>對象成員名單</span>
                  <button
                    type="button"
                    onClick={() => {
                      const id = 'p-' + Date.now();
                      onUpdateConversation({
                        ...conversation,
                        participants: [
                          ...conversation.participants,
                          { id, name: `成員 ${conversation.participants.length + 1}`, color: '#3B82F6' },
                        ],
                      });
                    }}
                    className="text-[#06C755] hover:underline flex items-center gap-1 text-[11px]"
                  >
                    <Plus size={13} />
                    <span>新增成員</span>
                  </button>
                </div>

                {conversation.participants.map((p, idx) => (
                  <div key={p.id} className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400">成員 #{idx + 1}</span>
                      {conversation.participants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateConversation({
                              ...conversation,
                              participants: conversation.participants.filter((item) => item.id !== p.id),
                            });
                          }}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">暱稱</label>
                        <input
                          type="text"
                          value={p.name}
                          onChange={(e) => {
                            const updated = [...conversation.participants];
                            updated[idx].name = e.target.value;
                            onUpdateConversation({ ...conversation, participants: updated });
                          }}
                          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">頭像 URL</label>
                        <input
                          type="text"
                          value={p.avatar || ''}
                          placeholder="https://..."
                          onChange={(e) => {
                            const updated = [...conversation.participants];
                            updated[idx].avatar = e.target.value;
                            onUpdateConversation({ ...conversation, participants: updated });
                          }}
                          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs text-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: DEVICE & SETTINGS ================= */}
        {activeTab === 'device' && (
          <div className="space-y-4">
            {/* Pro Status / Upgrade Banner */}
            <div className={`p-4 rounded-2xl border transition-all ${
              proStatus?.isPro
                ? 'bg-gradient-to-r from-emerald-950/50 to-slate-900 border-emerald-500/40 shadow-md shadow-emerald-500/10'
                : 'bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 border-amber-500/40'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400">
                    <Crown size={14} />
                  </span>
                  <span className="text-xs font-black text-white">
                    {proStatus?.isPro ? 'PRO 尊榮會員已生效' : '升級 PRO 商業特權'}
                  </span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  proStatus?.isPro ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {proStatus?.isPro ? 'UNLOCKED' : 'NT$39 起'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mb-3 leading-relaxed">
                {proStatus?.isPro
                  ? `您享有無限次 4K 截圖、60FPS 影片錄製與完全無浮水印導出特權。`
                  : '解鎖 100% 無浮水印、3x 4K 超高畫質截圖與 60FPS 短影音錄影。'}
              </p>
              {onOpenUpgrade && (
                <button
                  type="button"
                  onClick={onOpenUpgrade}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    proStatus?.isPro
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                      : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black shadow-md'
                  }`}
                >
                  <Sparkles size={13} />
                  <span>{proStatus?.isPro ? '管理 PRO 授權狀態' : '立即升級 PRO / 啟用金鑰'}</span>
                </button>
              )}
            </div>

            <div className="rounded-2xl bg-slate-800/70 p-4 border border-slate-700/70 shadow-lg space-y-4">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                外觀與機型細節
              </h3>

              {/* Dark Mode */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-xs font-semibold text-white">深色模式 (Dark Mode)</p>
                  <p className="text-[11px] text-slate-400">切換 LINE 夜間經典墨綠/深藍配色</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.darkMode}
                  onChange={(e) => onUpdateSettings({ ...settings, darkMode: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 bg-slate-900 border-slate-700"
                />
              </div>

              {/* Phone Model */}
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  外框樣式
                </label>
                <select
                  value={settings.phoneModel}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, phoneModel: e.target.value as PhoneModel })
                  }
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="iphone-17-pro">iPhone 17 Pro (動態島 Dynamic Island)</option>
                  <option value="iphone-16">iPhone 16</option>
                  <option value="pixel-8">Android (置中挖孔 Punch-Hole)</option>
                  <option value="screen-only">純螢幕無外框 (Screen Only)</option>
                </select>
              </div>

              {/* Status Bar Settings */}
              <div className="space-y-3 pt-2 border-t border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">顯示狀態列</span>
                  <input
                    type="checkbox"
                    checked={settings.showStatusBar}
                    onChange={(e) =>
                      onUpdateSettings({ ...settings, showStatusBar: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">狀態列時間</label>
                    <input
                      type="text"
                      value={settings.statusBarTime}
                      onChange={(e) =>
                        onUpdateSettings({ ...settings, statusBarTime: e.target.value })
                      }
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">網路類型</label>
                    <select
                      value={settings.networkType}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          networkType: e.target.value as LineSettings['networkType'],
                        })
                      }
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-white"
                    >
                      <option value="5G">5G</option>
                      <option value="LTE">LTE</option>
                      <option value="4G">4G</option>
                      <option value="WiFi">WiFi</option>
                    </select>
                  </div>
                </div>

                {/* Battery Slider */}
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>電量：{settings.batteryLevel}%</span>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.isCharging}
                        onChange={(e) =>
                          onUpdateSettings({ ...settings, isCharging: e.target.checked })
                        }
                        className="rounded text-emerald-500"
                      />
                      <span>充電中</span>
                    </label>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={settings.batteryLevel}
                    onChange={(e) =>
                      onUpdateSettings({ ...settings, batteryLevel: parseInt(e.target.value, 10) })
                    }
                    className="w-full accent-emerald-500"
                  />
                </div>
              </div>

              {/* Behavior Settings */}
              <div className="space-y-3 pt-2 border-t border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-white">自動時間步進</p>
                    <p className="text-[11px] text-slate-400">新增訊息時自動遞增時間</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoStepTimes}
                    onChange={(e) =>
                      onUpdateSettings({ ...settings, autoStepTimes: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-white">顯示「已讀」狀態</p>
                    <p className="text-[11px] text-slate-400">我方訊息顯示已讀/已讀人數</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showReadReceipts}
                    onChange={(e) =>
                      onUpdateSettings({ ...settings, showReadReceipts: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-white">音效開關</p>
                    <p className="text-[11px] text-slate-400">播放快門聲、鍵盤打字音與傳送通知音</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enableSoundEffects}
                    onChange={(e) =>
                      onUpdateSettings({ ...settings, enableSoundEffects: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700"
                  />
                </div>
              </div>

              {/* Custom Wallpaper */}
              <div className="pt-2 border-t border-slate-700">
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  自訂聊天室背景圖片 (Wallpaper URL)
                </label>
                <input
                  type="text"
                  placeholder="留空使用預設經典色，或輸入圖片網址..."
                  value={settings.wallpaper || ''}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, wallpaper: e.target.value })
                  }
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* JSON Project Backup */}
              <div className="pt-2 border-t border-slate-700 flex gap-2">
                <button
                  type="button"
                  onClick={onExportJson}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5"
                >
                  <Download size={14} />
                  <span>備份專案 JSON</span>
                </button>
                <label className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload size={14} />
                  <span>載入 JSON</span>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        onImportJson(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: SCRIPT MODE ================= */}
        {activeTab === 'script' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-800/70 p-4 border border-slate-700/70 shadow-lg space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileCode size={15} className="text-[#06C755]" />
                純文字劇本快速匯入
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                直接貼上純文字劇本，系統將自動解析為發送者與接收者訊息：
              </p>

              <div className="p-3 rounded-xl bg-slate-950 font-mono text-[11px] text-emerald-400/90 leading-normal border border-slate-800 select-all">
                我: 早安！今天出發了嗎？<br />
                雨晴: 早！剛剛電車誤點<br />
                我: 那約側門碰面？<br />
                雨晴: 好喔，我大概 10 分鐘後到<br />
                [系統]: 小明 已加入群組<br />
                雨晴: [貼圖]
              </div>

              <textarea
                value={scriptInput}
                onChange={(e) => setScriptInput(e.target.value)}
                placeholder="在此貼上劇本內容..."
                rows={8}
                className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono leading-relaxed resize-none"
              />

              <button
                type="button"
                onClick={handleParseScript}
                disabled={!scriptInput.trim()}
                className="w-full py-2.5 rounded-xl bg-[#06C755] hover:bg-[#05b34c] disabled:opacity-40 text-white font-bold text-xs shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-1.5"
              >
                <Plus size={16} />
                <span>立即解析並匯入</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
