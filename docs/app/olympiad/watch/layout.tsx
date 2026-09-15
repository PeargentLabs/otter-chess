import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Watch — Olympiad",
  description:
    "Follow a FIDE Chess Olympiad game live, with Otter and Stockfish analyzing the board alongside you — move history, engine comparison, and predicted-move arrows updating as the game is played.",
  alternates: {
    canonical: "/olympiad/watch",
  },
  openGraph: {
    title: "Otter Chess — Watch",
    description:
      "Follow a FIDE Chess Olympiad game live, with Otter and Stockfish analyzing the board alongside you.",
    url: "/olympiad/watch",
  },
};

export default function OlympiadWatchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
