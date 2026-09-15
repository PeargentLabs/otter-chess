'use client';

// Prev/next paging for the board grid — "1-8 / 45" between two arrow
// buttons, sitting opposite the team dropdown / section toggle.
export default function GridPagination({
  pageStart,
  pageEnd,
  total,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  pageStart: number;
  pageEnd: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-2 font-mono text-[12px] text-muted">
      <button
        onClick={onPrev}
        disabled={!hasPrev}
        className="w-6 h-6 flex items-center justify-center border border-[#7a856f]/40 rounded-[2px] hover:border-pear hover:text-pear disabled:opacity-30 disabled:hover:border-[#7a856f]/40 disabled:hover:text-muted transition-all cursor-pointer"
        title="Previous boards"
        aria-label="Previous boards"
      >
        &lt;
      </button>
      <span className="tabular-nums">
        {pageStart}&ndash;{pageEnd} / {total}
      </span>
      <button
        onClick={onNext}
        disabled={!hasNext}
        className="w-6 h-6 flex items-center justify-center border border-[#7a856f]/40 rounded-[2px] hover:border-pear hover:text-pear disabled:opacity-30 disabled:hover:border-[#7a856f]/40 disabled:hover:text-muted transition-all cursor-pointer"
        title="Next boards"
        aria-label="Next boards"
      >
        &gt;
      </button>
    </div>
  );
}
