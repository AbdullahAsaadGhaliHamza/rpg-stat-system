# RPG Stat Curve Visualizer

<img width="1920" height="1080" alt="RPG Stat Curve Visualizer" src="https://github.com/user-attachments/assets/dd444ff4-391c-4078-a54b-8afef5233c89" />

A tool for game designers to define level-scaling formulas for every RPG stat, visualize the resulting curves, and catch balance problems before playtesting starts. No noise-based generation, no guessing - you write the formula, the system shows you exactly what it produces across all levels.

Open `dashboard.html` in a browser and start editing. No server, no install, no build step.

---

## What's in the box

```
rpg-stat-system/
  dashboard.html      visual editor - open in any browser
  README.md           this file
  data/
    stats.json        all stat definitions with default formulas
  core/
    engine.js         formula evaluator, balance analyzer, CSV exporter
  tools/
    analyze.js        CLI for batch analysis and export
  examples.js         6 runnable code examples
  output/             exported files land here
```

---

## Dashboard

Open `dashboard.html` in Chrome, Firefox, or Edge. Everything runs client-side.

**Left sidebar**

Set your project name and level range at the top. The range works for any game - 1-20 for a short RPG, 1-999 for a prestige system, anything in between.

Below that is the formula editor. Click any stat in the list and it opens here. You pick a formula type and fill in parameters - the curve updates instantly.

Below the formula editor are balance thresholds. Adjust warn/danger ratios and flat-stagnation detection to match your game's needs.

The stat list at the bottom groups all stats by category. Check the box next to any stat to add it to the chart. A colored dot appears on each row if that stat has issues.

**Curves tab** - the main chart. All active stats rendered as lines. Hover for level-by-level values. Toggle log scale to compare stats with very different magnitudes. Toggle normalize to put all curves on a 0-100% scale to compare growth shape. Click any item in the legend to dim/highlight individual curves.

**Issues tab** - every balance problem detected across all active stats, sorted by danger first then level. Each card shows the stat, the level it happens, and what the problem is.

**Data table tab** - raw numbers for every stat at every level. Scrollable horizontally when many stats are active.

**TTK / Economy tab** - two derived charts. Time-to-Kill divides HP by ATK to show how many hits it takes to kill an equal-level enemy. Gold Efficiency divides item cost by gold drop to show how many kills it takes to buy gear. Both update automatically when the underlying stats change.

**Saved tab** - save snapshots of the current project to session memory. Load any snapshot back. Each entry shows the level range and how many stats were active.

**Export**
- JSON: full project data including all formulas, curves, and detected issues
- CSV: one column per stat, one row per level, ready for spreadsheet tools

**Cell inspector (right panel)** - click any stat row to see its full analysis: value at min and max level, total growth percentage, average and max growth per level, cap/floor warnings, and all detected issues for that stat.

---

## Formula types

**Linear** - `stat = a * level + b`
Constant growth per level. Good for stats you want to scale predictably like flat defense or move speed.

**Exponential** - `stat = a * b^level`
Compound growth. b=1.1 means 10% growth per level. Good for HP, XP thresholds, gold values. Watch for runaway scaling at high levels.

**Polynomial** - `stat = c0 + c1*L + c2*L^2 + ...`
Curved growth using coefficients. Flexible for stats that start slow and accelerate, or vice versa.

**Logarithmic** - `stat = a * log(level+1) + b`
Fast early growth that flattens out. Good for utility stats that should matter early but not completely dominate late.

**Sigmoid** - `stat = max / (1 + e^(-k * (level - midpoint)))`
S-curve. Slow start, fast middle, slow top. Good for soft-capped stats like crit chance.

**Lookup** - manually defined level:value pairs
The system interpolates linearly between defined points. Good for stats where you want direct control at specific breakpoints.

**Custom** - any JavaScript expression using `level` or `L`
```js
level < 20 ? level * 5 : 100 + level * 8
Math.pow(level, 1.5) * 3
Math.sqrt(level) * 50 + 10
```

