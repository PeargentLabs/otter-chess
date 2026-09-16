'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOlympiadSection } from '@/hooks/olympiad/useOlympiadSection';
import { useSectionRounds } from '@/hooks/olympiad/useSectionRounds';
import { useStandings } from '@/hooks/olympiad/useStandings';
import { OPEN_TOURNAMENT_IDS, WOMENS_TOURNAMENT_IDS, ALL_TOURNAMENT_IDS, OLYMPIAD_TOURNAMENT_NAME } from '@/lib/olympiad/config';
import { groupIntoPairings, uniqueTeams } from '@/lib/olympiad/grouping';
import { estimateStandings } from '@/lib/olympiad/standings-estimate';
import SectionToggle, { type OlympiadSection } from '@/components/olympiad/SectionToggle';
import RoundPicker from '@/components/olympiad/RoundPicker';
import StandingsTable from '@/components/olympiad/StandingsTable';
import MiniBoardStrip from '@/components/olympiad/MiniBoardStrip';
import GridPagination from '@/components/olympiad/GridPagination';
import TeamDropdown from '@/components/olympiad/TeamDropdown';
import { DEFAULT_SECTION, DEFAULT_TEAM, readSavedSection, readSavedTeam, writeSavedSection, writeSavedTeam } from '@/lib/olympiad/filter-prefs';

const GRID_PAGE_SIZE = 8;

