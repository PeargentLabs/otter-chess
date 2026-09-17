'use client';

// A real on/off slider (thumb slides side to side, track changes colour),
// not a checkbox styled to look like one — the pear accent when on matches
// the rest of the app's active-state colour everywhere else (SectionToggle,
// TeamDropdown's focus ring, etc.).
export default function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-wide text-muted hover:text-paper cursor-pointer select-none">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-[18px] rounded-full shrink-0 transition-colors cursor-pointer ${checked ? 'bg-pear' : 'bg-[#7a856f]/40'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-[14px] h-[14px] rounded-full bg-paper shadow transition-transform ${checked ? 'translate-x-[14px]' : 'translate-x-0'}`}
        />
      </button>
    </label>
  );
}
