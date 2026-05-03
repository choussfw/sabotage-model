# MAIM — Strike-scenario tool with AIFP backend

Interactive UI for modeling how strikes on AI infrastructure delay capability
milestones. Uses the AI Futures Project (AIFP) Python model to compute the
software-progress curve given each strike scenario's compute timeline.

## Quick start (two services)

1. **Start the AIFP Flask backend** (runs the Python model):

   ```bash
   cd ../ai-futures-calculator\ \(1\)
   ./.venv/Scripts/python.exe -m flask --app api/index run -p 5328 --host 127.0.0.1
   ```

   Expected: `Running on http://127.0.0.1:5328`.

2. **Open the MAIM UI**. Two options:

   - **Pre-built single HTML** (self-contained): double-click `dist/index.html`
     in a browser. Works offline if Flask isn't running — falls back to the
     local JS legacy algo model (MAIM saturating-speedup).
   - **Dev server with hot-reload**: `npm install && npm run dev`, then open
     the URL it prints (usually `http://localhost:5173`).

3. The backend status indicator (top-right of the AIFP panel) should turn green
   (`● connected`) within a few seconds.

## Architecture

```
┌──────────────────────────────┐       POST /api/maim-trajectory
│  MAIM (React, in browser)    │ ────────────────────────────────┐
│  - Strike scenarios          │                                 │
│  - Compute timelines         │                                 ▼
│  - FLOP-budget milestones    │       ┌──────────────────────────────┐
│                              │ ◄──── │  Flask /api/maim-trajectory │
│  algoAt(t) ← backend curve   │       │  → AIFP ProgressModel       │
│  (falls back to local MAIM)  │       │  → returns algo_multiplier  │
└──────────────────────────────┘       └──────────────────────────────┘
```

Each UI change that affects a scenario's compute timeline triggers one POST.
Payload includes all relevant scenarios (US baseline, US-under-attack, US-SC-only)
in a single request so the backend runs them in one pass.

The backend consumes MAIM's post-strike compute timeline (leading-company H100-eq)
and multiplies by a canonical allocation split (experimental=0.50, internal=0.05)
to produce `experiment_compute` and `inference_compute` for AIFP's `ProgressModel`.
`training_compute` stays at AIFP's native input_data.csv values. The returned
`software_progress_cumulative(t)` curve is anchored at 2026 = 1 and used as
MAIM's `algoAt(t)` multiplier in its training-run search.

## Framing: FLOP-budget milestones (operational)

The scoreboard uses **FLOP-budget completion**: for each capability milestone
(AC, SAR, TED-AI, SIAR, ASI) there's a target effective-FLOP number read off
AIFP's timelines chart. MAIM searches for the earliest date a training run of
that size could complete, given the post-strike compute timeline and the
AIFP-derived algo-multiplier curve. A strike scenario that happens after the
baseline completion date doesn't affect that milestone (it already shipped).

Why FLOP-budget and not progress-threshold: your question is "how much sabotage
is needed to delay a training run," which is operational. The FLOP-budget view
makes the unit of analysis concrete (destroy the clusters → force a wait). The
backend still provides the software-progress curve (with automation feedback),
so algorithmic-progress effects propagate correctly.

## Presets

Currently only the **default** preset is wired. `eli` / `daniel` buttons were
removed — eli adds essentially the same parameters as default (just a 2.5-month
horizon-anchor shift), and daniel redefines AC at a much lower horizon
threshold (1 work-year vs 125), which collapses AC → ASI to ~10 months and
creates disagreement with the user-set FLOP-budget targets. Re-add by editing
the preset buttons in [src/App.jsx](src/App.jsx).

## Overrides

Click `▶ advanced overrides` in the AIFP panel to override individual
parameters on top of the preset. Blank = use default. Parameters:

- `present_doubling_time` — time-horizon doubling time at the reference year (yr).
  **This is the dominant knob.** 0.2 → AC in 2027; 0.8 → AC in 2030.
- `doubling_difficulty_growth_factor` — ≥1; how fast doubling slows with progress
- `software_progress_rate_at_reference_year` — OOM/yr at 2025; default 1.0.
  The actual sw-rate knob. AIFP derives `r_software` from this — passing
  `r_software` directly is a silent no-op.
- `ai_research_taste_slope` — taste growth per OOM progress
- `ac_time_horizon_minutes` — AC milestone threshold in work-minutes

To override a param not in this list, edit [src/App.jsx](src/App.jsx) and add
another entry to the `aifpOverrides` / overrides UI. Any param accepted by
[progress_model.Parameters](../ai-futures-calculator\ \(1\)/progress_model/parameters.py)
is passable via the `overrides` dict.

## Re-enabling China

Set `const MODEL_CHINA = true;` near the top of [src/App.jsx](src/App.jsx). The
scoreboard regains its China column, the stats cards show China, and the "US
strikes China" attack panel reappears. Backend already supports multi-country
scenarios in one request. Note: AIFP's model is single-country; running each
country through independent AIFP calls gives nearly-identical rates because of
the semi-endogenous growth property (rate insensitive to compute LEVEL, only to
compute GROWTH). CN ends up close to US unless you introduce asymmetry via
`initial_progress` offsets.

## Build a new single-file HTML

```bash
npm run build
```

