export interface SubtitleSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

export interface SubtitleCue {
  id: string;
  startSec: number;
  endSec: number;
  lines: string[];
  /** Rich spans separated by '\n' in text when native formatting is present */
  spans: SubtitleSpan[];
  /** ASS numpad alignment 1..9 (2 = bottom-center, 8 = top-center) */
  alignment: number;
  /** Optional explicit normalized coordinates (0..100%) from ASS \pos(x,y) or VTT line */
  posXPercent?: number;
  posYPercent?: number;
  fontName?: string;
  /** Font size expressed as % of container height (based on PlayResY) */
  fontHeightPct?: number;
  primaryColor?: string;
  outlineColor?: string;
  outlinePx?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  hasNativeStyle: boolean;
}

/** Backwards-compatible alias */
export type WebVttCue = SubtitleCue;

const TIMESTAMP_PATTERN = /^(?:(\d{1,3}):)?(\d{2}):(\d{2})[.,](\d{3})$/;
const ASS_TIME_PATTERN = /^(\d{1,2}):(\d{2}):(\d{2})\.(\d{2,3})$/;

export function parseVttTimestamp(raw: string): number | null {
  const cleaned = raw.trim().split(/\s+/)[0] ?? '';
  const match = TIMESTAMP_PATTERN.exec(cleaned);
  if (!match) return null;

  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4]);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    !Number.isFinite(millis)
  ) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

export function parseAssTimestamp(raw: string): number | null {
  const match = ASS_TIME_PATTERN.exec(raw.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fracRaw = match[4];
  const millis = fracRaw.length === 2 ? Number(fracRaw) * 10 : Number(fracRaw);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

export function assColorToCss(assColor: string | undefined): string | undefined {
  if (!assColor) return undefined;
  const hex = assColor.trim().replace(/^&H/i, '').replace(/&$/, '');
  if (!/^[0-9a-f]{6,8}$/i.test(hex)) return undefined;
  const padded = hex.padStart(8, '0');
  const aa = parseInt(padded.slice(0, 2), 16);
  const bb = parseInt(padded.slice(2, 4), 16);
  const gg = parseInt(padded.slice(4, 6), 16);
  const rr = parseInt(padded.slice(6, 8), 16);
  // In ASS, alpha 00 = fully opaque, FF = fully transparent
  const alpha = Number((1 - aa / 255).toFixed(3));
  return `rgba(${rr}, ${gg}, ${bb}, ${alpha})`;
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function stripVttTags(rawLine: string): string {
  return decodeHtmlEntities(
    rawLine
      .replace(/\{\\[^}]*\}/g, '')
      .replace(/<[^>]+>/g, ''),
  ).trim();
}

const VTT_NAMED_COLORS: Record<string, string> = {
  white: '#f3f4f6',
  yellow: '#fde047',
  cyan: '#67e8f9',
  lime: '#86efac',
  magenta: '#f0abfc',
  red: '#fca5a5',
  blue: '#93c5fd',
};

function parseVttInlineSpans(rawText: string): { spans: SubtitleSpan[]; hasStyle: boolean } {
  const cleaned = rawText.replace(/\{\\[^}]*\}/g, '');
  const tokenRegex = /(<\/?(?:b|i|u|c(?:\.[^>\s]+)?)\b[^>]*>)/gi;
  const parts = cleaned.split(tokenRegex);

  let bold = false;
  let italic = false;
  let underline = false;
  let color: string | undefined;
  let hasStyle = false;
  const spans: SubtitleSpan[] = [];

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('<') && part.endsWith('>')) {
      const inner = part.slice(1, -1).trim().toLowerCase();
      if (inner === 'b') {
        bold = true;
        hasStyle = true;
      } else if (inner === '/b') {
        bold = false;
      } else if (inner === 'i') {
        italic = true;
        hasStyle = true;
      } else if (inner === '/i') {
        italic = false;
      } else if (inner === 'u') {
        underline = true;
        hasStyle = true;
      } else if (inner === '/u') {
        underline = false;
      } else if (inner.startsWith('c.')) {
        const cls = inner.slice(2).split('.')[0];
        if (VTT_NAMED_COLORS[cls]) {
          color = VTT_NAMED_COLORS[cls];
          hasStyle = true;
        }
      } else if (inner === '/c') {
        color = undefined;
      }
      continue;
    }

    const text = decodeHtmlEntities(part.replace(/<[^>]+>/g, ''));
    if (text.length > 0) {
      spans.push({ text, bold, italic, underline, color });
    }
  }

  return { spans, hasStyle };
}

