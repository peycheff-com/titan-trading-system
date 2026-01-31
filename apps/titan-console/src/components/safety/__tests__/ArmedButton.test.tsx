import { render, screen, fireEvent, act } from '../../../test/utils';
import { vi } from 'vitest';
import { ArmedButton } from '../ArmedButton';

describe('ArmedButton', () => {
    it('should render in default state', () => {
        render(<ArmedButton onExecute={vi.fn()} />);
        expect(screen.getByText('Hold to ARM')).toBeInTheDocument();
    });

    it('should NOT trigger execute on simple click', () => {
        const onExecute = vi.fn();
        render(<ArmedButton onExecute={onExecute} />);
        
        const button = screen.getByRole('button');
        fireEvent.mouseDown(button);
        fireEvent.mouseUp(button);
        
        expect(onExecute).not.toHaveBeenCalled();
    });

    it('should trigger execute after long press', async () => {
        vi.useFakeTimers();
        const onExecute = vi.fn();
        render(<ArmedButton onExecute={onExecute} />);
        
        const button = screen.getByRole('button');
        
        // Start hold
        fireEvent.mouseDown(button);
        
        // Fast forward timers
        act(() => {
            vi.advanceTimersByTime(2000); // Assume 1.5s threshold
        });
        
        expect(onExecute).toHaveBeenCalled();
        
        vi.useRealTimers();
    });

    it('should reset if released early', async () => {
        vi.useFakeTimers();
        const onExecute = vi.fn();
        render(<ArmedButton onExecute={onExecute} />);
        
        const button = screen.getByRole('button');
        
        // Start hold
        fireEvent.mouseDown(button);
        
        // Advance partial time
        act(() => {
            vi.advanceTimersByTime(500);
        });
        
        // Release early
        fireEvent.mouseUp(button);
        
        // Advance rest of time
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        
        expect(onExecute).not.toHaveBeenCalled();
        
        vi.useRealTimers();
    });
});
