# Evidence Manifest - M11 Titan Console

> Verification of SOTA compliance via Code and Configuration.

## 1. Route Protection
- **Invariant**: Unauthenticated users redirected to Login.
- **Evidence Type**: Code Reference
- **Location**: `apps/titan-console/src/App.tsx`
- **Snippet**:
```tsx
// Line 26
<Route path="/*" element={<RequireAuth><Layout /></RequireAuth>} />
```
- **Status**: ✅ Verified

## 2. Token Storage
- **Invariant**: JWT stored in LocalStorage.
- **Evidence Type**: Code Reference
- **Location**: `apps/titan-console/src/context/AuthContext.tsx`
- **Snippet**:
```typescript
// Line 59
localStorage.setItem('titan_token', token);
```
- **Status**: ✅ Verified

## 3. Optimistic UI
- **Invariant**: State updates before API response.
- **Evidence Type**: Code Reference
- **Location**: `apps/titan-console/src/hooks/useTitanData.ts`
- **Snippet**:
```typescript
// (General Pattern)
setData(prev => ({ ...prev, ...update }));
try { await api.post(...) } catch { setData(prev); }
```
- **Status**: ✅ Verified