Output: `dist/index.html` (~303 KB, fully self-contained React + all state).

## Changelog

### v0.3 — AIFP backend integration + operational cleanup
- **AIFP Python backend** via new Flask endpoint `/api/maim-trajectory` ([ai-futures-calculator/api/maim_trajectory.py](../ai-futures-calculator\ \(1\)/api/maim_trajectory.py)). Posts per-scenario compute timelines; backend runs real AIFP `ProgressModel` (automation + taste + horizon dynamics) and returns `algo_multiplier(t)` curves. MAIM uses those in its training-run search.
- **Bug**: pre-2024 compute was being flat-extrapolated at MAIM's 2024 value, which made AIFP see a sharp ramp at 2024 and trigger takeoff ~3 years early. Fix: preserve AIFP's native experiment_compute values outside the MAIM-provided year range. Integration time range extended to `[2017, 2040]` so AIFP starts from its natural calibration anchor.
- **Bug**: all post-strike scoreboard dates were clustering at a single value (~2032.4). Root cause: strikes were treating milestones that completed *before* the strike date as still-in-progress. Fix: if baseline completion < strike date, post-strike = baseline.
- **Bug**: cache key for the backend fetch didn't include `aifpOverrides`, so override changes were ignored. Fixed.
- **Wartime / backend-alloc decoupled**. Earlier we sent wartime `alloc.experimental` directly to the backend; AIFP's calibration loop then recalibrated `r_software` and the horizon threshold in offsetting ways, producing the perverse "more experiment compute → later milestones" behavior. Fix: backend always receives canonical allocation (0.50 / 0.05). Wartime now only affects MAIM's local `postScale` (training-allocation channel). Wartime's algo-progress channel is NOT currently modeled; noted as a limitation.
- **Post-strike arrival times** column (red) added to the scoreboard next to baseline dates. Distinct from the earlier AIFP-internal-milestones view — both are "MAIM FLOP-budget completion," computed with no-strike vs surviving-sites + attack-algo-curve respectively.
- **Compute charts** (US / China) switched to log y-axis so the full 2024 → 2040 trajectory is readable in one view. Leading-company series now plots the actual post-strike compute timeline (from `computeStats`'s `survTimeline`), so the curves visibly drop and flatten under strike scenarios including continuous denial.
- **UI cleanup**: removed the intermediate "Use AIFP software-progress model (CES + r_software)" JS-port toggle and its six CES sliders. Backend is now the single path for all AIFP dynamics.
- **Defaults**: wartime allocation and nationalization both default **off**. Strike date defaults to March 2031. Default capability target is TED-AI (not Custom). Presets collapsed to just `default` (eli/daniel removed — see Presets section).
- **Strike-date slider** extended to 2026.25 – 2035.

### v0.2 — AIFP Medium port (JS), China removed (temp)
- Ported AIFP's CES experiment-capacity + r_software research-stock dynamics to JS (the "Medium port"). ~80 lines at the top of App.jsx. Replaced MAIM's saturating-speedup. Automation disabled in this port.
- `MODEL_CHINA = false` flag added. Hides CN scoreboard column, stats card, training-timeline row, and the "US strikes China" attack panel (since CN's development isn't tracked). CN-strikes-US attack logic still active — that's what the model simulates.
- Endpoint supports per-scenario `initial_progress` overrides (unused currently; would be the right lever for reintroducing CN with an "X OOMs behind US" calibration).

### v0.1 — baseline port of original MAIM JSX
- Wrapped the standalone MAIM JSX (originally a single 2835-line file from a previous Claude session) in a Vite + `vite-plugin-singlefile` build. Single `dist/index.html` output.
- Compute timeline extended to 2040 (AIFP_DATA + AIFP_MAX_CLUSTER + year filter).
- FLOP presets replaced with AC / SAR / TED-AI / SIAR / ASI at values read off AIFP's published timelines chart (Feb-2025 eFLOP). Internally shifted 1.125 OOM to March-2026 reference.
- Scoreboard added: baseline arrival dates per milestone.
- Dynamic training-timeline width (~120 px/year).
- Preemption semantics: "continuous denial" count restricted to clusters that would come online between strike date and post-sabotage completion.

## Known limitations

- **Wartime algo-progress channel not modeled**: when you flip wartime on, only the training-allocation speedup applies (via MAIM's postScale). The experimental-reallocation benefit to algorithmic progress is not captured, because routing it through AIFP's backend alloc factors triggers calibration pathology. A principled fix would require either (a) scaling the compute_timeline itself in a way that doesn't hit AIFP's level-invariance, or (b) deriving a wartime sw_rate bonus from first principles rather than from the allocation ratio.
- **Single country (US only)** in the current default. China can be re-enabled but AIFP's semi-endogenous growth makes CN look nearly identical to US in baseline unless asymmetric `initial_progress` is set.
- **MAIM FLOP-budget vs AIFP progress-threshold disagreement**: the scoreboard reports training-run completion dates, not AIFP's internal AC/SAR/ASI milestones. Under default parameters these roughly agree (5×10³¹ eFLOP ≈ AIFP's default AC threshold of 31.7 OOMs progress). Under presets that redefine `ac_time_horizon_minutes`, they diverge by months-to-years. See the "Framing" section.
