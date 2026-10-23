import React from 'react';
import { PhoneModel } from '../types/line';

interface PhoneFrameProps {
  model: PhoneModel;
  enableFrame: boolean;
  children: React.ReactNode;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({
  model,
  enableFrame,
  children,
}) => {
  if (!enableFrame || model === 'screen-only') {
    return (
      <div className="relative w-full max-w-[390px] h-[780px] overflow-hidden rounded-[24px] shadow-2xl border border-slate-700/50 flex flex-col bg-slate-900">
        {children}
      </div>
    );
  }

  // iPhone 17 Pro Frame
  return (
    <div className="relative mx-auto w-full max-w-[400px] h-[820px] rounded-[52px] p-[10px] bg-gradient-to-b from-[#4A4D52] via-[#2A2B2E] to-[#1E1F21] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7),inset_0_1px_2px_rgba(255,255,255,0.4)] border border-[#5A5D62]">
      {/* Outer Titanium Rim */}
      <div className="relative w-full h-full rounded-[44px] overflow-hidden bg-black flex flex-col border-[3px] border-[#161618]">
        {/* Dynamic Island (iPhone 17 Pro) */}
        {model === 'iphone-17-pro' && (
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-40 w-[112px] h-[28px] rounded-full bg-black flex items-center justify-between px-2.5 shadow-sm">
            {/* Front Camera */}
            <div className="w-3 h-3 rounded-full bg-[#18181B] border border-slate-800 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-[#0E3553]/70" />
            </div>
            {/* Face ID / Sensor */}
            <div className="w-2.5 h-2.5 rounded-full bg-[#0F0F12]" />
          </div>
        )}

        {/* Android Punch Hole */}
        {model === 'pixel-8' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 w-4 h-4 rounded-full bg-black flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-[#1A2535]" />
          </div>
        )}

        {/* Screen Content */}
        <div className="relative flex-1 w-full h-full flex flex-col overflow-hidden">
          {children}
        </div>

        {/* iOS Home Indicator Bar */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-30 w-32 h-1 rounded-full bg-slate-400/40 pointer-events-none select-none" />
      </div>
    </div>
  );
};
