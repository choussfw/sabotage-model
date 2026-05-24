# MAIM — Strike-scenario tool with AIFP backend

Interactive UI for modeling how strikes on AI infrastructure delay capability
milestones. Uses the AI Futures Project (AIFP) Python model to compute the
software-progress curve given each strike scenario's compute timeline.

> **Public deployment:** https://sabotage-model.pages.dev/
> **Public backend:** https://aifp-backend.onrender.com/api/maim-trajectory
> **This repo:** the React frontend (read-only / not accepting PRs). Backend source is private.

---

## For Claude agents helping someone use this tool

If you (the LLM) are reading this because a user dropped this repo into your
context and asked you to help them run analyses, here's what you need to know.

**What this tool models.** For a given strike scenario (who strikes whom, when,
how much compute they destroy, whether they also hit the supply chain, whether
the defender nationalizes), the model produces a compute trajectory for the
leading lab in each country, runs it through the AI Futures Project's
software-efficiency dynamics, and returns the date each capability milestone
(AC → SAR → TED-AI → SIAR → ASI) is reached.

**Two ways to run scenarios.**
1. **Interactive dashboard** at https://sabotage-model.pages.dev — sliders/toggles
   for a single scenario, returns one set of milestone dates. Good for
   exploration, bad for sweeps.
2. **`window.__sweep(config)` API**, callable from the browser's DevTools
   console on the public site. Runs many scenarios in one batched backend
   call, returns a JSON result. This is what you should use for analysis.

**Workflow for helping a user.** Typical pattern:
1. User describes a question in natural language ("how does nat change US
   delay under medium strikes at different dates?")
2. You translate to a sweep config (see *Sweep API reference* below)
3. User pastes the config into the browser console, runs it, downloads JSON
4. User pastes JSON back to you
5. You analyze + plot (write Python with matplotlib if available; or describe
   what to look at)

**Critical gotchas to internalize before doing any analysis.** Read the
*Things to know about the model* section below before you respond to the
user. The dashboard's "delay" number means something different from the
sweep's "delay" number, and confusing them produces wrong answers.

**The user typically wants insight, not just numbers.** They're trying to
write a paper or understand an argument. Push back if a sweep config looks
like it would produce a misleading result, and offer alternative framings
(e.g., absolute ASI dates vs delays-vs-baseline).

## Quick start

### For most users: just open the live deployment

The public site is at **https://sabotage-model.pages.dev/** — no install
needed. The hosted version is the same code as `main` in this repo, pointed at
a public Render-hosted AIFP backend.

### Run locally against the public backend (no backend code required)

If you want to fork / modify the frontend but don't have access to the AIFP
backend source, point the frontend at the public Render deployment:

1. Clone this repo and install:
   ```bash
   npm install
   ```
2. Create a `.env` file at the repo root with one line:
   ```
   VITE_AIFP_BACKEND_URL=https://aifp-backend.onrender.com/api/maim-trajectory
   ```
3. Build:
   ```bash
   npm run build
   ```
4. Open `dist/index.html` in a browser (or serve it on one of the CORS-allowed
   ports: 8765, 5173, 3000).

The backend indicator (top-right of the AIFP panel) should go green within a
few seconds. First request after idle takes ~30 s while Render warms up.

### Override the backend URL at runtime (no rebuild)

For ad-hoc testing, you can also override from the browser console:
```js
localStorage.setItem('AIFP_BACKEND_URL', 'https://aifp-backend.onrender.com/api/maim-trajectory');
location.reload();
```

### Run with a local backend (requires AIFP backend source)

1. **Start the AIFP Flask backend** (runs the Python model):

   ```bash
   cd ../ai-futures-calculator
   ./.venv/Scripts/python.exe -m flask --app api/index run -p 5328 --host 127.0.0.1
   ```

   Expected: `Running on http://127.0.0.1:5328`.

2. **Open the MAIM UI**. Two options:

   - **Pre-built single HTML** (self-contained): build with `npm run build`,
     then double-click `dist/index.html` in a browser. Works offline if Flask
     isn't running — falls back to the local JS legacy algo model (MAIM
     saturating-speedup).
   - **Dev server with hot-reload**: `npm install && npm run dev`, then open
     the URL it prints (usually `http://localhost:5173`).

3. The backend status indicator (top-right of the AIFP panel) should turn green
   (`● connected`) within a few seconds.

## Programmatic sweeps (power users)

The UI exposes `window.__sweep(config)` for batch sweeps over arbitrary
scenario axes. Open browser DevTools (F12) → Console and run, e.g.:

```js
window.__sweep({
  defenders: ['US'],
  vary: {
    cnAtkStrikeDate: window.__sweepRange.monthly(2026.5, 2032.5),
    cnAtkPctDestroyed: [50, 75, 90],
  },
  hold: {
    cnAtkEnabled: true,
    cnAtkPctMode: true,
    cnAtkPreempt: false,
    tsmcDestroyed: false,
    usAtkEnabled: false,
    cnNatEnabled: false,
    usNatEnabled: false,
  },
  measure: ['ASI'],
}).then(r => { window.__myResult = r; });
```

