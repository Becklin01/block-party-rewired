import { useEffect, useRef } from "react";

export interface Particle {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  life: number; // 0..1 remaining
  color: string;
  size: number;
}

interface Props {
  particles: Particle[];
  onUpdate: (next: Particle[]) => void;
}

export function ParticleLayer({ particles, onUpdate }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<number>(performance.now());
  const partsRef = useRef(particles);
  partsRef.current = particles;

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const dt = Math.min(50, t - last.current) / 1000;
      last.current = t;
      const c = ref.current;
      if (c) {
        const ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, c.width, c.height);
        const next: Particle[] = [];
        for (const p of partsRef.current) {
          const nl = p.life - dt * 1.2;
          if (nl <= 0) continue;
          const np: Particle = {
            ...p,
            x: p.x + p.vx * dt,
            y: p.y + p.vy * dt,
            vy: p.vy + 600 * dt,
            life: nl,
          };
          ctx.globalAlpha = Math.max(0, np.life);
          ctx.fillStyle = np.color;
          ctx.shadowBlur = 12;
          ctx.shadowColor = np.color;
          ctx.beginPath();
          ctx.arc(np.x, np.y, np.size, 0, Math.PI * 2);
          ctx.fill();
          next.push(np);
        }
        ctx.globalAlpha = 1;
        if (next.length !== partsRef.current.length) onUpdate(next);
        else partsRef.current = next;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onUpdate]);

  return (
    <canvas
      ref={ref}
      width={800}
      height={800}
      className="pointer-events-none absolute inset-0 w-full h-full"
    />
  );
}
