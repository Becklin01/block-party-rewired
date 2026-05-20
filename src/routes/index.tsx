import { createFileRoute } from "@tanstack/react-router";
import Tetris from "@/components/tetris/Tetris";

export const Route = createFileRoute("/")({
  component: Tetris,
  head: () => ({
    meta: [
      { title: "Neon Tetris — Modern Classic" },
      { name: "description", content: "Modern neon-styled Tetris with hold, ghost, combos, particles and screen shake." },
    ],
  }),
});
