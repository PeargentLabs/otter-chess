'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Slim site-wide announcement bar just below the header, promoting the
// Olympiad feature from every other page. Hidden while already on an
// Olympiad page — a "check out the Olympiad" banner makes no sense once
// you're already there.
export default function OlympiadTopBanner() {
  const pathname = usePathname();
  if (pathname.startsWith('/olympiad')) return null;

  return (
    <Link
      href="/olympiad"
      className="group flex items-center justify-center gap-2.5 flex-wrap text-center px-4 py-2.5 bg-pear-tint/20 border-b border-line hover:bg-pear-tint/30 transition-all duration-150"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-pear animate-pulse shrink-0" />
      <span className="font-mono text-[11.5px] sm:text-[12px] text-paper">
        <span className="text-pear font-bold uppercase tracking-wide">Live</span>
        {' '}— FIDE Chess Olympiad, Samarkand 2026
      </span>
      <span className="font-mono text-[11.5px] sm:text-[12px] text-pear font-bold underline decoration-pear-dim group-hover:decoration-pear underline-offset-2">
        Watch →
      </span>
    </Link>
  );
}
