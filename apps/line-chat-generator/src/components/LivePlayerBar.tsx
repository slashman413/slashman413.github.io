import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Video,
  Crown,
  Sparkles,
} from 'lucide-react';
import { ProStatus } from '../utils/proStore';

interface LivePlayerBarProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  playbackSpeed: number;
  onChangeSpeed: (speed: number) => void;
  isSoundEnabled: boolean;
  onToggleSound: () => void;
  onRecordClick: () => void;
  isRecording: boolean;
  currentStep: number;
  totalSteps: number;
  proStatus: ProStatus;
}

export const LivePlayerBar: React.FC<LivePlayerBarProps> = ({
  isPlaying,
  onTogglePlay,
  onReset,
  playbackSpeed,
  onChangeSpeed,
  isSoundEnabled,
  onToggleSound,
  onRecordClick,
  isRecording,
  currentStep,
  totalSteps,
  proStatus,
}) => {
  const speeds = [0.75, 1, 1.5, 2];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-800/90 backdrop-blur-md p-3 px-4 border border-slate-700/80 shadow-xl text-slate-100">
      {/* Left: Play/Pause & Reset */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onTogglePlay}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#06C755] text-white hover:bg-[#05a847] shadow-lg transition-transform active:scale-95"
          title={isPlaying ? '暫停播放' : '開始動態播放'}
        >
          {isPlaying ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" className="translate-x-[1px]" />
          )}
        </button>

        <button
          type="button"
          onClick={onReset}
          className="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-700/50 transition-colors"
          title="重置播放"
        >
          <RotateCcw size={18} />
        </button>

        <span className="text-xs font-semibold tabular-nums text-slate-400 pl-1">
          {currentStep} / {totalSteps} 則訊息
        </span>
      </div>

      {/* Center: Playback Speed */}
      <div className="flex items-center gap-1 rounded-xl bg-slate-900/60 p-1 border border-slate-700/50 text-xs">
        {speeds.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChangeSpeed(s)}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              playbackSpeed === s
                ? 'bg-emerald-500 text-white font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Right: Sound & Video Export */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSound}
          className={`p-2 rounded-lg border transition-colors ${
            isSoundEnabled
              ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
              : 'text-slate-400 border-slate-700 hover:bg-slate-700/50'
          }`}
          title={isSoundEnabled ? '音效已開啟' : '音效已靜音'}
        >
          {isSoundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>

        <button
          type="button"
          onClick={onRecordClick}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
            isRecording
              ? 'bg-red-600 text-white animate-pulse'
              : proStatus.isPro
              ? 'bg-gradient-to-r from-amber-500 via-emerald-500 to-teal-500 text-white hover:opacity-95 active:scale-95 shadow-emerald-500/20'
              : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90 active:scale-95 shadow-teal-500/20'
          }`}
          title={
            isRecording
              ? '點擊停止錄影並下載'
              : proStatus.isPro
              ? 'PRO 60FPS 無浮水印錄影'
              : '錄製對話短影音'
          }
        >
          {isRecording ? (
            <>
              <span className="w-2 h-2 rounded-full bg-white animate-ping mr-0.5" />
              <span>停止錄製並下載</span>
            </>
          ) : (
            <>
              {proStatus.isPro ? (
                <Crown size={14} className="text-amber-200" />
              ) : (
                <Video size={14} />
              )}
              <span>{proStatus.isPro ? 'PRO 錄製影片' : '錄製影片'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
