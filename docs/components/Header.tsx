'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Header() {
  const pathname = usePathname();
  const activeTab = pathname === '/docs' ? 'docs' : pathname === '/olympiad' ? 'olympiad' : pathname === '/play' ? 'play' : 'home';

  return (
    <header className="sticky top-0 z-40 bg-bg flex items-center justify-between shrink-0 px-4 sm:px-8 h-[68px] border-b border-line">
      <div className="flex items-center gap-[9px]">
        <div className="w-[10px] h-[10px] bg-pear" />
        <Link
          href="/"
          className="font-space font-medium tracking-tight text-paper hover:text-pear transition-all duration-150 text-[19px]"
        >
          Otter
        </Link>
        <span className="hidden sm:inline font-mono text-[11px] text-muted tracking-[0.05em] border-l border-line ml-1.5 pl-2.5">
          PeargentLabs
        </span>
      </div>

      {/* Navigation Links */}
      <nav aria-label="Main" className="flex items-center gap-[18px] sm:gap-[36px]">
        <Link
          href="/"
          className={`font-mono text-[13px] tracking-[0.01em] transition-all duration-150 ${
            activeTab === 'home' ? 'text-paper font-medium' : 'text-muted hover:text-paper'
          }`}
        >
          Home
        </Link>
        
        <Link
          href="/docs"
          className={`font-mono text-[13px] tracking-[0.01em] transition-all duration-150 ${
            activeTab === 'docs' ? 'text-paper font-medium' : 'text-muted hover:text-paper'
          }`}
        >
          Docs
        </Link>

        <Link
          href="/olympiad"
          className={`font-mono text-[13px] tracking-[0.01em] transition-all duration-150 ${
            activeTab === 'olympiad' ? 'text-paper font-medium' : 'text-muted hover:text-paper'
          }`}
        >
          Olympiad
        </Link>

        <Link
          href="/play"
          className={`font-mono text-[13px] tracking-[0.01em] border px-4 py-1.5 transition-all duration-150 flex items-center gap-1.5 ${
            activeTab === 'play'
              ? 'border-pear text-pear bg-panel font-medium'
              : 'border-pear-dim text-pear hover:bg-panel hover:border-pear'
          }`}
        >
          Play &rarr;
        </Link>
      </nav>
    </header>
  );
}
