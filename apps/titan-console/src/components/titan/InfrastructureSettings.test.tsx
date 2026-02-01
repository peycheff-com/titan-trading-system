import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InfrastructureSettings } from './InfrastructureSettings';

// Mock fetch
const mockFetch = vi.fn();

global.fetch = mockFetch;

// Mock child components to simplify test (optional but cleaner)
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('InfrastructureSettings', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('renders loading state initially', () => {
    // Mock slow response
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<InfrastructureSettings />);
    expect(screen.getByText(/Loading Infrastructure Status/i)).toBeInTheDocument();
  });

  it('renders services when data loads', async () => {
    const mockData = {
      services: [
        { name: 'Titan Brain', status: 'healthy', uptime: 3600, lastRestart: 0, errorRate: 0 },
      ],
      backups: [],
      standby: { status: 'ready', syncLag: 0 },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    render(<InfrastructureSettings />);

    // Wait for Loading to disappear
    expect(await screen.findByText('Titan Brain')).toBeInTheDocument();
    expect(screen.getByText('HEALTHY')).toBeInTheDocument();
  });
});
