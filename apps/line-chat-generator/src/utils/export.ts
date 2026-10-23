import { toPng } from 'html-to-image';
import confetti from 'canvas-confetti';
import { playShutterSound } from './sounds';

export interface CaptureOptions {
  scale?: number;
  filename?: string;
  watermark?: boolean;
  watermarkText?: string;
  isPro?: boolean;
}

export async function captureScreenshot(
  elementId: string,
  options: number | CaptureOptions = 2,
  legacyFilename: string = 'line-chat-screenshot.png'
): Promise<string> {
  const node = document.getElementById(elementId);
  if (!node) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  // Normalize options
  let scale = 2;
  let filename = legacyFilename;
  let watermark = false;
  let watermarkText = 'Created with slashmantools.us/line-chat-generator';
  let isPro = false;

  if (typeof options === 'number') {
    scale = options;
  } else if (typeof options === 'object') {
    scale = options.scale ?? 2;
    filename = options.filename ?? `line-chat-${Date.now()}.png`;
    watermark = options.watermark ?? false;
    watermarkText = options.watermarkText ?? watermarkText;
    isPro = options.isPro ?? false;
  }

  // Trigger Camera Flash Overlay
  const flash = document.createElement('div');
  flash.style.position = 'fixed';
  flash.style.inset = '0';
  flash.style.backgroundColor = 'white';
  flash.style.opacity = '0.75';
  flash.style.zIndex = '999999';
  flash.style.pointerEvents = 'none';
  flash.style.transition = 'opacity 0.4s ease-out';
  document.body.appendChild(flash);

  playShutterSound();

  requestAnimationFrame(() => {
    flash.style.opacity = '0';
    setTimeout(() => {
      if (flash.parentNode) flash.parentNode.removeChild(flash);
    }, 450);
  });

  // Temporarily inject watermark element if watermark is requested and not Pro
  let watermarkEl: HTMLDivElement | null = null;
  if (watermark && !isPro) {
    watermarkEl = document.createElement('div');
    watermarkEl.id = 'temp-export-watermark';
    watermarkEl.style.position = 'absolute';
    watermarkEl.style.bottom = '68px';
    watermarkEl.style.right = '12px';
    watermarkEl.style.backgroundColor = 'rgba(0, 0, 0, 0.45)';
    watermarkEl.style.color = '#ffffff';
    watermarkEl.style.padding = '3px 8px';
    watermarkEl.style.borderRadius = '6px';
    watermarkEl.style.fontSize = '11px';
    watermarkEl.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    watermarkEl.style.fontWeight = '600';
    watermarkEl.style.letterSpacing = '0.3px';
    watermarkEl.style.backdropFilter = 'blur(4px)';
    watermarkEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    watermarkEl.style.zIndex = '50';
    watermarkEl.style.pointerEvents = 'none';
    watermarkEl.innerText = watermarkText;
    node.appendChild(watermarkEl);
  }

  try {
    const dataUrl = await toPng(node, {
      pixelRatio: scale,
      cacheBust: true,
      skipAutoScale: true,
      style: {
        transform: 'none',
      },
    });

    // Auto-download file
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();

    // Celebration confetti
    confetti({
      particleCount: isPro ? 70 : 35,
      spread: isPro ? 80 : 50,
      origin: { y: 0.8 },
      colors: isPro
        ? ['#F59E0B', '#10B981', '#06C755', '#EAB308', '#FFFFFF']
        : ['#06C755', '#9CEB68', '#FFFFFF', '#38BDF8'],
    });

    return dataUrl;
  } catch (err) {
    console.error('Failed to capture screenshot:', err);
    throw err;
  } finally {
    // Clean up temporary watermark
    if (watermarkEl && watermarkEl.parentNode) {
      watermarkEl.parentNode.removeChild(watermarkEl);
    }
  }
}
