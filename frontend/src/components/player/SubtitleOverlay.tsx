import { CSSProperties } from 'react';
import { PlayerCustomization } from '../../api/schemas';
import { SubtitleCue } from '../../utils/subtitles';

interface SubtitleOverlayProps {
  cues: SubtitleCue[];
  mode: PlayerCustomization['subtitleMode'];
  fontFamily: PlayerCustomization['subtitleFontFamily'];
  fontSize: PlayerCustomization['subtitleFontSize'];
  color: PlayerCustomization['subtitleColor'];
  backdrop: PlayerCustomization['subtitleBackdrop'];
  outline: PlayerCustomization['subtitleOutline'];
  bottomPct: number;
}

const FONT_FAMILY_CLASSES: Record<PlayerCustomization['subtitleFontFamily'], string> = {
  gotham: 'font-subtitle-gotham',
  sans: 'font-subtitle-sans',
  serif: 'font-subtitle-serif',
  mono: 'font-subtitle-mono',
};

const SIZE_CLASSES: Record<PlayerCustomization['subtitleFontSize'], string> = {
  sm: 'text-sm sm:text-base',
  md: 'text-base sm:text-xl',
  lg: 'text-lg sm:text-2xl',
  xl: 'text-xl sm:text-3xl',
};

const COLOR_CLASSES: Record<PlayerCustomization['subtitleColor'], string> = {
  white: 'text-[#f3f4f6]',
  amber: 'text-[#fde047]',
  cyan: 'text-[#67e8f9]',
};

const BACKDROP_CLASSES: Record<PlayerCustomization['subtitleBackdrop'], string> = {
  shadow: 'bg-transparent [text-shadow:0_2px_6px_rgba(0,0,0,0.95)]',
  translucent: 'bg-black/70 px-3 py-1 rounded-md shadow-sm',
  solid: 'bg-black/95 px-3.5 py-1.5 rounded-md border border-[#232730]',
};

const OUTLINE_CLASSES: Record<PlayerCustomization['subtitleOutline'], string> = {
  none: '',
  thin: 'subtitle-outline-thin',
  medium: 'subtitle-outline-medium',
  heavy: 'subtitle-outline-heavy',
};

function getAlignmentContainerStyle(cue: SubtitleCue, defaultBottomPct: number): CSSProperties {
  if (cue.posXPercent !== undefined && cue.posYPercent !== undefined) {
    return {
      left: `${cue.posXPercent}%`,
      top: `${cue.posYPercent}%`,
      transform: 'translate(-50%, -50%)',
      maxWidth: '90%',
    };
  }

  const align = cue.alignment || 2;
  const isTop = align >= 7;
  const isMiddle = align >= 4 && align <= 6;
  const isLeft = align === 1 || align === 4 || align === 7;
  const isRight = align === 3 || align === 6 || align === 9;

  const style: CSSProperties = {
    left: isLeft ? '5%' : isRight ? 'auto' : '50%',
    right: isRight ? '5%' : 'auto',
    maxWidth: '88%',
  };

  if (isTop) {
    style.top = cue.posYPercent !== undefined ? `${cue.posYPercent}%` : '8%';
    style.transform = isLeft || isRight ? undefined : 'translateX(-50%)';
  } else if (isMiddle) {
    style.top = '50%';
    style.transform = isLeft || isRight ? 'translateY(-50%)' : 'translate(-50%, -50%)';
  } else {
    style.bottom = `${defaultBottomPct}%`;
    style.transform = isLeft || isRight ? undefined : 'translateX(-50%)';
  }

  return style;
}

export function SubtitleOverlay({
  cues,
  mode,
  fontFamily,
  fontSize,
  color,
  backdrop,
  outline,
  bottomPct,
}: SubtitleOverlayProps) {
  if (cues.length === 0) return null;

  const familyClass = FONT_FAMILY_CLASSES[fontFamily];
  const outlineClass = OUTLINE_CLASSES[outline];

  if (mode === 'custom') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 z-10 flex flex-col items-center gap-1 text-center"
        style={{ bottom: `${bottomPct}%` }}
      >
        {cues.map((cue) => (
          <div
            key={cue.id}
            className={`max-w-3xl font-medium leading-snug ${familyClass} ${SIZE_CLASSES[fontSize]} ${COLOR_CLASSES[color]} ${BACKDROP_CLASSES[backdrop]} ${outlineClass}`}
          >
            {cue.lines.map((line, idx) => (
              <p key={`${cue.id}-${idx}`} className="whitespace-pre-wrap">
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Native Mode: respects ASS/VTT alignment, coordinates, font, colors, and inline formatting
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {cues.map((cue) => {
        const useRichNative = cue.hasNativeStyle;
        const posStyle = useRichNative
          ? getAlignmentContainerStyle(cue, bottomPct)
          : {
              left: '50%',
              bottom: `${bottomPct}%`,
              transform: 'translateX(-50%)',
              maxWidth: '88%',
            };

        const align = cue.alignment || 2;
        const textAlign: CSSProperties['textAlign'] =
          align === 1 || align === 4 || align === 7
            ? 'left'
            : align === 3 || align === 6 || align === 9
              ? 'right'
              : 'center';

        const nativeStyle: CSSProperties = {
          ...posStyle,
          textAlign,
        };

        if (useRichNative && cue.fontName) {
          nativeStyle.fontFamily = `"${cue.fontName}", "Gotham", "Century Gothic", sans-serif`;
        }
        if (useRichNative && cue.outlineColor && cue.outlinePx !== undefined && cue.outlinePx > 0) {
          const strokePx = Math.min(6, Math.max(1, cue.outlinePx * 1.4));
          nativeStyle.WebkitTextStroke = `${strokePx}px ${cue.outlineColor}`;
          nativeStyle.paintOrder = 'stroke fill';
        }
        if (useRichNative && cue.fontHeightPct) {
          nativeStyle.fontSize = `clamp(0.875rem, ${cue.fontHeightPct * 0.48}vw, 2.25rem)`;
        }

        return (
          <div
            key={cue.id}
            style={nativeStyle}
            className={`absolute font-medium leading-snug ${
              !useRichNative || !cue.fontName ? familyClass : ''
            } ${!useRichNative || !cue.fontHeightPct ? SIZE_CLASSES[fontSize] : ''} ${
              !useRichNative || !cue.primaryColor ? COLOR_CLASSES[color] : ''
            } ${!useRichNative ? `${BACKDROP_CLASSES[backdrop]} ${outlineClass}` : 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]'}`}
          >
            <div className="whitespace-pre-wrap">
              {cue.spans.map((span, idx) => (
                <span
                  key={`${cue.id}-span-${idx}`}
                  style={{
                    color: span.color ?? cue.primaryColor,
                    fontWeight: span.bold ? 700 : undefined,
                    fontStyle: span.italic ? 'italic' : undefined,
                    textDecoration: span.underline ? 'underline' : undefined,
                  }}
                >
                  {span.text}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
