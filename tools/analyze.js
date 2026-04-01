#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { FormulaEngine, BalanceAnalyzer, StatProject, CSVExporter } = require("../core/engine");

const STATS_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/stats.json"), "utf8"));

function buildStatDefs() {
  const defs = {};
  for (const cat of STATS_DATA.categories) {
    for (const stat of cat.stats) {
      defs[stat.id] = { ...stat, category: cat.id, category_name: cat.name, color: cat.color };
    }
  }
  return defs;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=");
      args[key] = val !== undefined ? val : true;
    }
  }
  return args;
}

function printUsage() {
  console.log(`
RPG Stat Curve System - CLI

Usage:
  node tools/analyze.js [options]

Options:
  --project=path     Load a project JSON file
  --min=N            Min level (default: 1)
  --max=N            Max level (default: 100)
  --stat=id          Analyze a single stat with its default formula
  --all              Analyze all stats with default formulas
  --out=path         Output directory (default: ./output)
  --csv              Export curves as CSV
  --json             Export project as JSON
  --report           Print balance report to console
  --list             List all available stat IDs

Examples:
  node tools/analyze.js --all --min=1 --max=50 --report
  node tools/analyze.js --stat=hp --min=1 --max=100 --csv
  node tools/analyze.js --project=myproject.json --csv --json
`);
}

function buildDefaultProject(minLevel, maxLevel) {
  const p = new StatProject();
  p.minLevel = minLevel;
  p.maxLevel = maxLevel;
  const defs = buildStatDefs();
  for (const [id, def] of Object.entries(defs)) {
    if (!def.derived) p.setStat(id, def.default_formula);
  }
  return p;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || args.h) { printUsage(); return; }

  const statDefs = buildStatDefs();

  if (args.list) {
    console.log("\nAvailable stats:\n");
    for (const cat of STATS_DATA.categories) {
      console.log(`  ${cat.name}`);
      for (const s of cat.stats) {
        console.log(`    ${s.id.padEnd(22)} ${s.short.padEnd(8)} ${s.description.slice(0, 55)}`);
      }
    }
    console.log();
    return;
  }

  const outDir = args.out || path.join(__dirname, "../output");
  fs.mkdirSync(outDir, { recursive: true });

  const minLevel = parseInt(args.min || 1);
  const maxLevel = parseInt(args.max || 100);

  let project;

  if (args.project) {
    const raw = JSON.parse(fs.readFileSync(args.project, "utf8"));
    project = StatProject.fromJSON(raw);
    console.log(`\nLoaded project: ${project.name}`);
  } else if (args.stat) {
    project = new StatProject();
    project.minLevel = minLevel;
    project.maxLevel = maxLevel;
    const def = statDefs[args.stat];
    if (!def) { console.error(`Unknown stat: ${args.stat}\nRun --list to see all stat IDs.`); process.exit(1); }
    project.setStat(args.stat, def.default_formula);
    console.log(`\nAnalyzing: ${def.name}`);
  } else if (args.all) {
    project = buildDefaultProject(minLevel, maxLevel);
    console.log(`\nAnalyzing all stats (${Object.keys(project.stats).length} total)`);
  } else {
    printUsage(); return;
  }

  console.log(`  Level range: ${project.minLevel} to ${project.maxLevel}\n`);

  if (args.report) {
    const defs = buildStatDefs();
    let totalIssues = 0;

    for (const [id, s] of Object.entries(project.stats)) {
      if (!s.enabled) continue;
      const def = defs[id];
      if (!def) continue;
      const curve = FormulaEngine.buildCurve(s.formula, project.minLevel, project.maxLevel);
      const { issues, summary } = BalanceAnalyzer.analyze(curve, def);

      const first = curve[0]?.value?.toFixed(1) || "?";
      const last = curve[curve.length - 1]?.value?.toFixed(1) || "?";
      const growth = summary.total_growth?.toFixed(0) || "?";

      const indicator = summary.danger_count > 0 ? "[DANGER]" : summary.warn_count > 0 ? "[WARN]  " : "[OK]    ";
      console.log(`  ${indicator} ${def.name.padEnd(22)} L${project.minLevel}=${first.padStart(8)}  L${project.maxLevel}=${last.padStart(10)}  +${growth}%`);

      for (const issue of issues) {
        const prefix = issue.type === "danger" ? "    !! " : "    !!  ";
        console.log(`${prefix}${issue.message}`);
      }

      totalIssues += issues.length;
    }

    console.log(`\n  Total issues found: ${totalIssues}`);
  }

  if (args.csv) {
    const csvData = CSVExporter.export(project, statDefs);
    const csvPath = path.join(outDir, `curves_${project.minLevel}_${project.maxLevel}.csv`);
    fs.writeFileSync(csvPath, csvData);
    console.log(`\nCSV saved: ${csvPath}`);

    const analysisCsv = CSVExporter.exportAnalysis(project, statDefs);
    const analysisPath = path.join(outDir, `analysis_${project.minLevel}_${project.maxLevel}.csv`);
    fs.writeFileSync(analysisPath, analysisCsv);
    console.log(`Analysis CSV: ${analysisPath}`);
  }

  if (args.json) {
    const jsonPath = path.join(outDir, `project_${project.minLevel}_${project.maxLevel}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(project.toJSON(), null, 2));
    console.log(`\nProject JSON: ${jsonPath}`);
  }

  console.log();
}

main().catch(e => { console.error(e); process.exit(1); });
