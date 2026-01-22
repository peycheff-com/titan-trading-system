import { useEffect, useRef } from 'react';
import { ScavengerTrap } from '../../hooks/useScavengerSocket';

interface TrapMapCanvasProps {
  traps: ScavengerTrap[];
  height?: number;
}

export function TrapMapCanvas({ traps, height = 300 }: TrapMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle resizing
    const resizeObserver = new ResizeObserver(() => {
      if (container) {
        // eslint-disable-next-line functional/immutable-data
        canvas.width = container.clientWidth;
        // eslint-disable-next-line functional/immutable-data
        canvas.height = height;
      }
    });
    resizeObserver.observe(container);

    // Initial size
    // eslint-disable-next-line functional/immutable-data
    canvas.width = container.clientWidth;
    // eslint-disable-next-line functional/immutable-data
    canvas.height = height;

    // eslint-disable-next-line functional/no-let
    let animationFrameId: number;
    // eslint-disable-next-line functional/no-let
    let time = 0;

    const render = () => {
      time += 0.05; // Time delta for animations

      // Clear canvas
      // eslint-disable-next-line functional/immutable-data
      ctx.fillStyle = '#09090b'; // bg-zinc-950
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw Grid Lines (abstract "depth")
      // eslint-disable-next-line functional/immutable-data
      ctx.strokeStyle = '#27272a'; // bg-zinc-800
      // eslint-disable-next-line functional/immutable-data
      ctx.lineWidth = 1;

      // Vertical lines
      // eslint-disable-next-line functional/no-let
      for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      // Horizontal lines (Proximity Zones)
      // Center line (0% proximity - HIT)
      const centerY = canvas.height / 2;

      // eslint-disable-next-line functional/immutable-data
      ctx.strokeStyle = '#ef4444'; // Red center line
      // eslint-disable-next-line functional/immutable-data
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(canvas.width, centerY);
      ctx.stroke();

      // Draw Traps
      traps.forEach((trap, index) => {
        // X Position: Spread out by index (simple visualization)
        // In a real version, this could be time or correlation based
        const padding = 40;
        const availableWidth = canvas.width - padding * 2;
        const x = padding + (index / Math.max(traps.length - 1, 1)) * availableWidth;

        // Y Position: Based on Proximity
        // 0% proximity = Center Y
        // 5% proximity = Top/Bottom edge
        const mapScale = canvas.height / 2; // scale factor
        const normalizedProximity = Math.min(trap.proximity / 0.05, 1); // Clamp to 5% range

        const directionMultiplier = trap.direction === 'LONG' ? 1 : -1;
        const yOffset = normalizedProximity * mapScale * directionMultiplier;
        const y = centerY + yOffset;

        // Color based on proximity
        // eslint-disable-next-line functional/no-let
        let color = '#22c55e'; // Green (Safe)
        if (trap.proximity < 0.01)
          color = '#ef4444'; // Red (Critical)
        else if (trap.proximity < 0.02) color = '#eab308'; // Yellow (Warning)

        // Draw Trap Point (Circle)
        ctx.beginPath();
        const radius = trap.proximity < 0.01 ? 6 : 4;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        // eslint-disable-next-line functional/immutable-data
        ctx.fillStyle = color;
        ctx.fill();

        // Pulsing effect for critical traps
        if (trap.proximity < 0.015) {
          const pulseSize = radius + Math.sin(time * 5) * 3;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(pulseSize, radius), 0, Math.PI * 2);
          // eslint-disable-next-line functional/immutable-data
          ctx.strokeStyle = color;
          // eslint-disable-next-line functional/immutable-data
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Draw Connecting Line to Center (Tension Line)
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, centerY);
        // eslint-disable-next-line functional/immutable-data
        ctx.strokeStyle = color;
        // eslint-disable-next-line functional/immutable-data
        ctx.globalAlpha = 0.2;
        ctx.stroke();
        // eslint-disable-next-line functional/immutable-data
        ctx.globalAlpha = 1.0;

        // Label (Symbol)
        // eslint-disable-next-line functional/immutable-data
        ctx.fillStyle = '#a1a1aa'; // zinc-400
        // eslint-disable-next-line functional/immutable-data
        ctx.font = '10px monospace';
        // eslint-disable-next-line functional/immutable-data
        ctx.textAlign = 'center';
        ctx.fillText(trap.symbol, x, y + (trap.direction === 'LONG' ? 15 : -10));

        // Label (Price)
        // eslint-disable-next-line functional/immutable-data
        ctx.fillStyle = '#52525b'; // zinc-600
        ctx.fillText(trap.triggerPrice.toFixed(2), x, y + (trap.direction === 'LONG' ? 25 : -20));
      });

      // Draw "Sonar" sweep line
      const sweepX = (time * 100) % canvas.width;
      ctx.beginPath();
      ctx.moveTo(sweepX, 0);
      ctx.lineTo(sweepX, canvas.height);

      const gradient = ctx.createLinearGradient(sweepX, 0, sweepX - 50, 0);
      gradient.addColorStop(0, 'rgba(45, 212, 191, 0.5)'); // Teal highlight
      gradient.addColorStop(1, 'rgba(45, 212, 191, 0)');

      // eslint-disable-next-line functional/immutable-data
      ctx.fillStyle = gradient;
      ctx.fillRect(sweepX - 50, 0, 50, canvas.height);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [traps, height]);

  return (
    <div
      ref={containerRef}
      className="w-full relative rounded-lg border border-border overflow-hidden bg-zinc-950"
    >
      <canvas ref={canvasRef} className="block" />

      {/* Overlay Labels */}
      <div className="absolute top-2 left-2 text-xs font-mono text-zinc-500">
        CANVAS RENDERER :: ACTIVE
      </div>
      <div className="absolute top-2 right-2 text-xs font-mono text-zinc-500">
        TRAPS: {traps.length}
      </div>
    </div>
  );
}