export function parseWebVtt(vttText: string): SubtitleCue[] {
  const normalized = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const rawLines = blocks[i].split('\n').map((l) => l.trimEnd());
    if (rawLines.length === 0) continue;

    const first = rawLines[0].trim();
    if (
      first.startsWith('WEBVTT') ||
      first.startsWith('NOTE') ||
      first.startsWith('STYLE') ||
      first.startsWith('REGION')
    ) {
      continue;
    }

    const timeLineIdx = rawLines.findIndex((line) => line.includes('-->'));
    if (timeLineIdx === -1) continue;

    const timeLine = rawLines[timeLineIdx];
    const arrowParts = timeLine.split('-->');
    if (arrowParts.length < 2) continue;

    const startSec = parseVttTimestamp(arrowParts[0]);
    const endTokens = arrowParts[1].trim().split(/\s+/);
    const endSec = parseVttTimestamp(endTokens[0] ?? '');
    if (startSec === null || endSec === null || endSec <= startSec) {
      continue;
    }

    // Parse optional WebVTT cue settings (line:, align:)
    let alignment = 2;
    let posYPercent: number | undefined;
    let hasCuePosition = false;
    for (const setting of endTokens.slice(1)) {
      if (setting.startsWith('line:')) {
        const val = setting.slice(5);
        if (val.endsWith('%')) {
          const pct = Number(val.slice(0, -1));
          if (Number.isFinite(pct)) {
            posYPercent = Math.min(95, Math.max(5, pct));
            hasCuePosition = true;
          }
        } else if (val === '0' || val === 'start') {
          alignment = 8;
          hasCuePosition = true;
        }
      } else if (setting.startsWith('align:')) {
        const alignVal = setting.slice(6);
        if (alignVal === 'start' || alignVal === 'left') {
          alignment = alignment >= 7 ? 7 : 1;
          hasCuePosition = true;
        } else if (alignVal === 'end' || alignVal === 'right') {
          alignment = alignment >= 7 ? 9 : 3;
          hasCuePosition = true;
        }
      }
    }

    const cueId = timeLineIdx > 0 ? rawLines[0].trim() : `cue-${cues.length}`;
    const bodyRawLines = rawLines.slice(timeLineIdx + 1);
    const textLines = bodyRawLines.map(stripVttTags).filter((line) => line.length > 0);
    const joinedRaw = bodyRawLines.join('\n').trim();
    const { spans, hasStyle } = parseVttInlineSpans(joinedRaw);

    if (textLines.length > 0) {
      cues.push({
        id: `${cueId}-${cues.length}`,
        startSec,
        endSec,
        lines: textLines,
        spans: spans.length > 0 ? spans : [{ text: textLines.join('\n') }],
        alignment,
        posYPercent,
        hasNativeStyle: hasStyle || hasCuePosition,
      });
    }
  }

  return cues;
}

interface AssStyleDef {
  fontName: string;
  fontSize: number;
  primaryColor?: string;
  outlineColor?: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  outline: number;
  alignment: number;
}

function splitCsvWithTail(line: string, count: number): string[] {
  const result: string[] = [];
  let cursor = 0;
  for (let i = 0; i < count - 1; i += 1) {
    const commaIdx = line.indexOf(',', cursor);
    if (commaIdx === -1) {
      result.push(line.slice(cursor));
      cursor = line.length;
      break;
    }
    result.push(line.slice(cursor, commaIdx));
    cursor = commaIdx + 1;
  }
  result.push(line.slice(cursor));
  return result;
}

