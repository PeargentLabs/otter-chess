// Persists the section (Open/Women's/All) and team filter across the
// lobby and watch pages, and across visits — both pages read/write the
// same two keys, so whichever was changed most recently wins everywhere,
// and neither resets just from clicking into a game and back to the lobby.

type Section = 'open' | 'women' | 'all';

const SECTION_KEY = 'otter-olympiad-section';
const TEAM_KEY = 'otter-olympiad-team';
// No saved team at all (nothing ever chosen) defaults to India; an
// explicit "All Teams" choice is stored as this sentinel so THAT stays
// sticky too, distinguishable from "never chosen".
const NO_TEAM_SENTINEL = '__all__';

export const DEFAULT_SECTION: Section = 'all';
export const DEFAULT_TEAM = 'India';

export function readSavedSection(): Section {
  try {
    const saved = localStorage.getItem(SECTION_KEY);
    if (saved === 'open' || saved === 'women' || saved === 'all') return saved;
  } catch (_) {
    // localStorage unavailable — fall through to the default
  }
  return DEFAULT_SECTION;
}

export function writeSavedSection(section: Section) {
  try {
    localStorage.setItem(SECTION_KEY, section);
  } catch (_) {
    // storage full/unavailable — the choice still applies this visit
  }
}

export function readSavedTeam(): string | null {
  try {
    const saved = localStorage.getItem(TEAM_KEY);
    if (saved === NO_TEAM_SENTINEL) return null;
    if (saved) return saved;
  } catch (_) {
    // localStorage unavailable — fall through to the default
  }
  return DEFAULT_TEAM;
}

export function writeSavedTeam(team: string | null) {
  try {
    localStorage.setItem(TEAM_KEY, team ?? NO_TEAM_SENTINEL);
  } catch (_) {
    // storage full/unavailable — the choice still applies this visit
  }
}
