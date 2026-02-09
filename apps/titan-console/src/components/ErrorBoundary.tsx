import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.name || 'Unknown'}:`, error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div role="alert" className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-muted-foreground animate-in fade-in zoom-in duration-300">
            <div className="mb-4 rounded-full bg-destructive/10 p-3 text-destructive">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="mb-1 text-lg font-semibold text-foreground">Something went wrong</h3>
            <p className="mb-4 text-xs font-mono max-w-[300px] truncate text-muted-foreground bg-muted/50 p-1 rounded">
              {this.state.error.message}
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={this.reset}
              className="gap-2 focus-titan"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Try Again
            </Button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
