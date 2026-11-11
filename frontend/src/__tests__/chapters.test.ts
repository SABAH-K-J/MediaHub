import { describe, expect, it } from 'vitest';
import { Chapter, DEFAULT_PLAYER_CUSTOMIZATION } from '../api/schemas';
import {
  computeSkipTargetSec,
  findActiveChapter,
  getChapterCategoryLabel,
  shouldAutoSkipCategory,
} from '../utils/chapters';

const SAMPLE_CHAPTERS: Chapter[] = [
  { id: 'ch-0', title: 'Opening Theme', start_sec: 0, end_sec: 90, category: 'intro' },
  { id: 'ch-1', title: 'Act 1', start_sec: 90, end_sec: 1200, category: 'main' },
  { id: 'ch-2', title: 'Ending', start_sec: 1200, end_sec: 1290, category: 'outro' },
];

describe('chapter detection and skip rules', () => {
  it('finds active chapter and evaluates per-category skip preferences', () => {
    expect(findActiveChapter(SAMPLE_CHAPTERS, 45)?.id).toBe('ch-0');
    expect(findActiveChapter(SAMPLE_CHAPTERS, 90)?.id).toBe('ch-1');
    expect(findActiveChapter(SAMPLE_CHAPTERS, 1400)).toBeNull();

    expect(shouldAutoSkipCategory('intro', DEFAULT_PLAYER_CUSTOMIZATION)).toBe(true);
    expect(shouldAutoSkipCategory('recap', DEFAULT_PLAYER_CUSTOMIZATION)).toBe(true);
    expect(shouldAutoSkipCategory('outro', DEFAULT_PLAYER_CUSTOMIZATION)).toBe(false);
    expect(shouldAutoSkipCategory('main', DEFAULT_PLAYER_CUSTOMIZATION)).toBe(false);

    expect(getChapterCategoryLabel('intro')).toBe('Intro');
    expect(getChapterCategoryLabel('outro')).toBe('Outro');
  });

  it('clamps skip target inside media duration', () => {
    expect(computeSkipTargetSec(SAMPLE_CHAPTERS[0], 1290)).toBe(90);
    expect(computeSkipTargetSec(SAMPLE_CHAPTERS[2], 1290)).toBeCloseTo(1289.75);
  });
});

