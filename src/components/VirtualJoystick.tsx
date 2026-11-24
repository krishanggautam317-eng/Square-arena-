import { useRef, useState, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface VirtualJoystickProps {
  label: string;
  accent: 'sky' | 'amber';
  size?: number;
  fireThreshold?: number;
  onChange: (x: number, y: number, active: boolean, firing: boolean) => void;
}

export function VirtualJoystick({
  label,
  accent,
  size = 118,
  fireThreshold = 0.25,
  onChange,
}: VirtualJoystickProps) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);
  const [isFiring, setIsFiring] = useState(false);

  const maxRadius = size * 0.36;
  const deadzone = 0.12;

  const updateFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = baseRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const rawDx = clientX - centerX;
      const rawDy = clientY - centerY;
      const distance = Math.hypot(rawDx, rawDy);

      let clampedDx = rawDx;
      let clampedDy = rawDy;
      if (distance > maxRadius && distance > 0) {
        const scale = maxRadius / distance;
        clampedDx = rawDx * scale;
        clampedDy = rawDy * scale;
      }

      const normX = clampedDx / maxRadius;
      const normY = clampedDy / maxRadius;
      const normMag = Math.hypot(normX, normY);

      setKnobOffset({ x: clampedDx, y: clampedDy });

      if (normMag < deadzone) {
        setIsFiring(false);
        onChange(0, 0, true, false);
      } else {
        const firing = normMag >= fireThreshold;
        setIsFiring(firing);
        onChange(normX, normY, true, firing);
      }
    },
    [fireThreshold, maxRadius, onChange]
  );

  const resetStick = useCallback(() => {
    activePointerIdRef.current = null;
    setIsActive(false);
    setIsFiring(false);
    setKnobOffset({ x: 0, y: 0 });
    onChange(0, 0, false, false);
  }, [onChange]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    setIsActive(true);
    updateFromClientPoint(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    updateFromClientPoint(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetStick();
  };

  const ringClass =
    accent === 'sky'
      ? isActive
        ? 'border-sky-400/80 bg-slate-900/75'
        : 'border-slate-600/80 bg-slate-900/60'
      : isFiring
        ? 'border-amber-400 bg-slate-900/80'
        : isActive
          ? 'border-amber-400/75 bg-slate-900/75'
          : 'border-slate-600/80 bg-slate-900/60';

  const knobClass =
    accent === 'sky'
      ? isActive
        ? 'bg-sky-400 border-sky-200'
        : 'bg-sky-400/80 border-sky-200/80'
      : isFiring
        ? 'bg-amber-400 border-amber-100'
        : isActive
          ? 'bg-amber-300 border-amber-100'
          : 'bg-amber-400/80 border-amber-100/80';

  return (
    <div className="flex flex-col items-center gap-1.5 select-none touch-none">
      <div
        ref={baseRef}
        role="application"
        aria-label={label}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ width: size, height: size }}
        className={`relative rounded-full border-2 flex items-center justify-center touch-none select-none cursor-grab active:cursor-grabbing transition-colors duration-150 ${ringClass}`}
      >
        {/* Subtle inner crosshair guide */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-2 h-2 rounded-full bg-slate-500/40" />
        </div>

        {/* Draggable thumb knob */}
        <div
          style={{
            width: Math.round(size * 0.4),
            height: Math.round(size * 0.4),
            transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
          }}
          className={`rounded-full border-2 shadow-lg pointer-events-none ${knobClass}`}
        />
      </div>
      <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}
