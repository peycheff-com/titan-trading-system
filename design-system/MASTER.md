# Titan Operator Console - Master Design System
> Generated via UI-UX-PRO-MAX Principles (Manual Fallback)

## 1. Core Identity
- **Product**: Titan Operator Console (Fintech/Crypto Control Plane)
- **Theme**: "Sovereign Citadel" (Dark Mode First, High Contrast)
- **Font**: Inter (headings & body) + JetBrains Mono (code/data)

## 2. Color Palette (Tailwind)

### Base (Slate)
- `bg-background`: `slate-950` (#020617)
- `bg-surface`: `slate-900` (#0f172a)
- `bg-surface-highlight`: `slate-800` (#1e293b)
- `border-default`: `slate-800` (#1e293b)
- `text-primary`: `slate-50` (#f8fafc)
- `text-secondary`: `slate-400` (#94a3b8)
- `text-muted`: `slate-600` (#475569)

### Accents (Functional)
- **Primary (Action)**: `indigo-500` (#6366f1) -> Hover: `indigo-400`
- **Success (Health)**: `emerald-500` (#10b981)
- **Warning (Risk)**: `amber-500` (#f59e0b)
- **Danger (Kill/Stop)**: `rose-500` (#f43f5e)
- **Info (Telemetry)**: `sky-500` (#0ea5e9)

### Gradients (Glassmorphism)
- **Card**: `bg-slate-900/50 backdrop-blur-md border border-slate-800`
- **Active Item**: `bg-indigo-500/10 border-indigo-500/20 text-indigo-400`

## 3. Typography
| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| H1 (Page Title) | `text-3xl` | `font-bold` | `leading-tight` |
| H2 (Section) | `text-xl` | `font-semibold` | `leading-snug` |
| Body | `text-sm` | `font-normal` | `leading-relaxed` |
| Data/Mono | `text-xs` | `font-mono` | `leading-none` |
| Label | `text-xs` | `font-medium` | `uppercase tracking-wider` |

## 4. Components

### Cards
```jsx
<div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 shadow-xl">
```

### Buttons
- **Primary**: `bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all active:scale-95`
- **Destructive**: `bg-rose-900/50 text-rose-200 border border-rose-800 hover:bg-rose-900 transition-colors`
- **Ghost**: `hover:bg-slate-800 text-slate-400 hover:text-white transition-colors`

### Inputs
- `bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-600`

## 5. Effects & Animation
- **Transition**: `duration-200 ease-out`
- **Hover**: `hover:border-slate-600`
- **Focus**: `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500`

## 6. Iconography
- **Set**: Lucide React
- **Size**: `w-4 h-4` (default), `w-5 h-5` (navigation)
- **Stroke**: `stroke-[1.5]` (elegant)

## 7. Anti-Patterns (DO NOT USE)
- ❌ No Emoji Icons (Use Lucide)
- ❌ No `bg-black` (Use `slate-950`)
- ❌ No Default Scrollbars (Use `scrollbar-thin scrollbar-thumb-slate-700`)
- ❌ No Layout Shift on Hover (Use `border-transparent` vs `border-color`)
