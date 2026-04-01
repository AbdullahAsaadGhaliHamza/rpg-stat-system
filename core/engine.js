class FormulaEngine {
  static evaluate(formula, level) {
    try {
      switch (formula.type) {
        case "linear":
          return formula.a * level + formula.b;

        case "exponential":
          return formula.a * Math.pow(formula.b, level);

        case "polynomial":
          return formula.coefficients.reduce((sum, c, i) => sum + c * Math.pow(level, i), 0);

        case "logarithmic":
          return formula.a * Math.log(level + 1) + formula.b;

        case "sigmoid":
          return formula.max / (1 + Math.exp(-formula.k * (level - formula.midpoint)));

        case "piecewise": {
          const seg = formula.segments.find(s => level >= s.from && level <= s.to);
          if (!seg) return 0;
          return FormulaEngine.evaluate(seg.formula, level);
        }

        case "lookup": {
          const entries = formula.table;
          if (!entries || entries.length === 0) return 0;
          const exact = entries.find(e => e.level === level);
          if (exact) return exact.value;
          const lower = [...entries].reverse().find(e => e.level < level);
          const upper = entries.find(e => e.level > level);
          if (!lower) return entries[0].value;
          if (!upper) return entries[entries.length - 1].value;
          const t = (level - lower.level) / (upper.level - lower.level);
          return lower.value + t * (upper.value - lower.value);
        }

        case "custom": {
          const fn = new Function("level", "L", `"use strict"; return ${formula.expression};`);
          return fn(level, level);
        }

        default:
          return 0;
      }
    } catch (e) {
      return NaN;
    }
  }

  static buildCurve(formula, minLevel, maxLevel) {
    const points = [];
    for (let lv = minLevel; lv <= maxLevel; lv++) {
      const val = FormulaEngine.evaluate(formula, lv);
      points.push({ level: lv, value: isFinite(val) ? parseFloat(val.toFixed(4)) : null });
    }
    return points;
  }

  static validateFormula(formula) {
    const errors = [];
    switch (formula.type) {
      case "linear":
        if (typeof formula.a !== "number") errors.push("'a' must be a number");
        if (typeof formula.b !== "number") errors.push("'b' must be a number");
        break;
      case "exponential":
        if (typeof formula.a !== "number") errors.push("'a' must be a number");
        if (typeof formula.b !== "number" || formula.b <= 0) errors.push("'b' must be a positive number");
        break;
      case "lookup":
        if (!Array.isArray(formula.table) || formula.table.length < 2) errors.push("lookup table needs at least 2 entries");
        break;
      case "custom":
        if (!formula.expression || typeof formula.expression !== "string") errors.push("expression is required");
        else {
          try { new Function("level", "L", `"use strict"; return ${formula.expression};`)(1, 1); }
          catch (e) { errors.push("expression error: " + e.message); }
        }
        break;
    }
    return errors;
  }
}

