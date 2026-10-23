import React from 'react';
import { Wifi, Battery, BatteryCharging } from 'lucide-react';
import { LineSettings } from '../types/line';

interface StatusBarProps {
  settings: LineSettings;
}

export const StatusBar: React.FC<StatusBarProps> = ({ settings }) => {
  if (!settings.showStatusBar) return null;

  const isDark = settings.darkMode;
  const textColor = isDark ? '#FFFFFF' : '#111827';

  return (
    <div
      className="relative z-30 flex h-11 w-full items-center justify-between px-7 text-xs font-semibold select-none shrink-0"
      style={{ color: textColor }}
    >
      {/* Left: Time */}
      <div className="flex items-center gap-1">
        <span className="text-[14px] font-bold tracking-tight">
          {settings.statusBarTime || '09:41'}
        </span>
      </div>

      {/* Right: Cellular, WiFi, Battery */}
      <div className="flex items-center gap-2">
        {/* Cellular Bars */}
        <div className="flex items-end gap-[1.5px] h-3">
          {[1, 2, 3, 4].map((bar) => (
            <div
              key={bar}
              className="w-[3px] rounded-sm transition-colors"
              style={{
                height: `${bar * 2.5 + 2}px`,
                backgroundColor:
                  bar <= settings.cellularSignal ? textColor : isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)',
              }}
            />
          ))}
        </div>

        {/* 5G / LTE */}
        {settings.networkType !== 'WiFi' && (
          <span className="text-[11px] font-bold tracking-tighter">
            {settings.networkType}
          </span>
        )}

        {/* WiFi */}
        {settings.networkType === 'WiFi' && (
          <Wifi size={14} strokeWidth={2.5} className="shrink-0" />
        )}

        {/* Battery */}
        <div className="flex items-center gap-1 pl-0.5">
          <span className="text-[11px] font-medium tabular-nums">
            {settings.batteryLevel}%
          </span>
          <div className="relative flex items-center">
            {settings.isCharging ? (
              <BatteryCharging size={18} className="text-emerald-500 fill-emerald-500/20" />
            ) : (
              <div className="relative flex items-center">
                <Battery size={20} strokeWidth={2} />
                <div
                  className="absolute left-[2.5px] top-[4.5px] h-[7px] rounded-[1px]"
                  style={{
                    width: `${Math.max(2, (settings.batteryLevel / 100) * 11)}px`,
                    backgroundColor:
                      settings.batteryLevel <= 20
                        ? '#EF4444'
                        : isDark
                        ? '#FFFFFF'
                        : '#111827',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
