import { describe, expect, it } from 'vitest';
import {
  assColorToCss,
  getActiveSubtitleLines,
  parseAssSubtitles,
  parseVttTimestamp,
  parseWebVtt,
  stripVttTags,
} from '../utils/subtitles';

describe('WebVTT and ASS subtitle utilities', () => {
  it('parses HH:MM:SS.mmm and MM:SS.mmm timestamps cleanly', () => {
    expect(parseVttTimestamp('00:01:05.500')).toBeCloseTo(65.5);
    expect(parseVttTimestamp('02:30.250')).toBeCloseTo(150.25);
    expect(parseVttTimestamp('00:00:01,200')).toBeCloseTo(1.2);
    expect(parseVttTimestamp('invalid')).toBeNull();
  });

  it('strips markup/ASS tags safely, preserves VTT inline spans, and resolves timing offset', () => {
    expect(stripVttTags('<i>Hello &amp; welcome</i> {\\an8}')).toBe('Hello & welcome');

    const vtt = `WEBVTT

1
00:00:02.000 --> 00:00:05.000 line:12% align:start
<c.yellow>First line</c>
<i>Second line</i>

2
00:00:06.000 --> 00:00:09.000
Next cue`;

    const cues = parseWebVtt(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].lines).toEqual(['First line', 'Second line']);
    expect(cues[0].hasNativeStyle).toBe(true);
    expect(cues[0].posYPercent).toBe(12);
    expect(cues[0].spans.some((s) => s.color === '#fde047')).toBe(true);
    expect(cues[0].spans.some((s) => s.italic === true)).toBe(true);

    expect(getActiveSubtitleLines(cues, 3.0, 0)).toEqual(['First line', 'Second line']);
    expect(getActiveSubtitleLines(cues, 5.5, 0)).toEqual([]);
    expect(getActiveSubtitleLines(cues, 5.5, 1.0)).toEqual(['First line', 'Second line']);
  });

  it('converts ASS BGR colors and parses ASS styles, alignment, positioning, and inline overrides', () => {
    expect(assColorToCss('&H0000FFFF&')).toBe('rgba(255, 255, 0, 1)');
    expect(assColorToCss('&H80FF0000')).toBe('rgba(0, 0, 255, 0.498)');

    const ass = `[Script Info]
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, Bold, Italic, Underline, Outline, Alignment
Style: Main,Trebuchet MS,64,&H00FFFFFF,&H00000000,0,0,0,3,2

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.50,Main,,0,0,0,,{\\an8\\c&H0000FFFF&}Top Sign\\N{\\i1}Subnote{\\i0}
Dialogue: 0,0:00:05.00,0:00:07.00,Main,,0,0,0,,{\\pos(960,270)}Positioned
Dialogue: 0,0:00:08.00,0:00:09.00,Main,,0,0,0,,{\\p1}m 0 0 l 100 100{\\p0}`;

    const cues = parseAssSubtitles(ass);
    expect(cues).toHaveLength(2);
    expect(cues[0].alignment).toBe(8);
    expect(cues[0].fontName).toBe('Trebuchet MS');
    expect(cues[0].spans[0].color).toBe('rgba(255, 255, 0, 1)');
    expect(cues[0].spans[1].italic).toBe(true);
    expect(cues[1].posXPercent).toBeCloseTo(50);
    expect(cues[1].posYPercent).toBeCloseTo(25);
  });
});
