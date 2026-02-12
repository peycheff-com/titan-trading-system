# Observability: M11 (Titan Console)

## Logs
- **Mechanism**: `console.log`, `console.warn`, `console.error`
- **Structured Fields**: None (Plain text)
- **Retention**: Browser session only

## Metrics
- **Performance**: Web Vitals (LCP, FID, CLS) - implicitly monitored by browser devtools
- **Business**: None locally (relies on M12 API for backend metrics)

## Alerts (User Feedback)
- **Library**: `sonner` / `toast`
- **Levels**:
    - `toast.success`: Action confirmed
    - `toast.warning`: Non-critical issues
    - `toast.error`: API failures, critical errors
