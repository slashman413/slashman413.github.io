import { LineMessage, Participant } from '../types/line';

export function parseScriptToMessages(
  scriptText: string,
  participants: Participant[],
  startTime: string = '09:41',
  stepMinutes: number = 1
): LineMessage[] {
  const lines = scriptText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const messages: LineMessage[] = [];

  // Parse time
  const timeParts = startTime.split(':').map((p) => parseInt(p, 10));
  let currentHour = isNaN(timeParts[0]) ? 9 : timeParts[0];
  let currentMinute = isNaN(timeParts[1]) ? 41 : timeParts[1];

  function formatTime(h: number, m: number): string {
    const hh = h.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    return `${hh}:${mm}`;
  }

  lines.forEach((line) => {
    // Check if system message: [系統]: xxx or [System]: xxx or --- xxx ---
    if (line.startsWith('[系統]') || line.startsWith('[System]') || (line.startsWith('---') && line.endsWith('---'))) {
      const clean = line.replace(/^\[(系統|System)\]:?\s*/i, '').replace(/^---+\s*/, '').replace(/\s*---+$/, '');
      messages.push({
        id: 'msg-' + Math.random().toString(36).substr(2, 9),
        type: 'system_event',
        isSender: false,
        time: formatTime(currentHour, currentMinute),
        status: 'none',
        text: clean,
      });
      return;
    }

    // Split by colon: "Name: Content" or "Name：Content"
    const colonIdx = line.indexOf(':') !== -1 ? line.indexOf(':') : line.indexOf('：');
    let senderPart = '我';
    let contentPart = line;

    if (colonIdx !== -1) {
      senderPart = line.substring(0, colonIdx).trim();
      contentPart = line.substring(colonIdx + 1).trim();
    }

    const isMe =
      senderPart.toLowerCase() === '我' ||
      senderPart.toLowerCase() === 'me' ||
      senderPart.toLowerCase() === 'myself';

    // Find participant if not me
    let matchedSenderId: string | undefined = undefined;
    if (!isMe) {
      const found = participants.find(
        (p) => p.name.toLowerCase() === senderPart.toLowerCase()
      );
      if (found) {
        matchedSenderId = found.id;
      } else if (participants.length > 0) {
        matchedSenderId = participants[0].id;
      }
    }

    // Check message content syntax
    let type: LineMessage['type'] = 'text';
    let text: string | undefined = contentPart;
    let audioDuration: number | undefined = undefined;
    let mediaUrl: string | undefined = undefined;

    if (contentPart.startsWith('[語音') || contentPart.startsWith('[Voice')) {
      type = 'voice';
      const match = contentPart.match(/\d+/);
      audioDuration = match ? parseInt(match[0], 10) : 12;
      text = undefined;
    } else if (contentPart.startsWith('[貼圖]') || contentPart.startsWith('[Sticker]')) {
      type = 'sticker';
      text = undefined;
    } else if (contentPart.startsWith('[圖片]') || contentPart.startsWith('[Photo]') || contentPart.startsWith('[Image]')) {
      type = 'photo';
      text = undefined;
    } else if (contentPart.startsWith('[收回]') || contentPart.startsWith('[Unsent]')) {
      type = 'deleted';
      text = isMe ? '您已收回訊息' : `${senderPart} 已收回訊息`;
    }

    messages.push({
      id: 'msg-' + Math.random().toString(36).substr(2, 9),
      type,
      isSender: isMe,
      senderId: matchedSenderId,
      time: formatTime(currentHour, currentMinute),
      status: isMe ? 'read' : 'none',
      text,
      audioDuration,
      mediaUrl,
    });

    // Step time forward
    currentMinute += stepMinutes;
    if (currentMinute >= 60) {
      currentHour = (currentHour + Math.floor(currentMinute / 60)) % 24;
      currentMinute = currentMinute % 60;
    }
  });

  return messages;
}