export function parseAssSubtitles(assText: string): SubtitleCue[] {
  const lines = assText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let section = '';
  let playResX = 384;
  let playResY = 288;
  let styleFields: string[] = [];
  let eventFields: string[] = [];
  const styles = new Map<string, AssStyleDef>();
  const cues: SubtitleCue[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).toLowerCase();
      continue;
    }

    if (section === 'script info') {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        const val = Number(line.slice(colonIdx + 1).trim());
        if (key === 'playresx' && Number.isFinite(val) && val > 0) playResX = val;
        if (key === 'playresy' && Number.isFinite(val) && val > 0) playResY = val;
      }
      continue;
    }

    if (section === 'v4+ styles' || section === 'v4 styles') {
      if (line.toLowerCase().startsWith('format:')) {
        styleFields = line
          .slice(7)
          .split(',')
          .map((s) => s.trim().toLowerCase());
      } else if (line.toLowerCase().startsWith('style:') && styleFields.length > 0) {
        const vals = line
          .slice(6)
          .split(',')
          .map((s) => s.trim());
        const getField = (name: string) => {
          const idx = styleFields.indexOf(name);
          return idx !== -1 ? vals[idx] : undefined;
        };
        const styleName = getField('name') || 'Default';
        styles.set(styleName, {
          fontName: getField('fontname') || 'Arial',
          fontSize: Number(getField('fontsize')) || 20,
          primaryColor: assColorToCss(getField('primarycolour')),
          outlineColor: assColorToCss(getField('outlinecolour')),
          bold: getField('bold') === '-1' || getField('bold') === '1',
          italic: getField('italic') === '-1' || getField('italic') === '1',
          underline: getField('underline') === '-1' || getField('underline') === '1',
          outline: Number(getField('outline')) || 2,
          alignment: Number(getField('alignment')) || 2,
        });
      }
      continue;
    }

    if (section === 'events') {
      if (line.toLowerCase().startsWith('format:')) {
        eventFields = line
          .slice(7)
          .split(',')
          .map((s) => s.trim().toLowerCase());
      } else if (line.toLowerCase().startsWith('dialogue:') && eventFields.length > 0) {
        const vals = splitCsvWithTail(line.slice(9).trimStart(), eventFields.length);
        const getEvt = (name: string) => {
          const idx = eventFields.indexOf(name);
          return idx !== -1 ? vals[idx] : undefined;
        };

        const startSec = parseAssTimestamp(getEvt('start') ?? '');
        const endSec = parseAssTimestamp(getEvt('end') ?? '');
        if (startSec === null || endSec === null || endSec <= startSec) continue;

        const styleName = (getEvt('style') ?? 'Default').trim();
        const styleDef = styles.get(styleName);
        const rawText = getEvt('text') ?? '';

        // Ignore ASS vector drawing lines (\p1 ... \p0)
        if (/\\p[1-9]\b/.test(rawText)) continue;

        let alignment = styleDef?.alignment ?? 2;
        let posXPercent: number | undefined;
        let posYPercent: number | undefined;
        let fontSizeOverride: number | undefined;
        let outlineOverride: number | undefined;

        let curBold = styleDef?.bold ?? false;
        let curItalic = styleDef?.italic ?? false;
        let curUnderline = styleDef?.underline ?? false;
        let curColor = styleDef?.primaryColor;

        const spans: SubtitleSpan[] = [];
        const tokenParts = rawText.split(/(\{[^}]*\})/g);

        for (const token of tokenParts) {
          if (!token) continue;
          if (token.startsWith('{') && token.endsWith('}')) {
            const tags = token.slice(1, -1);
            const anMatch = /\\an([1-9])\b/.exec(tags);
            if (anMatch) alignment = Number(anMatch[1]);

            const posMatch = /\\pos\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)/.exec(tags);
            if (posMatch) {
              posXPercent = Math.min(96, Math.max(4, (Number(posMatch[1]) / playResX) * 100));
              posYPercent = Math.min(95, Math.max(5, (Number(posMatch[2]) / playResY) * 100));
            }

            if (/\\b1\b/.test(tags)) curBold = true;
            if (/\\b0\b/.test(tags)) curBold = false;
            if (/\\i1\b/.test(tags)) curItalic = true;
            if (/\\i0\b/.test(tags)) curItalic = false;
            if (/\\u1\b/.test(tags)) curUnderline = true;
            if (/\\u0\b/.test(tags)) curUnderline = false;

            const colorMatch = /\\(?:1?c)(&H[0-9a-fA-F]+&?)/.exec(tags);
            if (colorMatch) {
              curColor = assColorToCss(colorMatch[1]) ?? curColor;
            }
            const fsMatch = /\\fs([0-9.]+)/.exec(tags);
            if (fsMatch) fontSizeOverride = Number(fsMatch[1]);

            const bordMatch = /\\bord([0-9.]+)/.exec(tags);
            if (bordMatch) outlineOverride = Number(bordMatch[1]);
            continue;
          }

          const formattedText = token.replace(/\\N/g, '\n').replace(/\\n/g, '\n').replace(/\\h/g, ' ');
          if (formattedText.length > 0) {
            spans.push({
              text: formattedText,
              bold: curBold,
              italic: curItalic,
              underline: curUnderline,
              color: curColor,
            });
          }
        }

        const plainJoined = spans.map((s) => s.text).join('').trim();
        if (!plainJoined) continue;

        const effectiveFontSize = fontSizeOverride ?? styleDef?.fontSize ?? 20;
        const fontHeightPct = Math.min(10, Math.max(2.6, (effectiveFontSize / playResY) * 100));

        cues.push({
          id: `ass-${cues.length}`,
          startSec,
          endSec,
          lines: plainJoined.split('\n').filter((l) => l.trim().length > 0),
          spans,
          alignment,
          posXPercent,
          posYPercent,
          fontName: styleDef?.fontName,
          fontHeightPct,
          primaryColor: styleDef?.primaryColor,
          outlineColor: styleDef?.outlineColor,
          outlinePx: outlineOverride ?? styleDef?.outline ?? 2,
          bold: styleDef?.bold,
          italic: styleDef?.italic,
          underline: styleDef?.underline,
          hasNativeStyle: true,
        });
      }
    }
  }

  return cues;
}

export function getActiveSubtitleCues(
  cues: SubtitleCue[],
  currentTimeSec: number,
  syncOffsetSec = 0,
): SubtitleCue[] {
  if (cues.length === 0 || !Number.isFinite(currentTimeSec)) return [];
  const targetTime = currentTimeSec - syncOffsetSec;
  return cues.filter((cue) => targetTime >= cue.startSec && targetTime <= cue.endSec);
}

export function getActiveSubtitleLines(
  cues: SubtitleCue[],
  currentTimeSec: number,
  syncOffsetSec = 0,
): string[] {
  const active = getActiveSubtitleCues(cues, currentTimeSec, syncOffsetSec);
  const lines: string[] = [];
  for (const cue of active) {
    lines.push(...cue.lines);
  }
  return lines;
}
