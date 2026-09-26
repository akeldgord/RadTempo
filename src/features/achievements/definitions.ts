/**
 * Achievement definitions for RadTempo's moderate, never-cross-user
 * gamification. See docs/SPEC.md, section "Gamification".
 *
 * Wording is calm and personal-only: no ranking, no comparison to other
 * users, no "speed demon" style badges.
 */

export type AchievementKey =
  | 'timed_10'
  | 'timed_50'
  | 'timed_100'
  | 'study_50'
  | 'first_established_benchmark'
  | 'improvement_5'
  | 'improvement_10'
  | 'reading_streak_5';

export interface AchievementDefinition {
  key: AchievementKey;
  title: string;
  description: string;
  /** true if this achievement is scoped to a specific study type */
  perStudy: boolean;
}

export const ACHIEVEMENT_DEFINITIONS: Record<AchievementKey, AchievementDefinition> = {
  timed_10: {
    key: 'timed_10',
    title: '10 timed cases',
    description: "You've completed 10 timed cases. Your personal history is taking shape.",
    perStudy: false,
  },
  timed_50: {
    key: 'timed_50',
    title: '50 timed cases',
    description: "You've completed 50 timed cases. Your personal benchmark is well established.",
    perStudy: false,
  },
  timed_100: {
    key: 'timed_100',
    title: '100 timed cases',
    description: "You've completed 100 timed cases. A substantial personal record.",
    perStudy: false,
  },
  study_50: {
    key: 'study_50',
    title: '50 of one study type',
    description: "You've read 50 cases of this study type, building a deep personal baseline for it.",
    perStudy: true,
  },
  first_established_benchmark: {
    key: 'first_established_benchmark',
    title: 'First established benchmark',
    description: 'One of your study types now has enough history for an established personal benchmark.',
    perStudy: true,
  },
  improvement_5: {
    key: 'improvement_5',
    title: 'Sustained improvement',
    description: 'Your recent pace on this study type is at least 5% faster than your prior comparable pace.',
    perStudy: true,
  },
  improvement_10: {
    key: 'improvement_10',
    title: 'Notable sustained improvement',
    description: 'Your recent pace on this study type is at least 10% faster than your prior comparable pace.',
    perStudy: true,
  },
  reading_streak_5: {
    key: 'reading_streak_5',
    title: '5-day reading streak',
    description: "You've read cases on 5 consecutive days. A quiet, steady rhythm.",
    perStudy: false,
  },
};