export default function OlympiadLobbyPage() {
  const router = useRouter();
  // Both default to a plain constant here (SSR/static-export safe — no
  // localStorage during prerender) and get overridden from whatever was
  // last chosen — here OR on the watch page, they share the same storage
  // — by the mount effect below. setSection/setSelectedTeam persist every
  // user-driven change right at the call site, so going into a game and
  // back to the lobby (or a whole new visit) keeps the same section/team
  // instead of resetting to Open/no-filter every time.
  const [section, setSectionState] = useState<OlympiadSection>(DEFAULT_SECTION);
  const [selectedTeam, setSelectedTeamState] = useState<string | null>(DEFAULT_TEAM);
  const setSection = (s: OlympiadSection) => { setSectionState(s); writeSavedSection(s); };
  const setSelectedTeam = (t: string | null) => { setSelectedTeamState(t); writeSavedTeam(t); };
  useEffect(() => {
    setSectionState(readSavedSection());
    setSelectedTeamState(readSavedTeam());
  }, []);
  // Only ever set by an actual RoundPicker click — an explicit "show me
  // historical round N specifically" pin. Left null (never auto-filled)
  // while just browsing whatever's current: pinning it to a NUMBER at all
  // means every one of the 9 polled tournaments must have a round with
  // that exact name to show anything. Open and Women's round numbering
  // usually lines up, but Open's own "current round" (Round 3, say)
  // getting force-applied to Women's the instant Women's hadn't started
  // Round 3 yet — a bye, a later start time, anything — silently zeroed
  // out every Women's board in "All" while Open kept working fine, which
  // is exactly the bug this avoids: undefined lets EACH tournament resolve
  // its own current round independently instead of all 9 sharing Open's.
  const [userPickedRound, setUserPickedRound] = useState<number | null>(null);
  const [gridPage, setGridPage] = useState(0);

  // Standings for both sections are always shown, independent of which
  // section the round picker/grid below is currently browsing.
  const openStandings = useStandings('open');
  const womenStandings = useStandings('women');

  // The round picker's list/status-badges come from one representative
  // section — 'all' falls back to Open's schedule, since both sections
  // run the same round numbering. This is only ever used for the picker's
  // displayed options and default highlight, never to pin what actually
  // gets fetched (see userPickedRound above) — so a mismatch here can't
  // zero out a section's games anymore, only mislabel the picker's
  // highlighted option, which resolves itself once both sections agree.
  const roundListSection: 'open' | 'women' = section === 'women' ? 'women' : 'open';
  const { rounds, error: roundsError, defaultRoundNumber, roundNumberFromName } = useSectionRounds(roundListSection);
  const displayedRound = userPickedRound ?? defaultRoundNumber;

  // Switching section, round, or team invalidates the current grid page.
  // The team selection itself deliberately persists across section/round
  // switches — it's the same team's boards you're following either way.
  useEffect(() => {
    setGridPage(0);
  }, [section, userPickedRound, selectedTeam]);

  // Always poll every Open + Women's sub-broadcast, regardless of which
  // section is displayed — so the section toggle is a free client-side
  // filter over already-fetched data instead of tearing down and refetching
  // a whole new set of tournaments every time it's clicked.
  const { gamesByTournamentId, roundName, loading, error } = useOlympiadSection(ALL_TOURNAMENT_IDS, userPickedRound ?? undefined);

  const sectionIds = useMemo(() => {
    if (section === 'open') return OPEN_TOURNAMENT_IDS;
    if (section === 'women') return WOMENS_TOURNAMENT_IDS;
    return ALL_TOURNAMENT_IDS;
  }, [section]);

  const games = useMemo(
    () => sectionIds.flatMap((id) => gamesByTournamentId.get(id) ?? []),
    [sectionIds, gamesByTournamentId],
  );
  const teams = useMemo(() => uniqueTeams(games), [games]);

  // Each section's own games, independent of the section TOGGLE above —
  // the standings tables show both sections side by side always, so their
  // live estimates need both sections' games regardless of which one the
  // grid below is currently filtered to.
  const openGames = useMemo(
    () => OPEN_TOURNAMENT_IDS.flatMap((id) => gamesByTournamentId.get(id) ?? []),
    [gamesByTournamentId],
  );
  const womenGames = useMemo(
    () => WOMENS_TOURNAMENT_IDS.flatMap((id) => gamesByTournamentId.get(id) ?? []),
    [gamesByTournamentId],
  );
  // Layers this round's live results on top of the last official snapshot
  // — see lib/olympiad/standings-estimate.ts. displayedRound is Open's own
  // round number (see roundListSection above) and gets reused for Women's
  // too; round numbering usually matches between the two sections, and
  // worst case a mismatch just means a round's estimate is applied a
  // cycle later than it could've been, not anything double-counted.
  const openStandingsEstimated = useMemo(
    () => estimateStandings(openStandings.standings, displayedRound ?? 1, openGames),
    [openStandings.standings, displayedRound, openGames],
  );
  const womenStandingsEstimated = useMemo(
    () => estimateStandings(womenStandings.standings, displayedRound ?? 1, womenGames),
    [womenStandings.standings, displayedRound, womenGames],
  );
  const boards = useMemo(() => {
    const pairings = groupIntoPairings(games);
    const scoped = selectedTeam
      ? pairings.filter((p) => p.whiteTeam === selectedTeam || p.blackTeam === selectedTeam)
      : pairings;
    return scoped.flatMap((p) => p.boards);
  }, [games, selectedTeam]);

  const totalPages = Math.max(1, Math.ceil(boards.length / GRID_PAGE_SIZE));
  const clampedPage = Math.min(gridPage, totalPages - 1);
  const pageStart = clampedPage * GRID_PAGE_SIZE;
  const pagedBoards = boards.slice(pageStart, pageStart + GRID_PAGE_SIZE);

  // A game card always opens the watch page focused on that exact board —
  // the lobby itself never shows a main board/history/stats sidebar. The
  // watch section must be the CLICKED board's actual section, not just
  // whatever the lobby's own toggle is currently set to — in "All", or if
  // it's ever out of sync, forcing e.g. a clicked Women's board into
  // section=open meant the watch page filtered it straight back out and
  // silently fell back to a completely different game.
  const goToBoard = (boardKey: string) => {
    const game = boards.find((b) => b.boardKey === boardKey);
    const watchSection = game && WOMENS_TOURNAMENT_IDS.includes(game.tournamentId) ? 'women' : 'open';
    // Only carries a round number over when the user explicitly pinned one
    // here — same reasoning as userPickedRound above, so a deep link into
    // a specific historical round doesn't force-pin the OTHER section to a
    // round number it may not have (yet).
    const roundQuery = userPickedRound !== null ? `&round=${userPickedRound}` : '';
    router.push(`/olympiad/watch?section=${watchSection}${roundQuery}&focus=${encodeURIComponent(boardKey)}`);
  };

  return (
    <div className="flex-grow overflow-y-auto">
      <div className="max-w-[1200px] mx-auto p-4 lg:p-8 space-y-8">
        <div>
          <h1 className="font-space text-xl text-paper mb-1">{OLYMPIAD_TOURNAMENT_NAME}</h1>
          <p className="font-mono text-[12px] text-muted">Standings, rounds, and every live game.</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          <StandingsTable
            title="Open"
            standings={openStandingsEstimated}
            loading={openStandings.loading}
            officialUrl={openStandings.officialUrl}
          />
          <StandingsTable
            title="Women's"
            standings={womenStandingsEstimated}
            loading={womenStandings.loading}
            officialUrl={womenStandings.officialUrl}
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 border-b border-line">
            <div className="flex flex-wrap items-center gap-2.5">
              <RoundPicker
                rounds={rounds}
                selectedRound={displayedRound}
                setSelectedRound={setUserPickedRound}
                roundNumberFromName={roundNumberFromName}
                error={roundsError}
              />
              <SectionToggle section={section} setSection={setSection} />
            </div>
            <div className="flex items-center gap-2.5">
              <TeamDropdown teams={teams} selectedTeam={selectedTeam} setSelectedTeam={setSelectedTeam} />
              <GridPagination
                pageStart={boards.length === 0 ? 0 : pageStart + 1}
                pageEnd={Math.min(pageStart + GRID_PAGE_SIZE, boards.length)}
                total={boards.length}
                onPrev={() => setGridPage((p) => Math.max(0, p - 1))}
                onNext={() => setGridPage((p) => Math.min(totalPages - 1, p + 1))}
                hasPrev={clampedPage > 0}
                hasNext={clampedPage < totalPages - 1}
              />
            </div>
          </div>

          <div className="pt-4">
            {boards.length === 0 ? (
              <div className="text-center text-xs text-muted italic py-8 border border-dashed border-line rounded-[3px]">
                {error ? error : loading ? 'Loading games…' : `No games for ${roundName ?? 'this round'} yet.`}
              </div>
            ) : (
              <MiniBoardStrip boards={pagedBoards} focusedBoardKey={null} onSelectBoard={goToBoard} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
