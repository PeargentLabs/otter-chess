import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Olympiad",
  description:
    "Standings, rounds, and every live game of the FIDE Chess Olympiad — Open and Women's — with Otter and Stockfish analyzing alongside you once you're watching a board.",
  alternates: {
    canonical: "/olympiad",
  },
  openGraph: {
    title: "Otter Chess — Olympiad",
    description:
      "Standings, rounds, and every live game of the FIDE Chess Olympiad, Open and Women's.",
    url: "/olympiad",
  },
};

export default function OlympiadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
