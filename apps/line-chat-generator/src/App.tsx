import React, { useState, useEffect, useRef } from 'react';
import {
  LineChatProject,
  LineMessage,
  LineSettings,
  ConversationInfo,
  LINE_COLORS,
} from './types/line';
import { PRESET_TEMPLATES } from './utils/templates';
import { Header } from './components/Header';
import { EditorDrawer } from './components/EditorDrawer';
import { PhoneFrame } from './components/PhoneFrame';
import { StatusBar } from './components/StatusBar';
import { LineHeader } from './components/LineHeader';
import { LineFooter } from './components/LineFooter';
import { MessageBubble } from './components/MessageBubble';
import { LivePlayerBar } from './components/LivePlayerBar';
import { LegalModal } from './components/LegalModal';
import { ProUpgradeModal } from './components/ProUpgradeModal';
import { PhotoDownloadModal } from './components/PhotoDownloadModal';
import { VideoDownloadModal } from './components/VideoDownloadModal';
import { captureScreenshot } from './utils/export';
import { getProStatus, ProStatus } from './utils/proStore';
import {
  playTypingSound,
  playSentSound,
  playReceivedSound,
} from './utils/sounds';
import confetti from 'canvas-confetti';

export const App: React.FC = () => {
  // Main Project State
  const [project, setProject] = useState<LineChatProject>(PRESET_TEMPLATES.romantic);

  // Pro & Monetization State
  const [proStatus, setProStatus] = useState<ProStatus>(getProStatus());
  const [isUpgradeOpen, setIsUpgradeOpen] = useState<boolean>(false);
  const [isPhotoDownloadOpen, setIsPhotoDownloadOpen] = useState<boolean>(false);
  const [isVideoDownloadOpen, setIsVideoDownloadOpen] = useState<boolean>(false);
  const [isRecordingWatermark, setIsRecordingWatermark] = useState<boolean>(false);

  // Responsive mobile view tab
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('preview');

  // Playback & Animation State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlaybackStep, setCurrentPlaybackStep] = useState<number>(
    project.messages.length
  );
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [typedDraft, setTypedDraft] = useState<string>('');
  const [isReceiverTyping, setIsReceiverTyping] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isLegalOpen, setIsLegalOpen] = useState<boolean>(false);

  // Chat scroll container ref
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const currentStreamRef = useRef<MediaStream | null>(null);

  // Listen to pro status changes across tabs/windows
  useEffect(() => {
    const handleProUpdate = () => {
      setProStatus(getProStatus());
    };
    window.addEventListener('line_chat_pro_updated', handleProUpdate);
    window.addEventListener('storage', handleProUpdate);
    return () => {
      window.removeEventListener('line_chat_pro_updated', handleProUpdate);
      window.removeEventListener('storage', handleProUpdate);
    };
  }, []);

  // Smooth auto-scroll to bottom
  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  // Synchronize playback step when project messages change
  useEffect(() => {
    if (!isPlaying) {
      setCurrentPlaybackStep(project.messages.length);
    }
  }, [project.messages.length, isPlaying]);

  useEffect(() => {
    scrollToBottom();
  }, [currentPlaybackStep, isReceiverTyping]);

  // Live Playback Engine
  useEffect(() => {
    if (!isPlaying) return;

    // Check if finished
    if (currentPlaybackStep >= project.messages.length) {
      setIsPlaying(false);
      setTypedDraft('');
      setIsReceiverTyping(false);
      return;
    }

    const nextMsg = project.messages[currentPlaybackStep];
    let isCancelled = false;

    const baseDelay = 1000 / playbackSpeed;

    const runStep = async () => {
      if (nextMsg.isSender) {
        // Sender typing simulation
        const textToType = nextMsg.text || '...';
        const chars = textToType.split('');
        let currentString = '';

        for (let i = 0; i < chars.length; i++) {
          if (isCancelled) return;
          currentString += chars[i];
          setTypedDraft(currentString);
          if (project.settings.enableSoundEffects && i % 2 === 0) {
            playTypingSound();
          }
          await new Promise((r) => setTimeout(r, Math.max(30, 80 / playbackSpeed)));
        }

        // Small pause before sending
        await new Promise((r) => setTimeout(r, 250 / playbackSpeed));
        if (isCancelled) return;

        setTypedDraft('');
        if (project.settings.enableSoundEffects) {
          playSentSound();
        }
        setCurrentPlaybackStep((prev) => prev + 1);
      } else {
        // Receiver typing indicator (3 dots)
        setIsReceiverTyping(true);
        await new Promise((r) => setTimeout(r, baseDelay * 0.9));
        if (isCancelled) return;

        setIsReceiverTyping(false);
        if (project.settings.enableSoundEffects) {
          playReceivedSound();
        }
        setCurrentPlaybackStep((prev) => prev + 1);
      }
    };

    runStep();

    return () => {
      isCancelled = true;
    };
  }, [isPlaying, currentPlaybackStep, project.messages, playbackSpeed, project.settings.enableSoundEffects]);

  // Handle Play/Pause
  const handleTogglePlay = () => {
    if (currentPlaybackStep >= project.messages.length) {
      setCurrentPlaybackStep(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  // Reset Playback
  const handleResetPlayback = () => {
    setIsPlaying(false);
    setCurrentPlaybackStep(0);
    setTypedDraft('');
    setIsReceiverTyping(false);
  };

  // Handle PNG Export with Options (Free vs Pro)
  const handleExportPngWithOptions = async ({
    scale,
    watermark,
    isPro,
  }: {
    scale: number;
    watermark: boolean;
    isPro: boolean;
  }) => {
    setIsExporting(true);
    try {
      await captureScreenshot('line-chat-screen-capture', {
        scale: isPro ? Math.max(scale, 3) : scale,
        watermark: watermark && !isPro,
        isPro: isPro,
        filename: `line-chat-${isPro ? 'pro-4k-' : ''}${Date.now()}.png`,
      });
    } catch (err) {
      alert('截圖生成失敗，請稍後再試！');
    } finally {
      setIsExporting(false);
    }
  };

  // Start Video Recording
  const handleStartRecording = async ({
    watermark,
    fps,
    isPro,
  }: {
    watermark: boolean;
    fps: number;
    isPro: boolean;
  }) => {
    try {
      setIsRecordingWatermark(watermark && !isPro);

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          frameRate: isPro ? fps : 30,
        },
        audio: false,
      });
      currentStreamRef.current = stream;

      recordedChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `line-chat-video-${isPro ? 'pro-' : ''}${Date.now()}.webm`;
        a.click();
        stream.getTracks().forEach((track) => track.stop());
        setIsRecordingWatermark(false);
        setIsRecording(false);

        // Celebration
        confetti({
          particleCount: isPro ? 80 : 40,
          spread: isPro ? 90 : 60,
          origin: { y: 0.8 },
          colors: isPro
            ? ['#F59E0B', '#10B981', '#06C755', '#EAB308', '#FFFFFF']
            : ['#06C755', '#9CEB68', '#FFFFFF', '#38BDF8'],
        });
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Auto start playback from beginning!
      setCurrentPlaybackStep(0);
      setIsPlaying(true);
    } catch (err) {
      console.log('Video recording cancelled or not supported');
      setIsRecordingWatermark(false);
      setIsRecording(false);
    }
  };

  // Stop Video Recording
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  // Export Project JSON
  const handleExportJson = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(project, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `${project.title || 'line-chat-project'}.json`
    );
    downloadAnchor.click();
  };

  // Import Project JSON
  const handleImportJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (parsed.settings && parsed.conversation && parsed.messages) {
          setProject(parsed);
          setCurrentPlaybackStep(parsed.messages.length);
        } else {
          alert('無效的 LINE 專案檔案格式！');
        }
      } catch (err) {
        alert('解析專案檔案失敗！');
      }
    };
    reader.readAsText(file);
  };

  // Theme settings
  const theme = project.settings.darkMode ? LINE_COLORS.dark : LINE_COLORS.light;
  const visibleMessages = project.messages.slice(0, currentPlaybackStep);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-[#06C755] selection:text-white">
      {/* Top Application Header */}
      <Header
        onOpenPhotoDownload={() => setIsPhotoDownloadOpen(true)}
        isExporting={isExporting}
        onSelectTemplate={(tpl) => {
          setProject(tpl);
          setCurrentPlaybackStep(tpl.messages.length);
        }}
        onOpenLegal={() => setIsLegalOpen(true)}
        onOpenUpgrade={() => setIsUpgradeOpen(true)}
        proStatus={proStatus}
        darkMode={project.settings.darkMode}
        onToggleDarkMode={() =>
          setProject((prev) => ({
            ...prev,
            settings: { ...prev.settings, darkMode: !prev.settings.darkMode },
          }))
        }
        language={project.settings.language}
        onChangeLanguage={(lang) =>
          setProject((prev) => ({
            ...prev,
            settings: { ...prev.settings, language: lang },
          }))
        }
      />

      {/* Mobile Tab Switcher */}
      <div className="lg:hidden flex border-b border-slate-800 bg-slate-900 px-4 py-2 gap-2">
        <button
          type="button"
          onClick={() => setMobileTab('editor')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
            mobileTab === 'editor'
              ? 'bg-[#06C755] text-white shadow'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          對話編輯器
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('preview')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
            mobileTab === 'preview'
              ? 'bg-[#06C755] text-white shadow'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          手機畫面預覽
        </button>
      </div>

      {/* Main Workspace Layout (Split Screen) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Control Drawer (Desktop: fixed width; Mobile: full width if tab active) */}
        <div
          className={`w-full lg:w-[420px] shrink-0 h-full border-r border-slate-800 overflow-hidden ${
            mobileTab === 'editor' ? 'block' : 'hidden lg:block'
          }`}
        >
          <EditorDrawer
            messages={project.messages}
            onUpdateMessages={(msgs) => setProject({ ...project, messages: msgs })}
            conversation={project.conversation}
            onUpdateConversation={(conv) =>
              setProject({ ...project, conversation: conv })
            }
            settings={project.settings}
            onUpdateSettings={(settings) => setProject({ ...project, settings })}
            onExportJson={handleExportJson}
            onImportJson={handleImportJson}
            proStatus={proStatus}
            onOpenUpgrade={() => setIsUpgradeOpen(true)}
          />
        </div>

        {/* Right Preview Canvas */}
        <div
          className={`flex-1 flex flex-col items-center justify-between p-4 md:p-6 overflow-y-auto bg-radial from-slate-900 via-slate-950 to-slate-950 ${
            mobileTab === 'preview' ? 'block' : 'hidden lg:flex'
          }`}
        >
          {/* Centered Phone Preview Box */}
          <div className="flex-1 w-full flex items-center justify-center my-2">
            <div className="relative transform-gpu transition-all">
              <PhoneFrame
                model={project.settings.phoneModel}
                enableFrame={project.settings.phoneFrame}
              >
                {/* Captured Screen Container */}
                <div
                  id="line-chat-screen-capture"
                  className="relative flex flex-col w-full h-full overflow-hidden select-none"
                  style={{
                    backgroundColor: theme.bg,
                    backgroundImage: project.settings.wallpaper
                      ? `url(${project.settings.wallpaper})`
                      : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  {/* Status Bar */}
                  <StatusBar settings={project.settings} />

                  {/* LINE Header */}
                  <LineHeader
                    conversation={project.conversation}
                    settings={project.settings}
                  />

                  {/* Chat Messages Scroll Container */}
                  <div
                    ref={chatScrollRef}
                    className="flex-1 overflow-y-auto px-3.5 py-3 space-y-1 scroll-smooth"
                    style={{
                      WebkitOverflowScrolling: 'touch',
                      scrollbarWidth: 'none',
                    }}
                  >
                    {/* Date pill separator */}
                    {project.settings.showConversationDate && (
                      <div className="my-2.5 flex justify-center text-center select-none">
                        <span
                          className="rounded-full px-3 py-1 text-[11px] font-semibold backdrop-blur-md shadow-sm"
                          style={{
                            backgroundColor: theme.sectionHeaderBg,
                            color: theme.sectionHeaderText,
                          }}
                        >
                          {project.settings.conversationDateText ||
                            '2026年10月21日 星期三'}
                        </span>
                      </div>
                    )}

                    {/* Rendered Messages */}
                    {visibleMessages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        settings={project.settings}
                        participants={project.conversation.participants}
                        isGroupChat={project.conversation.isGroupChat}
                      />
                    ))}

                    {/* Receiver Bouncing Dots Typing Animation */}
                    {isReceiverTyping && (
                      <div className="my-1 flex items-end gap-1.5 animate-in fade-in duration-150">
                        <div className="size-9 rounded-full overflow-hidden bg-slate-300 shrink-0">
                          {project.conversation.participants[0]?.avatar ? (
                            <img
                              src={project.conversation.participants[0].avatar}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <div
                              className="size-full flex items-center justify-center font-bold text-white text-xs"
                              style={{
                                backgroundColor:
                                  project.conversation.participants[0]?.color ||
                                  '#06C755',
                              }}
                            >
                              {project.conversation.headerName.slice(0, 1)}
                            </div>
                          )}
                        </div>
                        <div
                          className="rounded-[18px] px-3.5 py-3 shadow-sm flex items-center gap-1"
                          style={{
                            backgroundColor: theme.receiverBubble,
                            boxShadow: theme.bubbleShadow,
                          }}
                        >
                          <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* LINE Footer Input Bar */}
                  <LineFooter
                    settings={project.settings}
                    typedDraft={typedDraft}
                  />

                  {/* Free Video Recording Watermark Overlay */}
                  {isRecordingWatermark && (
                    <div className="absolute bottom-16 right-3 pointer-events-none select-none text-[10px] font-bold text-white/95 bg-black/60 px-2.5 py-1 rounded-md backdrop-blur-md border border-white/20 shadow-xl z-30 flex items-center gap-1.5 animate-in fade-in">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>⚡ LineChatGen • slashmantools.us</span>
                    </div>
                  )}

                  {/* User Custom Watermark Notice (if enabled in settings) */}
                  {project.settings.showWatermark && (
                    <div className="absolute bottom-14 right-2 pointer-events-none select-none text-[10px] font-bold text-white/50 bg-black/30 px-2 py-0.5 rounded backdrop-blur-sm">
                      {project.settings.watermarkText}
                    </div>
                  )}
                </div>
              </PhoneFrame>
            </div>
          </div>

          {/* Floating Live Playback Bar */}
          <div className="w-full max-w-xl my-2 shrink-0">
            <LivePlayerBar
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              onReset={handleResetPlayback}
              playbackSpeed={playbackSpeed}
              onChangeSpeed={(s) => setPlaybackSpeed(s)}
              isSoundEnabled={project.settings.enableSoundEffects}
              onToggleSound={() =>
                setProject((prev) => ({
                  ...prev,
                  settings: {
                    ...prev.settings,
                    enableSoundEffects: !prev.settings.enableSoundEffects,
                  },
                }))
              }
              onRecordClick={
                isRecording
                  ? handleStopRecording
                  : () => setIsVideoDownloadOpen(true)
              }
              isRecording={isRecording}
              currentStep={currentPlaybackStep}
              totalSteps={project.messages.length}
              proStatus={proStatus}
            />
          </div>
        </div>
      </div>

      {/* Photo Download & Format Modal */}
      <PhotoDownloadModal
        isOpen={isPhotoDownloadOpen}
        onClose={() => setIsPhotoDownloadOpen(false)}
        onExport={handleExportPngWithOptions}
        isExporting={isExporting}
        proStatus={proStatus}
        onOpenUpgrade={() => {
          setIsPhotoDownloadOpen(false);
          setIsUpgradeOpen(true);
        }}
      />

      {/* Video Download & Format Modal */}
      <VideoDownloadModal
        isOpen={isVideoDownloadOpen}
        onClose={() => setIsVideoDownloadOpen(false)}
        onStartRecording={handleStartRecording}
        isRecording={isRecording}
        proStatus={proStatus}
        onOpenUpgrade={() => {
          setIsVideoDownloadOpen(false);
          setIsUpgradeOpen(true);
        }}
      />

      {/* Pro Membership / Monetization Upgrade Modal */}
      <ProUpgradeModal
        isOpen={isUpgradeOpen}
        onClose={() => setIsUpgradeOpen(false)}
        proStatus={proStatus}
        onStatusChange={(newStatus) => setProStatus(newStatus)}
      />

      {/* Compliance / Legal Terms Modal */}
      <LegalModal
        isOpen={isLegalOpen}
        onClose={() => setIsLegalOpen(false)}
      />
    </div>
  );
};