class BalanceAnalyzer {
  static analyze(curve, stat, thresholds = {}) {
    const issues = [];
    const vals = curve.map(p => p.value).filter(v => v !== null && isFinite(v));
    if (vals.length < 2) return { issues, summary: {} };

    const th = {
      danger_spike_ratio: thresholds.danger_spike_ratio || 3.0,
      warn_spike_ratio: thresholds.warn_spike_ratio || 2.0,
      danger_flat_levels: thresholds.danger_flat_levels || 10,
      warn_flat_levels: thresholds.warn_flat_levels || 5,
      ...thresholds
    };

    const statMax = stat.max;
    const statMin = stat.min || 0;

    for (let i = 1; i < curve.length; i++) {
      const prev = curve[i - 1];
      const curr = curve[i];
      if (prev.value === null || curr.value === null) continue;
      const delta = curr.value - prev.value;
      const ratio = prev.value !== 0 ? curr.value / prev.value : 1;

      if (ratio >= th.danger_spike_ratio) {
        issues.push({
          level: curr.level, type: "danger", kind: "spike",
          message: `${stat.short} spikes ${ratio.toFixed(1)}x at level ${curr.level} (${prev.value.toFixed(1)} to ${curr.value.toFixed(1)})`
        });
      } else if (ratio >= th.warn_spike_ratio) {
        issues.push({
          level: curr.level, type: "warn", kind: "spike",
          message: `${stat.short} jumps ${ratio.toFixed(1)}x at level ${curr.level}`
        });
      }
    }

    let flatRun = 0;
    for (let i = 1; i < curve.length; i++) {
      const delta = Math.abs((curve[i].value || 0) - (curve[i-1].value || 0));
      if (delta < 0.01) {
        flatRun++;
        if (flatRun === th.danger_flat_levels) {
          issues.push({
            level: curve[i].level, type: "danger", kind: "flat",
            message: `${stat.short} is completely flat for ${flatRun} levels ending at level ${curve[i].level}`
          });
        } else if (flatRun === th.warn_flat_levels) {
          issues.push({
            level: curve[i].level, type: "warn", kind: "flat",
            message: `${stat.short} stagnates for ${flatRun} levels ending at level ${curve[i].level}`
          });
        }
      } else {
        flatRun = 0;
      }
    }

    if (statMax !== undefined) {
      const overMax = curve.filter(p => p.value !== null && p.value > statMax);
      if (overMax.length > 0) {
        issues.push({
          level: overMax[0].level, type: "danger", kind: "cap_breach",
          message: `${stat.short} exceeds cap of ${statMax} starting at level ${overMax[0].level}`
        });
      }
    }

    if (statMin !== undefined) {
      const underMin = curve.filter(p => p.value !== null && p.value < statMin);
      if (underMin.length > 0) {
        issues.push({
          level: underMin[0].level, type: "warn", kind: "underfloor",
          message: `${stat.short} falls below floor of ${statMin} at level ${underMin[0].level}`
        });
      }
    }

    const growthRates = [];
    for (let i = 1; i < curve.length; i++) {
      if (curve[i-1].value && curve[i-1].value !== 0) {
        growthRates.push((curve[i].value - curve[i-1].value) / curve[i-1].value);
      }
    }

    const avgGrowth = growthRates.length > 0 ? growthRates.reduce((a, b) => a + b, 0) / growthRates.length : 0;
    const maxGrowth = growthRates.length > 0 ? Math.max(...growthRates) : 0;
    const minGrowth = growthRates.length > 0 ? Math.min(...growthRates) : 0;

    const summary = {
      min_value: Math.min(...vals),
      max_value: Math.max(...vals),
      total_growth: vals.length > 1 ? ((vals[vals.length - 1] - vals[0]) / Math.max(vals[0], 0.001) * 100) : 0,
      avg_growth_pct: avgGrowth * 100,
      max_growth_pct: maxGrowth * 100,
      min_growth_pct: minGrowth * 100,
      issue_count: issues.length,
      danger_count: issues.filter(i => i.type === "danger").length,
      warn_count: issues.filter(i => i.type === "warn").length
    };

    return { issues, summary };
  }

  static analyzeTTK(attackCurve, hpCurve) {
    const ttk = [];
    const len = Math.min(attackCurve.length, hpCurve.length);
    for (let i = 0; i < len; i++) {
      const atk = attackCurve[i].value;
      const hp  = hpCurve[i].value;
      if (!atk || !hp || atk <= 0) { ttk.push({ level: attackCurve[i].level, value: null }); continue; }
      ttk.push({ level: attackCurve[i].level, value: parseFloat((hp / atk).toFixed(2)) });
    }
    return ttk;
  }

