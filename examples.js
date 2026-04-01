const path = require("path");
const { FormulaEngine, BalanceAnalyzer, StatProject, CSVExporter } = require("./core/engine");

const STATS = require("./data/stats.json");

function buildDefs() {
  const defs = {};
  for (const cat of STATS.categories) {
    for (const s of cat.stats) defs[s.id] = { ...s, cat: cat.id, cat_color: cat.color };
  }
  return defs;
}

const defs = buildDefs();

function example_single_stat() {
  console.log("=== Example 1: Single stat curve ===\n");

  const formula = { type: "exponential", a: 50, b: 1.12 };
  const curve = FormulaEngine.buildCurve(formula, 1, 20);

  console.log("HP curve (levels 1-20, exponential a=50 b=1.12):");
  for (const pt of curve) {
    const bar = "█".repeat(Math.round(pt.value / 20));
    console.log(`  Lv ${String(pt.level).padStart(2)}: ${String(Math.round(pt.value)).padStart(7)}  ${bar}`);
  }
  console.log();
}

function example_compare_formula_types() {
  console.log("=== Example 2: Comparing formula types for ATK ===\n");

  const formulas = {
    "Linear    ": { type: "linear",      a: 5, b: 10 },
    "Exponential": { type: "exponential", a: 4, b: 1.08 },
    "Logarithmic": { type: "logarithmic", a: 20, b: 5 },
    "Polynomial":  { type: "polynomial",  coefficients: [10, 3, 0.05] }
  };

  const levels = [1, 10, 25, 50, 100];
  const header = "Formula      ".padEnd(16) + levels.map(l => ("Lv" + l).padStart(10)).join("");
  console.log("  " + header);
  console.log("  " + "-".repeat(header.length));

  for (const [name, formula] of Object.entries(formulas)) {
    const vals = levels.map(l => Math.round(FormulaEngine.evaluate(formula, l)).toString().padStart(10));
    console.log("  " + name.padEnd(16) + vals.join(""));
  }
  console.log();
}

function example_balance_analysis() {
  console.log("=== Example 3: Balance analysis ===\n");

  const project = new StatProject();
  project.minLevel = 1;
  project.maxLevel = 100;

  for (const [id, def] of Object.entries(defs)) {
    if (!def.derived) project.setStat(id, def.default_formula);
  }

  let totalIssues = 0;
  for (const [id, s] of Object.entries(project.stats)) {
    const def = defs[id];
    if (!def) continue;
    const curve = FormulaEngine.buildCurve(s.formula, project.minLevel, project.maxLevel);
    const { issues, summary } = BalanceAnalyzer.analyze(curve, def);

    const status = summary.danger_count > 0 ? "[DANGER]" : summary.warn_count > 0 ? "[WARN]  " : "[OK]    ";
    const first = curve[0]?.value?.toFixed(1) || "?";
    const last = curve[curve.length-1]?.value?.toFixed(1) || "?";
    console.log(`  ${status} ${def.name.padEnd(22)} Lv1=${first.padStart(8)}  Lv100=${last.padStart(10)}`);
    for (const iss of issues.slice(0, 2)) {
      console.log(`           ${iss.type === "danger" ? "!!" : " !"} ${iss.message}`);
    }
    totalIssues += issues.length;
  }
  console.log(`\n  Total issues: ${totalIssues}\n`);
}

function example_ttk() {
  console.log("=== Example 4: Time-to-Kill analysis ===\n");

  const atkFormula  = { type: "linear",      a: 5, b: 10 };
  const hpFormula   = { type: "exponential", a: 50, b: 1.12 };
  const atkCurve    = FormulaEngine.buildCurve(atkFormula, 1, 100);
  const hpCurve     = FormulaEngine.buildCurve(hpFormula, 1, 100);
  const ttkCurve    = BalanceAnalyzer.analyzeTTK(atkCurve, hpCurve);

  const sample = [1, 10, 20, 30, 50, 75, 100];
  console.log("  Level   ATK        HP         Hits-to-kill");
  console.log("  " + "-".repeat(48));
  for (const lv of sample) {
    const atk = atkCurve.find(p => p.level === lv)?.value || 0;
    const hp  = hpCurve.find(p => p.level === lv)?.value || 0;
    const ttk = ttkCurve.find(p => p.level === lv)?.value || 0;
    console.log(`  ${String(lv).padStart(5)}   ${String(Math.round(atk)).padStart(6)}   ${String(Math.round(hp)).padStart(8)}   ${ttk.toFixed(1).padStart(8)}`);
  }
  console.log();
}

function example_csv_export() {
  console.log("=== Example 5: CSV export ===\n");

  const project = new StatProject();
  project.minLevel = 1;
  project.maxLevel = 10;
  project.setStat("attack", { type: "linear", a: 5, b: 10 });
  project.setStat("hp",     { type: "exponential", a: 50, b: 1.12 });
  project.setStat("defense",{ type: "linear", a: 3, b: 5 });
  project.setStat("mana",   { type: "exponential", a: 30, b: 1.08 });

  const csv = CSVExporter.export(project, defs);
  console.log(csv);
  console.log();
}

function example_custom_formula() {
  console.log("=== Example 6: Custom formula expressions ===\n");

  const formulas = [
    { name: "Piecewise step",    expr: "level < 20 ? level * 5 : level < 60 ? 100 + level * 8 : 500 + level * 15" },
    { name: "Power law",         expr: "Math.pow(level, 1.7) * 2.5" },
    { name: "Oscillating bonus", expr: "level * 10 + Math.sin(level * 0.3) * 20" },
    { name: "Root scale",        expr: "Math.sqrt(level) * 50" }
  ];

  const checkLevels = [1, 10, 25, 50, 100];
  for (const { name, expr } of formulas) {
    const formula = { type: "custom", expression: expr };
    const vals = checkLevels.map(l => Math.round(FormulaEngine.evaluate(formula, l)).toString().padStart(8));
    console.log(`  ${name.padEnd(22)}: ${vals.join("")}`);
  }
  console.log(`\n  Level headers:              ${checkLevels.map(l => String("Lv"+l).padStart(8)).join("")}\n`);
}

example_single_stat();
example_compare_formula_types();
example_balance_analysis();
example_ttk();
example_csv_export();
example_custom_formula();
