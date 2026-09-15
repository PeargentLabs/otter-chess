'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOlympiadSection } from '@/hooks/olympiad/useOlympiadSection';
import { useSectionRounds } from '@/hooks/olympiad/useSectionRounds';
import { useStandings } from '@/hooks/olympiad/useStandings';
import { OPEN_TOURNAMENT_IDS, WOMENS_TOURNAMENT_IDS, OLYMPIAD_TOURNAMENT_NAME } from '@/lib/olympiad/config';
import { groupIntoPairings } from '@/lib/olympiad/grouping';
import SectionToggle, { type OlympiadSection } from '@/components/olympiad/SectionToggle';
import RoundPicker from '@/components/olympiad/RoundPicker';
import StandingsTable from '@/components/olympiad/StandingsTable';
import MiniBoardStrip from '@/components/olympiad/MiniBoardStrip';
import GridPagination from '@/components/olympiad/GridPagination';

const GRID_PAGE_SIZE = 8;

export default function OlympiadLobbyPage() {
  const router = useRouter();
  const [section, setSection] = useState<OlympiadSection>('open');
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [gridPage, setGridPage] = useState(0);

  // Standings for both sections are always shown, independent of which
  // section the round picker/grid below is currently browsing.
  const openStandings = useStandings('open');
  const womenStandings = useStandings('women');

  // The round picker's list/status-badges come from one representative
  // section — 'all' falls back to Open's schedule, since both sections
  // run the same round numbering.
  const roundListSection: 'open' | 'women' = section === 'women' ? 'women' : 'open';
  const { rounds, error: roundsError, defaultRoundNumber, roundNumberFromName } = useSectionRounds(roundListSection);

  useEffect(() => {
    if (selectedRound === null && defaultRoundNumber !== null) {
      setSelectedRound(defaultRoundNumber);
    }
  }, [defaultRoundNumber, selectedRound]);

  // Switching section or round invalidates the current grid page.
  useEffect(() => {
    setGridPage(0);
  }, [section, selectedRound]);

  const tournamentIds = useMemo(() => {
    if (section === 'open') return OPEN_TOURNAMENT_IDS;
    if (section === 'women') return WOMENS_TOURNAMENT_IDS;
    return [...OPEN_TOURNAMENT_IDS, ...WOMENS_TOURNAMENT_IDS];
  }, [section]);

  const { games, roundName, loading, error } = useOlympiadSection(tournamentIds, selectedRound ?? undefined);
  const boards = useMemo(() => groupIntoPairings(games).flatMap((p) => p.boards), [games]);

  const totalPages = Math.max(1, Math.ceil(boards.length / GRID_PAGE_SIZE));
  const clampedPage = Math.min(gridPage, totalPages - 1);
  const pageStart = clampedPage * GRID_PAGE_SIZE;
  const pagedBoards = boards.slice(pageStart, pageStart + GRID_PAGE_SIZE);

  // A game card always opens the watch page focused on that exact board —
  // the lobby itself never shows a main board/history/stats sidebar.
  const goToBoard = (boardKey: string) => {
    const watchSection = section === 'all' ? 'open' : section;
    const roundQuery = selectedRound !== null ? `&round=${selectedRound}` : '';
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
            standings={openStandings.standings}
            loading={openStandings.loading}
            officialUrl={openStandings.officialUrl}
          />
          <StandingsTable
            title="Women's"
            standings={womenStandings.standings}
            loading={womenStandings.loading}
            officialUrl={womenStandings.officialUrl}
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 border-b border-line">
            <div className="flex flex-wrap items-center gap-2.5">
              <RoundPicker
                rounds={rounds}
                selectedRound={selectedRound}
                setSelectedRound={setSelectedRound}
                roundNumberFromName={roundNumberFromName}
                error={roundsError}
              />
              <SectionToggle section={section} setSection={setSection} />
            </div>
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
