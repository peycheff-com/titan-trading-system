import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { getTitanBrainUrl } from '@/lib/api-config';
import { toast } from 'sonner';

/**
 * Reconstructed State Structure
 */
export interface ReconstructedState {
  equity: number;
  positions: unknown[];
  allocation: Record<string, unknown>;
  mode: string;
  armed: boolean;
  meta?: {
    requested_time: string;
    actual_time: string;
    is_historical: boolean;
  };
}

/**
 * Replay Context Type
 */
interface ReplayContextType {
  // State
  isReplayMode: boolean;
  isPlaying: boolean;
  currentTime: number; // Unix timestamp in ms
  playbackSpeed: number; // Multiplier (e.g., 1, 2, 5, 10)
  reconstructedState: ReconstructedState | null;
  loading: boolean;
  error: Error | null;

  // Actions
  toggleReplayMode: () => void;
  play: () => void;
  pause: () => void;
  seekTo: (timestamp: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
}

const ReplayContext = createContext<ReplayContextType | undefined>(undefined);

/**
 * Replay Provider Component
 */
export const ReplayProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // State
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [reconstructedState, setReconstructedState] = useState<ReconstructedState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs for interval and fetching
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Constants
  const STEP_SIZE_MS = 1000; // 1 second step for simple playback
  const REFRESH_RATE_MS = 1000; // UI refresh rate during playback

  // Toggle Replay Mode
  const toggleReplayMode = () => {
    if (isReplayMode) {
      // Exit Replay Mode
      setIsReplayMode(false);
      setIsPlaying(false);
      setReconstructedState(null);
      setCurrentTime(Date.now()); // Reset to now
      console.log('Exiting Replay Mode');
    } else {
      // Enter Replay Mode
      setIsReplayMode(true);
      setCurrentTime(Date.now() - 3600000); // Default to 1 hour ago
      console.log('Entering Replay Mode');
      // Fetch initial state
      fetchState(Date.now() - 3600000);
    }
  };

  // Fetch Historical State from Backend
  const fetchState = async (timestamp: number) => {
    // Abort previous request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const baseUrl = getTitanBrainUrl();
      const url = `${baseUrl}/operator/history/state?timestamp=${new Date(timestamp).toISOString()}`;
      
      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch historical state: ${response.statusText}`);
      }

      const data = await response.json();
      setReconstructedState(data.data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error fetching historical state:', err);
        setError(err);
        toast.error('Failed to load historical state');
      } else if (!(err instanceof Error)) {
        console.error('Error fetching historical state:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        toast.error('Failed to load historical state');
      }
    } finally {
      if (abortControllerRef.current?.signal.aborted === false) {
          setLoading(false);
      }
    }
  };

  // Seek To Timestamp
  const seekTo = (timestamp: number) => {
    setCurrentTime(timestamp);
    if (isReplayMode) {
      fetchState(timestamp);
    }
  };

  // Playback Logic
  const play = () => setIsPlaying(true);
  const pause = () => setIsPlaying(false);

  const stepForward = () => {
    const newTime = currentTime + (STEP_SIZE_MS * playbackSpeed);
    setCurrentTime(newTime);
    fetchState(newTime);
  };

  const stepBackward = () => {
    const newTime = currentTime - (STEP_SIZE_MS * playbackSpeed);
    setCurrentTime(newTime);
    fetchState(newTime);
  };

  useEffect(() => {
    if (isPlaying && isReplayMode) {
      intervalRef.current = setInterval(() => {
        setCurrentTime((prevTime) => {
          const newTime = prevTime + (STEP_SIZE_MS * playbackSpeed);
          fetchState(newTime); // This might be too frequent API calling, ideally debounce or batch
          return newTime;
        });
      }, REFRESH_RATE_MS / playbackSpeed); // Faster refresh for higher speed? Or larger steps?
      // Actually, standard video player logic: update time frequently, but maybe buffer frames.
      // Here, let's keep it simple: update time and fetch every X ms.
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, isReplayMode, playbackSpeed]);

  return (
    <ReplayContext.Provider
      value={{
        isReplayMode,
        isPlaying,
        currentTime,
        playbackSpeed,
        reconstructedState,
        loading,
        error,
        toggleReplayMode,
        play,
        pause,
        seekTo,
        setPlaybackSpeed,
        stepForward,
        stepBackward,
      }}
    >
      {children}
    </ReplayContext.Provider>
  );
};

/**
 * Hook to use Replay Context
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useReplay = () => {
  const context = useContext(ReplayContext);
  if (context === undefined) {
    throw new Error('useReplay must be used within a ReplayProvider');
  }
  return context;
};
