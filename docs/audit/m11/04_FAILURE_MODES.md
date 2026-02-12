# Failure Modes: M11 (Titan Console)

| # | Failure Mode | Trigger | Detection Signal | Auto Containment | Manual Runbook | Impact | Recovery |
|---|-------------|---------|-----------------|-----------------|----------------|--------|----------|
| 1 | **API Unreachable** | Backend down / Network partition | `fetch` throws `NetworkError` | Toast notification, disable controls | Verify backend status | Ops Blindness | Retry logic (auto) |
| 2 | **WebSocket Disconnect** | Socket closure / timeout | `onclose` event | Show "Offline" badge | Refresh page | Stale Data | Reconnect w/ backoff |
| 3 | **Auth Expiry** | JWT expiration | 401 Unauthorized | Redirect to Login | Relogin | Session End | Re-authenticate |
| 4 | **State Hash Drift** | Concurrent modification | 409 Conflict | Prompt user to refresh | Refresh page | Cmd Rejection | Refresh & Retry |
| 5 | **Replay Data Gap** | Missing history in Brain | 404 / Empty response | Toast error | Check Brain storage | Incomplete Replay | None (Data missing) |
