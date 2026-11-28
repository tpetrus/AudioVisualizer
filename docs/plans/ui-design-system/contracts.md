# UI design system: frozen contracts

Plan `ui-design-system` r1 (hash 0d5f23ce9d2af8a3). Branch `feat/ui-design-system`, cut from `origin/main` e0237ce
(the plan's base c03849a predates the enhanced graphics work; D5 expected this). Workers code against this file; only
the orchestrator changes it.

## S0 findings: enhanced graphics on origin/main

| What | Where | Notes |
|---|---|---|
| Store | `app/features/settings/enhancedGraphicsStore.ts` | `ENHANCED_GRAPHICS_KEY = 'audioVisualizer.enhancedGraphics'`, values `'true'`/`'false'`; `getEnhancedGraphics()`, `setEnhancedGraphics(on)`, `subscribeEnhancedGraphics`. Turning it off stores `'false'`, so "a value is stored" means `getItem(key) !== null`. |
| Hook | `app/features/settings/useEnhancedGraphics.ts` | `useEnhancedGraphics(): boolean` via `useSyncExternalStore`, server snapshot false. |
| Capability gating | `app/features/settings/capability.ts`, `useCapabilityHint.ts` | Idle-time WebGL 2 probe (texture size at least 8192, deviceMemory at least 8, at least 8 cores, no software renderer). `useCapabilityHint(enabled)` is true only when the probe passes; it shows "Your device can likely handle this" while the setting is off. |
| UI | `app/components/EnhancedGraphicsToggle/EnhancedGraphicsToggle.tsx` + `strings.ts` | `<button role="switch" aria-checked>`, name "Enhanced graphics", On/Off text `aria-hidden`, `aria-describedby` description, optional `status` live region. Props `{ status?, className?, description? }`. |
| Landing placement | `app/features/landing/LandingPage.tsx` | Under the "Connect audio" line, centered, above the cards. |
| Panel placement | `ControlPanel` `header` prop, passed by `CubesPage.tsx` and `DancingCharacterPage.tsx` | Rendered above the first `<details>` section, not inside one. |
| Slow notice | `app/features/settings/SlowFrameNotice.tsx` | Non-modal bar with two buttons; restyled in PR1 like any other UI. |
| Tests that pin behavior | `e2e/enhanced-graphics.spec.ts`, `e2e/cubes-enhanced.spec.ts`, page unit specs | `getByRole('switch', { name: /Enhanced graphics/ })`, `aria-checked`, **Space and Enter both toggle it**. |

Parallel branches (`feat/bass-ink-enhanced-graphics`, `feat/trio-enhanced-graphics`) are likely to pass
`header={<EnhancedGraphicsToggle ... />}` from their pages too. So `EnhancedGraphicsToggle`'s path, name and props stay as
they are in both PRs. Only its rendering changes, so those branches merge without edits.

## C1 Design tokens (css), frozen in `app/app.css`

`@theme`: `--color-surface-0` (page), `--color-surface-1` (panels, dialogs), `--color-surface-2` (raised controls),
`--color-border`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-accent-hover`, `--color-accent-text`
(accent-colored text and the focus ring), status only: `--color-success`, `--color-warning`, `--color-danger`;
`--radius-ui`. Use them as utilities (`bg-surface-1`, `text-text-muted`, `border-border`, `rounded-ui`, `bg-accent`,
`text-accent-text`, `bg-success`, ...) or as `var(--color-...)` in CSS Modules. Translucent overlays use the opacity
modifier (`bg-surface-1/90`) or `color-mix(in srgb, var(--color-surface-1) 90%, transparent)`. No gradients, no other
color literals in UI code: no hex, `rgb()`/`hsl()`, or Tailwind palette utilities (`gray-*`, `blue-*`, ...). `black` and `white` stay allowed only where a token cannot do the job: the dialog backdrop (`bg-black/75`), the title banner's black (it matches the pre-rendered image), and white text on the primary button. The lint guard in `eslint.config.js` enforces the same line.

The base layer gives the pointer to button, a[href], summary, select, label[for], checkbox, radio, range, color,
[role=switch], [role=button]; not-allowed to :disabled and [aria-disabled=true]; and one `:focus-visible` outline.
Primitives need not repeat those rules.

Refinement against the plan: `--color-accent-text` added, because the accent that keeps white button text above 4.5:1
is too dim as text on the dark surfaces.

## C2 Primitive props (react), `app/components/ui/`

One file per primitive (`Button.tsx`, ...), each with a spec, and named exports re-exported from
`app/components/ui/index.ts`. Every primitive accepts `className` (appended last) for layout only (margin, width, flex),
never colors.

- `Button`: `ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' }`,
  defaults `secondary` and `md`, and `type="button"` unless given; forwards `ref` (React 19 `ref` prop). primary = filled
  accent with white text; secondary = surface-2 with a 1px border; ghost = no fill or border, muted text that brightens
  on hover. Disabled: 50% opacity, no hover change.
- `IconButton`: `Button` props with `'aria-label': string` required; square, for the close, lock, reset view and
  fullscreen buttons.
- `Switch`: `{ checked: boolean; onCheckedChange: (checked: boolean) => void; label: ReactNode; disabled?: boolean;
  id?: string; 'aria-describedby'?: string; className?: string }`. Renders `<button type="button" role="switch"
  aria-checked>`; Space and Enter toggle it (native button behavior). It contains a small track and thumb (accent when
  on, surface-2 with a border when off), the label, and a visible "On"/"Off" text marked `aria-hidden` so the accessible
  name is the label alone. Refinement against the plan: a button, not `input type=checkbox`, because the enhanced
  graphics e2e spec toggles it with Enter, which a checkbox ignores. `getByRole('switch', { name })`, `aria-checked`,
  `toBeChecked()` and Playwright's `check()` all keep working.
- `Checkbox`: `{ checked: boolean; onCheckedChange: (checked: boolean) => void; label: ReactNode; id?: string;
  disabled?: boolean; className?: string }`. A native `input type="checkbox"` with `accent-color` set to the accent,
  inside its `label`. Role and name stay the same, so `getByRole('checkbox', { name: 'Show performance stats' })`
  holds. (Added to the plan's list.)
- `Dialog`: `{ title: ReactNode; onClose: () => void; closable?: boolean; children: ReactNode; className?: string }`,
  `closable` defaulting to true. Mounted means open: callers keep rendering it conditionally, as they do today, so there
  is no `open` prop. Renders the full-screen backdrop (`z-[1050]`, black at 75%, like today) and a `div role="dialog"
  aria-modal="true"` whose `aria-labelledby` points at the `h2` holding `title`, with `tabIndex={-1}`. On mount, focus
  moves to the dialog; on unmount, it goes back to the element that had it. Tab and Shift+Tab wrap inside the dialog.
  Escape and a backdrop click call `onClose` only when `closable`, and the close `IconButton` (`aria-label="Close"`)
  renders only then. The panel is surface-1 with a border and `rounded-ui`, `max-w-[780px]` unless `className` overrides
  it.
- `Section`: `{ title: ReactNode; children: ReactNode; className?: string }`. A titled group: an `h3` styled as a small
  uppercase muted heading, then the content.
- `Field`: `{ label: ReactNode; htmlFor: string; hint?: ReactNode; children: ReactNode; className?: string }`. A
  `<label htmlFor>` with its control and an optional muted hint.
- `Select`: `SelectHTMLAttributes<HTMLSelectElement>`, a native `select` on surface-2 with a border and `rounded-ui`;
  the options get the same colors.
- `Range`: `Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>`, a native `input type="range"` with `accent-color` set
  to the accent.
- `Badge`: `{ children: ReactNode; tone?: 'accent' | 'neutral' | 'warning'; className?: string }`, a small inline label
  such as "Recommended" or "2 changed".

Overriding a primitive's own utilities: which of two conflicting Tailwind utilities wins depends on their order in
the stylesheet, not in the class string, so a `className` that conflicts with a primitive's own class has no reliable
effect. `Dialog` drops its default `max-w-[780px]` when `className` has a `max-w-`. For a one-off color, such as the
fullscreen exit control's scrim over the scene, use the important modifier (`bg-surface-0/70!`).

## C3 Prompt seen flag (storage), PR2 (S5) only

`localStorage['audioVisualizer.enhancedGraphicsPromptSeen'] = '1'`. The wrappers live beside the store in
`app/features/settings/enhancedGraphicsPromptStore.ts`. Refinement: the plan said `app/features/audio/storage.ts`, but
this is a settings value and belongs next to the key it depends on. `shouldShowEnhancedGraphicsPrompt(): boolean` is true
only when the flag is absent, `ENHANCED_GRAPHICS_KEY` is absent, and storage can be read and written; any throw reads
as false. `markEnhancedGraphicsPromptSeen(): void` never throws. Turn on calls `setEnhancedGraphics(true)`, then marks
the prompt seen. Not now and Escape only mark it seen. Follow-up UDS-F5: it is also marked seen as soon as it opens, so a
reload or a closed tab instead of an answer does not show it again.

## C4 Enhanced graphics binding (react), frozen

UI reads the setting only through `useEnhancedGraphics()` and writes it only through `setEnhancedGraphics(on)`; the
capability hint comes only from `useCapabilityHint(enabled)`. The store, hook, key, values and probe do not change. The
export `EnhancedGraphicsToggle` and its props `{ status?, className?, description? }` stay (see the parallel branches
above).

## Q1, approved by the user on 2026-11-27 (design for S5, PR2)

1. Control: `EnhancedGraphicsToggle` (path, name and props unchanged) renders the `Switch` primitive (track and thumb in
   the accent when on, visible On/Off) labelled "Enhanced graphics", a `Badge` "Recommended" beside it, the description
   and the existing status live region.
2. Placement: a `Section` titled "Graphics" holds it, both on the landing page (between the audio line and the cards) and
   as the first block of the open settings panel. The panel keeps rendering it through the existing `header` prop, so
   the visualizer pages do not change.
3. First-visit prompt, `app/features/landing/EnhancedGraphicsPrompt.tsx`, on `Dialog`: title "Turn on enhanced
   graphics?", body "Richer lighting, glow and depth in the visualizers. Needs a strong GPU, and the dancing character
   downloads up to about 30 MB. You can change this any time in Graphics settings." (widened from the approved "Richer
   lighting, reflections and sky" once main gave the cubes, the trio and bass ink an enhanced look too), buttons Turn on (primary, focused first) and Not now (secondary).
   Behavior is set by C3: it shows once, never when an enhanced graphics value is stored, and never while the audio
   source dialog is open.
4. Gating: the Recommended badge and the prompt both depend on `useCapabilityHint`. The badge replaces the old "Your
   device can likely handle this" line and shows only while the hint is true (the setting is off and the probe
   passed). The prompt opens only once the probe resolves true, which is after first paint by construction (idle
   callback). Software-GL e2e runs therefore never see it, so its dedicated e2e spec fakes a capable probe with an init
   script (WebGL 2 parameters, the renderer and navigator.deviceMemory and hardwareConcurrency) and, unlike the rest of
   the suite, does not seed the flag.
