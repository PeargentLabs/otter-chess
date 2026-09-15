'use client';

export type OlympiadSection = 'open' | 'women' | 'all';

// Open / Women's / All segmented control — switches which set of Lichess
// sub-broadcasts useOlympiadSection follows (Open I-V, Women I-IV, or
// both at once). "Open" is FIDE's own term for the men's section.
export default function SectionToggle({
  section,
  setSection,
}: {
  section: OlympiadSection;
  setSection: (s: OlympiadSection) => void;
}) {
  const options: { key: OlympiadSection; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'women', label: "Women's" },
  ];

  return (
    <div className="flex gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => setSection(opt.key)}
          className={`px-3 py-1.5 text-[11.5px] font-mono uppercase tracking-[0.02em] font-semibold border rounded-[3px] transition-all cursor-pointer ${
            section === opt.key
              ? 'border-pear text-pear bg-pear-tint/10'
              : 'border-[#7a856f]/40 text-muted hover:border-pear/50 hover:text-paper bg-transparent'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
