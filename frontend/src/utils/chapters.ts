import { Chapter, ChapterCategory, PlayerCustomization } from '../api/schemas';

export function isSkippableCategory(category: ChapterCategory): boolean {
  return category !== 'main';
}

export function getChapterCategoryLabel(category: ChapterCategory): string {
  switch (category) {
    case 'intro':
      return 'Intro';
    case 'recap':
      return 'Recap';
    case 'outro':
      return 'Outro';
    case 'credits':
      return 'Credits';
    case 'preview':
      return 'Preview';
    default:
      return 'Chapter';
  }
}

export function findActiveChapter(chapters: Chapter[], timeSec: number): Chapter | null {
  if (!Number.isFinite(timeSec) || chapters.length === 0) return null;
  for (let i = 0; i < chapters.length; i += 1) {
    const ch = chapters[i];
    if (timeSec >= ch.start_sec && timeSec < ch.end_sec) {
      return ch;
    }
  }
  return null;
}

export function shouldAutoSkipCategory(
  category: ChapterCategory,
  prefs: PlayerCustomization,
): boolean {
  switch (category) {
    case 'intro':
      return prefs.autoSkipIntro;
    case 'recap':
      return prefs.autoSkipRecap;
    case 'outro':
    case 'credits':
      return prefs.autoSkipOutro;
    case 'preview':
      return prefs.autoSkipPreview;
    default:
      return false;
  }
}

export function computeSkipTargetSec(
  chapter: Chapter,
  totalDurationSec: number | null,
): number {
  if (totalDurationSec !== null && Number.isFinite(totalDurationSec) && totalDurationSec > 0) {
    return Math.min(chapter.end_sec, Math.max(0, totalDurationSec - 0.25));
  }
  return chapter.end_sec;
}