  static analyzeEconomy(goldCurve, costCurve) {
    const ratio = [];
    const len = Math.min(goldCurve.length, costCurve.length);
    for (let i = 0; i < len; i++) {
      const gold = goldCurve[i].value;
      const cost = costCurve[i].value;
      if (!gold || !cost || cost <= 0) { ratio.push({ level: goldCurve[i].level, value: null }); continue; }
      ratio.push({ level: goldCurve[i].level, value: parseFloat((cost / gold).toFixed(2)) });
    }
    return ratio;
  }
}

class StatProject {
  constructor() {
    this.name = "My RPG";
    this.minLevel = 1;
    this.maxLevel = 100;
    this.stats = {};
    this.thresholds = {};
    this.presets = {};
    this.version = "1.0.0";
    this.created = new Date().toISOString();
    this.modified = new Date().toISOString();
  }

  setStat(statId, formula) {
    this.stats[statId] = { formula, enabled: true };
    this.modified = new Date().toISOString();
  }

  toggleStat(statId, enabled) {
    if (this.stats[statId]) this.stats[statId].enabled = enabled;
  }

  getCurve(statId) {
    const s = this.stats[statId];
    if (!s || !s.enabled) return [];
    return FormulaEngine.buildCurve(s.formula, this.minLevel, this.maxLevel);
  }

  getAllCurves() {
    const result = {};
    for (const [id, s] of Object.entries(this.stats)) {
      if (s.enabled) result[id] = FormulaEngine.buildCurve(s.formula, this.minLevel, this.maxLevel);
    }
    return result;
  }

  toJSON() {
    return {
      name: this.name,
      version: this.version,
      created: this.created,
      modified: new Date().toISOString(),
      level_range: { min: this.minLevel, max: this.maxLevel },
      thresholds: this.thresholds,
      stats: this.stats
    };
  }

  static fromJSON(data) {
    const p = new StatProject();
    p.name = data.name || "Imported Project";
    p.version = data.version || "1.0.0";
    p.created = data.created || new Date().toISOString();
    p.minLevel = data.level_range?.min || 1;
    p.maxLevel = data.level_range?.max || 100;
    p.thresholds = data.thresholds || {};
    p.stats = data.stats || {};
    return p;
  }
}

class CSVExporter {
  static export(project, statDefs) {
    const curves = project.getAllCurves();
    const ids = Object.keys(curves);
    if (ids.length === 0) return "";

    const levels = curves[ids[0]].map(p => p.level);
    const header = ["level", ...ids.map(id => {
      const def = statDefs[id];
      return def ? def.short : id;
    })].join(",");

    const rows = levels.map(lv => {
      const row = [lv];
      for (const id of ids) {
        const point = curves[id].find(p => p.level === lv);
        row.push(point ? (point.value !== null ? point.value : "") : "");
      }
      return row.join(",");
    });

    return [header, ...rows].join("\n");
  }

  static exportAnalysis(project, statDefs, statRegistry) {
    const lines = ["stat_id,stat_name,level_min,level_max,value_min,value_max,total_growth_pct,avg_growth_pct,issues,danger_count,warn_count"];
    for (const [id, s] of Object.entries(project.stats)) {
      if (!s.enabled) continue;
      const def = statDefs[id];
      if (!def) continue;
      const curve = FormulaEngine.buildCurve(s.formula, project.minLevel, project.maxLevel);
      const { issues, summary } = BalanceAnalyzer.analyze(curve, def, project.thresholds);
      lines.push([
        id,
        def.name,
        project.minLevel,
        project.maxLevel,
        summary.min_value?.toFixed(2) || "",
        summary.max_value?.toFixed(2) || "",
        summary.total_growth?.toFixed(1) || "",
        summary.avg_growth_pct?.toFixed(2) || "",
        issues.length,
        summary.danger_count || 0,
        summary.warn_count || 0
      ].join(","));
    }
    return lines.join("\n");
  }
}

if (typeof module !== "undefined") {
  module.exports = { FormulaEngine, BalanceAnalyzer, StatProject, CSVExporter };
}