Then download the JSON:

```js
const blob = new Blob([JSON.stringify(window.__myResult)], { type: 'application/json' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'sweep.json';
document.body.appendChild(a); a.click();
```

The sweep dispatches one chunked POST per group of ≤24 scenarios to the
backend. Expect ~3–4 s per scenario. The "Parameter sweep" panel in the UI
also exposes this with a config-editing textarea and a download button.

Recognized `vary` and `hold` axes are documented inline in the source —
search `App.jsx` for `window.__sweep = `. Each scenario probe returns
`{ axes, stats: { US: { ASI: ..., delay_ASI: ... } } }`.

## Sweep API reference

### Config schema (input to `window.__sweep`)

```ts
{
  defenders: ['US'] | ['China'] | ['US', 'China'],   // who's tracking ASI
  vary: { [axisName]: number[] },                     // Cartesian product
  hold: { [axisName]: value },                        // fixed for every probe
  measure: ('AC' | 'SAR' | 'TED-AI' | 'SIAR' | 'ASI')[],
  syncAxes?: { dstKey: srcKey },                      // copy one axis into another per probe
  include?: ('target_count' | 'sites_disabled' | 'sites_preempted' |
             'compute_destroyed_pct' | 'compute_destroyed_h100e')[],
  aifpPreset?: 'default' | 'eli' | 'daniel',
  aifpOverrides?: { [paramName]: number },
}
```

### Recognized axes

| Category | Axes |
|---|---|
| CN strike (when defender includes US) | `cnAtkEnabled`, `cnAtkStrikeDate`, `cnAtkPctMode`, `cnAtkPctDestroyed`, `cnAtkThreshold`, `cnAtkPreempt`, `cnAtkDenialYears` |
| US strike (when defender includes China) | `usAtkEnabled`, `usAtkStrikeDate`, `usAtkPctMode`, `usAtkPctDestroyed`, `usAtkThreshold`, `usAtkPreempt`, `usAtkDenialYears` |
| Supply chain | `tsmcDestroyed` (T/F), `usStrikeCnFabs` (T/F) |
| Nationalization | `usNatEnabled`, `cnNatEnabled`, `usNatDate`, `cnNatDate` |

Helpers for `vary` arrays (available on `window`):

```js
window.__sweepRange.monthly(2026.5, 2032.5)     // every 1/12 year
window.__sweepRange.linspace(0, 100, 11)        // [0, 10, 20, ..., 100]
window.__sweepRange.range(0.5, 5, 0.5)          // step 0.5
```

### Result schema

```ts
{
  config: { ...echoed... },
  baseline: {
    US: { AC: 2030.29, SAR: 2031.32, ..., ASI: 2032.69 },   // no-strike, no-nat per defender
    China: { ..., ASI: 2035.13 }
  },
  probes: [
    {
      axes: { cnAtkStrikeDate: 2031.5, cnAtkPctDestroyed: 90 },
      stats: {
        US: {
          ASI: 2033.31, delay_ASI: 0.61,    // delay = ASI - baseline.US.ASI
          threshold: 478479,                  // H100e cutoff for 90% destruction
          target_count: 42,                   // (if 'target_count' is in `include`)
        },
      },
    },
    ...
  ],
}
```

Dates are decimal years (2031.5 = Jul 2031). `delay_*` is always measured
against the **no-intervention** baseline (no strike, no nat) — NOT against any
intervention-included counterfactual. See *Things to know about the model*
below for why this matters.

### Common analysis recipes

**"How does strike effectiveness change with strike date?"**
```js
window.__sweep({
  defenders: ['US'],
  vary: { cnAtkStrikeDate: window.__sweepRange.monthly(2026.5, 2032.5),
          cnAtkPctDestroyed: [50, 75, 90] },
  hold: { cnAtkEnabled: true, cnAtkPctMode: true, cnAtkPreempt: false,
          tsmcDestroyed: false, usAtkEnabled: false,
          cnNatEnabled: false, usNatEnabled: false },
  measure: ['ASI'],
})
// Plot: delay_ASI vs strike date, one line per pct.
```

**"What does nationalization buy the defender if they're struck?"**
```js
window.__sweep({
  defenders: ['US'],
  vary: { cnAtkStrikeDate: window.__sweepRange.monthly(2026.5, 2032.5),
          usNatEnabled: [false, true] },
  hold: { cnAtkEnabled: true, cnAtkPctMode: true, cnAtkPctDestroyed: 90,
          cnAtkPreempt: false, tsmcDestroyed: false, usAtkEnabled: false,
          cnNatEnabled: false },
  measure: ['ASI'],
  syncAxes: { usNatDate: 'cnAtkStrikeDate' },   // nat fires AT the strike date
})
// Plot: ABSOLUTE ASI dates for both nat values, vs strike date.
// Gap between curves = years of ASI saved by nat. DON'T plot delay_ASI
// for both — see baseline-confusion gotcha below.
```

