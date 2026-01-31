import React, { useState, useRef, useEffect } from 'react';

interface ArmedButtonProps {
  onExecute: () => void;
  label?: string;
  className?: string;
}

export const ArmedButton: React.FC<ArmedButtonProps> = ({ onExecute, label = 'Hold to ARM' }) => {
  const [isArming, setIsArming] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startArming = () => {
    setIsArming(true);
    timerRef.current = setTimeout(() => {
      onExecute();
      setIsArming(false);
    }, 1500); // 1.5s threshold
  };

  const cancelArming = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsArming(false);
  };

  return (
    <button
      className={isArming ? 'arming' : ''}
      onMouseDown={startArming}
      onMouseUp={cancelArming}
      onMouseLeave={cancelArming}
      onTouchStart={startArming}
      onTouchEnd={cancelArming}
    >
      {label}
    </button>
  );
};
