# Review: 5-Theme Painterly Engine Plan

Suggested changes to the implementation plan, in rough priority order.

The plan is solid and the root-cause analysis is good, especially the 0.18 × 0.42 opacity bug. The changes below are grouped by theme.

## Correctness and performance risks

**1. Rain math is slightly off, and the fix is aggressive.** The 7.5% figure is right. But 0.80 × 0.85 = 68% at the *peak* of a 1.5px line, and the gradient is only at peak for 16% of its length (42–58%). Effective visibility will be lower than "68%" suggests. Also, 48–64 simultaneously animated full-height elements is a lot for a Snapdragon 632. Suggested changes:

- Start at 32 drops (rain) / 44 (storm) and raise only if it looks thin.
- Use one drop element type with `will-change: transform` and animate only `transform`, with the opacity set statically.
- Consider a single `<canvas>` for rain if DOM drops stutter. One canvas draw loop is often cheaper than 60 compositor layers on low-end Adreno.

**2. Layer count on a low-end GPU.** Every `translate3d` or `will-change` element becomes its own compositor layer. Meadow has 3 hills, clouds, foliage, leaves, sun, stars, and rain, which adds up. Mitigations:

- Make hills **static** (no animation) and merge them into one SVG so they're one layer.
- Only animate clouds, rain, and leaves.
- Pause all animations when the tab is hidden or the dashboard isn't the active tab (`animation-play-state` via a class, or unmount).

**3. Respect `prefers-reduced-motion` and battery.** The app already polls battery. Add a "low power" mode that drops to AMOLED-like behavior below \~20% battery, or freezes the scene animations. That's a nice fit for a phone-as-dashboard.

**4. The "\~1900 LOC in one file" decision is the weak one.** The reasoning ("fewer HTTP requests") doesn't hold up. Vite bundles everything into one JS file regardless of source layout, so splitting source files costs nothing at runtime. A single 1900-line component will hurt maintainability and AI-assisted edits, where partial-file edits get riskier as the file grows. Split into `themes/palettes.ts`, `scenes/*.tsx`, and `overlays/*.tsx`, and still ship one bundle. Use `React.lazy` for AbstractScene and LakeScene if you want to shave initial load.

## Design and visual quality

**5. Cloud construction.** Ellipses plus a flat rect base will read as a cartoon cloud with a hard bottom edge, which can look clip-art-like next to painterly hills. Options:

- Drop the rect and use a path with a softly curved base.
- Add a vertical linear gradient fill per cloud (light top, shaded bottom) instead of separate flat fills.
- Use 3–4 distinct cloud *shapes* (different bump counts) rather than reusing one, so repeats aren't obvious.
- Avoid `feGaussianBlur` for softness, given the no-blur rule; stacked low-opacity ellipses give a similar edge.

**6. Palette tables have a few dips.**

- Meadow night `skyBot [34,48,82]` is lighter than `skyMid`'s neighbors would suggest. That is fine for a horizon glow, but check that hills stay darker than the sky at night, or they'll look like cutouts glowing.
- Lake dawn `lakeWater [138,128,152]` is lighter than `mountain1`, so the water may read as sky again, which is the exact bug #4 being fixed. Water should be slightly *darker and more saturated* than the horizon sky, with reflection via the shimmer bars, not via matching color.
- Interpolate in a perceptual space (OKLab, or at least gamma-corrected RGB). Linear lerp between dawn pink and day blue passes through muddy gray.

**7. Weather should tint the palettes, not only the clouds.** `computeMeadowAtmosphere(hour, weather)` takes weather, but the spec only describes clouds and rain. Spell out a desaturation and darkening factor per weather:

- Rain: saturation ×0.7, brightness ×0.85
- Storm: saturation ×0.55, brightness ×0.7
- Fog: blend toward a gray with distance-based haze, so far hills fade more than near ones

Green hills under a storm sky look wrong otherwise.

**8. Atmospheric perspective.** Far hills and mountains should be lower contrast and slightly bluer than near ones. The tables already trend that way. Make it a formula (`mix(color, skyBot, depth * haze)`) so fog and rain automatically increase haze.

## Spec gaps

**9. Specify transitions.** What happens when the user presses `M` or `T`? Without a crossfade, palettes snap. A 600–800ms opacity crossfade between two scene layers is cheap (opacity only) but doubles layer count briefly. Alternatively, interpolate palette values with CSS custom properties and a `transition` on background color.

**10. Live-mode edge cases.**

- Define dawn/sunset based on actual sunrise/sunset from the Open-Meteo response, not fixed hours (05:30, 18:15). It is already fetching the API and returns those fields. Kolkata's sunset varies by about 1.5 hours across the year.
- Handle API failure: fall back to the last known weather, then to `cloud`.
- Map Open-Meteo WMO weather codes to the 5 types explicitly (e.g. 45/48 → fog, 51–67/80–82 → rain, 95–99 → storm). Add that table to the plan.

**11. Ambient Dark vs AMOLED differences should be clear.** Ambient Dark animates stars and waves, so it isn't free of GPU cost. If battery matters, note the cost difference in the label or the settings. Also, on an actual AMOLED panel, pure `#000` pixels are off, so keep any "whisper wave" alphas at truly low values, which the plan already does.

**12. Theme persistence.** Save `themeMode`, `timeMode`, and the weather override to `localStorage` so a page reload doesn't reset to Meadow.

**13. Contrast check for UI chrome.** The Warm Nude text colors (`#E6E2DD`, `#C8BBAE`) were tuned for dark backgrounds. The Meadow and Lake day palettes have bright skies (`[188,218,198]`), which could drop text contrast below WCAG AA. Either add a subtle scrim behind the dashboard cards, or make the card backgrounds semi-opaque dark glass. Verify during QA.

## Process

**14. The QA matrix is too large to do by hand.** 5 themes × 4 times × 3 weathers = 60 screenshots. Script it with Playwright, with a `?theme=&time=&weather=` URL param override so you can loop and diff. The URL params are also handy for debugging on the phone.

**15. Add a performance acceptance test.** Add measurable criteria: for example, no dropped frames over 30 seconds in Meadow + storm on the target device, via Chrome's remote debugging FPS meter. The risk table calls out Adreno 506 but has no pass/fail gate.

**16. Estimated times are optimistic.** Phase 2 (two new scenes with SVG art, clouds, foliage, shimmer) at 25 minutes is unlikely to survive contact with visual tuning. Budget it as the longest phase, and ship Meadow first, then Lake, rather than both at once.

## Small nits

- Bug table #3 says "hills all blue" while section 2 says Abstract's palette is "kept as-is". Confirm that Abstract doesn't also get weather tinting from the new system, so behavior stays consistent.
- `floatLeaf` at `translate3d(120vw, 30vh)` over 12–18s should use negative `animation-delay` values so leaves are already mid-flight on load.
- The mermaid diagram shows the theme cycle but not the reverse `M` behavior (Shift+M), which is a cheap addition.

## Suggested next steps

The least ambiguous pieces to start with are the weather-code mapping table and the palette interpolation function. The plan itself can also be rewritten with all of the above folded in.