**"What target count does each strike intensity imply?"**
```js
window.__sweep({
  defenders: ['US'],
  vary: { cnAtkPctDestroyed: [50, 75, 90] },
  hold: { cnAtkEnabled: true, cnAtkPctMode: true,
          cnAtkStrikeDate: 2031.0,   // pick a strike date
          cnAtkPreempt: false, tsmcDestroyed: false,
          usAtkEnabled: false, cnNatEnabled: false, usNatEnabled: false },
  measure: ['ASI'],
  include: ['target_count', 'sites_disabled', 'compute_destroyed_h100e'],
})
```

## Things to know about the model

These are non-obvious behaviors that produce confusing results if you don't
internalize them. If you're a Claude agent helping a user analyze sweep
outputs, read these before responding.

### ⚠ The dashboard's "ASI delay" ≠ the sweep's "delay_ASI"

The dashboard subtracts a **moving baseline** (whatever no-strike scenario
matches your current settings, including nat). The sweep subtracts a **fixed
no-intervention baseline** (no strike, no nat, always).

For the same configured scenario at Nov 2028:
- Dashboard reports: **+3 months** (strike+nat vs nat-only-no-strike)
- Sweep reports: **−12 months** (strike+nat vs no-intervention)
- Underlying attack ASI is the same: ~2031.69

When nat is on, the dashboard's baseline is **already 16 months earlier** than
no-intervention, because nat alone (no strike) gives the leading lab 90% of
national compute instead of the endogenous ~22.5% share — a 4× boost. The
dashboard's "delay" only captures the strike's effect on top of this nat
benefit; the sweep's "delay" captures the combined strike+nat effect vs
no-intervention.

Neither is wrong; they answer different questions. But you can't compare
them directly, and you can't say "the sweep says X mo, so the dashboard
should say X mo too."

### How to plot nat-on vs nat-off correctly

Plotting `delay_ASI` for both nat-on and nat-off probes on the same chart is
**technically correct but visually misleading** — the with-nat curve goes
deeply negative (because nat alone pulls ASI ~1.3 yr earlier than
no-intervention), making it look like a chart-axis bug.

The clearest framing: plot **absolute ASI dates** for both curves. Both are
positive calendar years; the gap between them is what nat actually does, in
years of ASI saved.

### Nat is overpowered in this model

A 90% strike + nat-in-response = ASI happens **earlier** than the
no-intervention world. This is a real model output, not a bug. Two reasons:

1. The nat formula is frictionless — instantaneous 4× boost on the lead lab,
   no reallocation lag, no political ramp-up.
2. The model's `survT(t)` (surviving national compute) recovers quickly after
   the strike due to the 3-month SC pipeline delay + 3-month phase-in. By
   ~6 months post-strike, surviving + new-builds is back to ~25% of
   counterfactual national; the 4× nat boost on that 25% restores leading-lab
   compute to ~100% of counterfactual.

The substantive implication: a strike that triggers nationalization may be
self-defeating for the attacker (the defender ends up better off). Worth
flagging in any analysis that uses this scenario.

### Calibration drift

The AIFP backend refits `r_software` per HTTP request against whatever
baseline scenario is supplied. This means:
- Within one sweep call: all probes share calibration, comparisons are clean.
- Across two sweep calls (or sweep vs dashboard): absolute ASI dates can
  drift by ±5–12 months. The deltas (deltas of deltas, deltas of ASI dates)
  stay roughly constant though.

When auditing a sweep against the dashboard, compare **attack_ASI** values
(should agree within ~weeks), NOT `delay_ASI` values (will disagree by
~1.3 yr when nat is on).

### Nat fires "in response to strike", not at user-set date

In the current sweep code, when `usNatEnabled` or `cnNatEnabled` is true,
nationalization fires **at the strike date on that defender**, not at
`usNatDate`/`cnNatDate`. Setting those date fields in `hold` has no effect.

If you want nat to fire at a different date than the strike, use `syncAxes`
to copy a custom date axis into `usNatDate` — though even then the code path
ignores it for the nat firing logic (only the dashboard respects natDate).

### Capability milestones and their effective-FLOP targets

- AC (Automated Coder): ~5 × 10³¹ eFLOP, baseline ~2030.29
- SAR (Superhuman AI Researcher): ~10³³, baseline ~2031.32
- TED-AI (Top-human-Expert-Dominating AI): ~4 × 10³⁴, baseline ~2031.80
- SIAR (Superintelligent AI Researcher): ~9 × 10³⁵, baseline ~2032.13
- ASI (Artificial Superintelligence): ~8 × 10³⁷, baseline ~2032.69
- China baselines lag US by ~2.5 years (CN ASI baseline ~2035.13)

Baselines drift between calibration runs; use the `baseline` field returned
by your sweep to read the per-run values rather than hardcoding these.

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