---

## Balance detection

The system checks every curve for three categories of problems:

**Spike detection** - when a stat grows faster than the warn or danger ratio between two consecutive levels. A 3x jump from level 19 to level 20 is almost certainly a bug or a design mistake.

**Flat detection** - when a stat does not change for too many consecutive levels. Five levels of zero growth in a key combat stat means those levels feel unrewarding.

**Cap/floor breach** - when a percentage stat exceeds 100%, when an evasion stat hits a cap you defined, or when a value drops below its defined floor.

Thresholds are configurable per project in the sidebar.

---

## Included stats (40 total)

**Combat - Offense**: Attack, Magic Attack, Crit Chance, Crit Damage, Attack Speed, Armor Penetration, Hit Rate, Attack Range

**Combat - Defense**: HP, Defense, Magic Defense, Evasion, Block Rate, Block Value, HP Regen, Damage Reduction

**Resources**: Mana, Mana Regen, Stamina, Energy, Shield

**Progression**: XP Required, Gold Drop, Item Cost, Skill Points, Stat Points

**Movement**: Move Speed, Initiative, Jump Height

**Utility**: Luck, Crafting, Stealth, Charisma, Carry Weight, Cooldown Reduction

**Economy**: Sell Rate, Buy Discount, Drop Rate Bonus

All 40 come with sensible default formulas you can tweak or replace entirely.

---

## CLI

Requires Node.js 14+. No npm install needed.

```bash
node tools/analyze.js --all --min=1 --max=100 --report --csv
node tools/analyze.js --stat=hp --min=1 --max=50 --csv --json
node tools/analyze.js --list
node tools/analyze.js --project=myproject.json --report
```

**Options**

| Flag | Default | What it does |
|------|---------|--------------|
| `--project=path` | none | Load a project JSON file |
| `--min=N` | 1 | Min level |
| `--max=N` | 100 | Max level |
| `--stat=id` | none | Analyze a single stat by ID |
| `--all` | off | Analyze all stats with defaults |
| `--out=path` | ./output | Output directory |
| `--csv` | off | Export curves and analysis as CSV |
| `--json` | off | Export project as JSON |
| `--report` | off | Print balance report to console |
| `--list` | off | List all available stat IDs |

---

## Using it in code

```js
const { FormulaEngine, BalanceAnalyzer, StatProject, CSVExporter } = require("./core/engine");

const formula = { type: "exponential", a: 50, b: 1.12 };
const curve = FormulaEngine.buildCurve(formula, 1, 100);

const project = new StatProject();
project.minLevel = 1;
project.maxLevel = 100;
project.setStat("attack", { type: "linear", a: 5, b: 10 });
project.setStat("hp",     { type: "exponential", a: 50, b: 1.12 });

const hpCurve = project.getCurve("hp");
const { issues, summary } = BalanceAnalyzer.analyze(hpCurve, hpDef);

const csv = CSVExporter.export(project, statDefs);

const ttkCurve = BalanceAnalyzer.analyzeTTK(atkCurve, hpCurve);
const econCurve = BalanceAnalyzer.analyzeEconomy(goldCurve, costCurve);
```

Run `node examples.js` to see all 6 examples.

---

## JSON project format

```json
{
  "name": "My RPG",
  "version": "1.0.0",
  "level_range": { "min": 1, "max": 100 },
  "thresholds": {
    "warn_spike": 2.0,
    "danger_spike": 3.0,
    "warn_flat": 5,
    "danger_flat": 10
  },
  "stats": {
    "attack": {
      "enabled": true,
      "formula": { "type": "linear", "a": 5, "b": 10 }
    },
    "hp": {
      "enabled": true,
      "formula": { "type": "exponential", "a": 50, "b": 1.12 }
    }
  }
}
```

Load this back with the dashboard (Load button) or with `--project=path` on the CLI.
