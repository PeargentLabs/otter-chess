import Link from "next/link";
import { withBasePath } from "@/lib/site";

export default function HomePage() {
  return (
    <div className="flex-grow flex flex-col justify-between">
      {/* Hero Section */}
      <section className="px-6 sm:px-10 lg:px-[56px] py-14 sm:py-20 lg:py-[90px] max-w-[1200px] mx-auto w-full">
        <div className="font-mono text-[12px] text-pear tracking-[0.06em] mb-[22px] flex items-center gap-[9px]">
          <span className="border border-pear text-pear-deep px-[7px] py-[2px] font-medium leading-none select-none">
            A1
          </span>
          <span>RESEARCH PREVIEW · HUMAN-LIKE CHESS ENGINE</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-[64px] items-center">
          <div>
            <h1 className="font-space font-medium text-[38px] sm:text-[48px] lg:text-[62px] leading-[1.05] tracking-tight text-paper">
              A chess engine <em className="not-italic text-pear font-normal italic">that plays like you.</em>
            </h1>
            <p className="text-[16.5px] leading-[1.7] text-muted max-w-[460px] mt-[24px]">
              Otter is trained on millions of human games to predict the move a
              real player would make — the plans, the patterns, the occasional
              slip — instead of always finding the objectively strongest one.
            </p>
            <div className="flex items-center gap-[32px] mt-[34px]">
              <Link
                href="/play"
                className="font-mono text-[13px] tracking-[0.01em] py-[13px] px-[24px] bg-paper text-bg hover:bg-pear-deep transition-all duration-150 cursor-pointer flex items-center gap-[8px]"
              >
                Play Otter →
              </Link>
              <a
                href="https://arxiv.org/abs/2608.05206"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[13px] tracking-[0.01em] text-paper border-b border-line pb-[2px] hover:text-pear hover:border-pear transition-all duration-150 cursor-pointer flex items-center gap-[7px]"
              >
                Read the paper ↗
              </a>
            </div>
          </div>
          <div className="aspect-square flex items-center justify-center relative w-full rounded-sm overflow-hidden">
            <img
              src={withBasePath("/otter-hero.png")}
              alt="Pixel-art otter pondering a pawn on a chessboard"
              className="hero-otter-img w-[86%] h-auto select-none pointer-events-none"
              draggable={false}
            />
            <div className="hero-otter-shadow" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* Olympiad promo banner — desktop/tablet only; the site-wide top
          banner (OlympiadTopBanner, right below the header) already covers
          this on mobile, so showing both there was redundant. */}
      <section className="hidden sm:block max-w-[1200px] mx-auto w-full px-6 sm:px-10 lg:px-[56px] pb-14 sm:pb-20 lg:pb-[90px]">
        <Link
          href="/olympiad"
          className="group flex flex-col sm:flex-row sm:items-center justify-between gap-5 sm:gap-8 rounded-sm border border-pear-dim/60 bg-pear-tint/10 hover:border-pear hover:bg-pear-tint/20 transition-all duration-150 px-6 sm:px-8 py-6 sm:py-7"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-pear animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="font-mono text-[11px] text-pear uppercase tracking-[0.08em] font-bold mb-[6px]">
                FIDE Chess Olympiad · Samarkand 2026
              </div>
              <div className="font-space font-medium text-[19px] sm:text-[21px] text-paper leading-tight">
                Check out Olympiad games with human-like analysis
              </div>
            </div>
          </div>
          <span className="shrink-0 font-mono text-[13px] tracking-[0.01em] py-[13px] px-[24px] bg-paper text-bg group-hover:bg-pear-deep transition-all duration-150 flex items-center gap-[8px] self-start sm:self-auto">
            Stream Games →
          </span>
        </Link>
      </section>

      {/* Block A2 — What Otter does */}
      <section className="max-w-[1200px] mx-auto w-full px-6 sm:px-10 lg:px-[56px] py-12 sm:py-16 lg:py-[76px] border-t border-line">
        <div className="font-mono text-[11.5px] text-muted tracking-[0.05em] mb-[18px]">
          A2 — WHAT OTTER DOES
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] gap-[64px] items-start mb-[48px]">
          <div>
            <h2 className="font-space font-medium text-[36px] leading-[1.15] tracking-tight text-paper">
              Plays like a person, not a calculator
            </h2>
          </div>
          <div>
            <p className="text-[15.5px] leading-[1.75] text-muted">
              Otter is conditioned on a target rating band and predicts moves the
              way a player at that level would plausibly make — including the
              blind spots typical of that band.
            </p>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[32px] border-t border-line pt-[36px] pb-[44px]">
          {/* Feature 1 */}
          <div className="flex flex-col gap-2">
            <div className="w-[8px] h-[8px] bg-pear" />
            <h3 className="font-space font-medium text-[15.5px] text-paper mt-1">
              Rating-conditioned play
            </h3>
            <p className="text-[13.5px] text-muted leading-[1.6]">
              Pick a target Elo from 800 to 2600 and Otter matches that level's style and mistakes.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="flex flex-col gap-2">
            <div className="w-[8px] h-[8px] bg-pear" />
            <h3 className="font-space font-medium text-[15.5px] text-paper mt-1">
              Time control & clock pressure
            </h3>
            <p className="text-[13.5px] text-muted leading-[1.6]">
              Considers both the time control format and remaining clock time to simulate how human decision quality degrades under dynamic time stress.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="flex flex-col gap-2">
            <div className="w-[8px] h-[8px] bg-pear" />
            <h3 className="font-space font-medium text-[15.5px] text-paper mt-1">
              Move sequence memory
            </h3>
            <p className="text-[13.5px] text-muted leading-[1.6]">
              Conditioned on the game's move history, allowing the model to look at previous moves and judge opening choices, positional drift, and momentum.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="flex flex-col gap-2">
            <div className="w-[8px] h-[8px] bg-pear" />
            <h3 className="font-space font-medium text-[15.5px] text-paper mt-1">
              Outperforms Maia 2
            </h3>
            <p className="text-[13.5px] text-muted leading-[1.6]">
              Achieves a 55.70% top-1 accuracy, outdoing Maia 2's reported 53.25% while using 34% fewer parameters and 33% less training data.
            </p>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 border-t border-line pt-[36px]">
          <div>
            <div className="font-space font-medium text-[28px] text-paper leading-none">
              15.3M
            </div>
            <div className="font-mono text-[11px] text-muted mt-[8px]">
              Model parameters
            </div>
          </div>
          <div>
            <div className="font-space font-medium text-[28px] text-paper leading-none">
              800–2600
            </div>
            <div className="font-mono text-[11px] text-muted mt-[8px]">
              Elo range emulated
            </div>
          </div>
          <div>
            <div className="font-space font-medium text-[28px] text-paper leading-none">
              117M / 6.1B
            </div>
            <div className="font-mono text-[11px] text-muted mt-[8px]">
              Games / positions
            </div>
          </div>
          <div>
            <div className="font-space font-medium text-[28px] text-paper leading-none">
              T4 GPU
            </div>
            <div className="font-mono text-[11px] text-muted mt-[8px]">
              Training hardware
            </div>
          </div>
        </div>
      </section>

      {/* Block A3 — Resources */}
      <section className="max-w-[1200px] mx-auto w-full px-6 sm:px-10 lg:px-[56px] py-12 sm:py-16 lg:py-[76px] border-t border-line">
        <div className="font-mono text-[11.5px] text-muted tracking-[0.05em] mb-[18px]">
          A3 — RESOURCES
        </div>
        <div className="flex flex-col">
          <a
            href="https://github.com/PeargentLabs/Otter-Chess"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-baseline justify-between py-[26px] border-t border-line last:border-b last:border-line hover:pl-[10px] transition-all duration-200 cursor-pointer"
          >
            <span className="font-space font-medium text-[21px] text-paper group-hover:text-pear transition-colors duration-150">
              GitHub
            </span>
            <span className="font-mono text-[12px] text-muted">
              Code & training scripts ↗
            </span>
          </a>
          <a
            href="https://huggingface.co/peargentlabs/otter-chess"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-baseline justify-between py-[26px] border-t border-line last:border-b last:border-line hover:pl-[10px] transition-all duration-200 cursor-pointer"
          >
            <span className="font-space font-medium text-[21px] text-paper group-hover:text-pear transition-colors duration-150">
              Hugging Face
            </span>
            <span className="font-mono text-[12px] text-muted">
              Model weights ↗
            </span>
          </a>
          <a
            href="https://api.wandb.ai/links/peargent-ai-labs/3mu4f1jv"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-baseline justify-between py-[26px] border-t border-line last:border-b last:border-line hover:pl-[10px] transition-all duration-200 cursor-pointer"
          >
            <span className="font-space font-medium text-[21px] text-paper group-hover:text-pear transition-colors duration-150">
              Weights & Biases
            </span>
            <span className="font-mono text-[12px] text-muted">
              Training runs ↗
            </span>
          </a>
          <a
            href="https://arxiv.org/abs/2608.05206"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-baseline justify-between py-[26px] border-t border-line last:border-b last:border-line hover:pl-[10px] transition-all duration-200 cursor-pointer"
          >
            <span className="font-space font-medium text-[21px] text-paper group-hover:text-pear transition-colors duration-150">
              Paper
            </span>
            <span className="font-mono text-[12px] text-muted">
              arXiv ↗
            </span>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-[1200px] mx-auto w-full px-6 sm:px-10 lg:px-[56px] pb-10 sm:pb-[56px] pt-[32px] flex flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between font-mono text-[11px] text-muted">
        <span>© 2026 PeargentLabs</span>
        <span>Otter · v1.0 · released for research use</span>
      </footer>
    </div>
  );
}
