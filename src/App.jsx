import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
// Storage compatibility layer (works in both Claude artifacts and standard browsers)
const storage = {
  async get(key) {
    try {
      if (window.storage && window.storage.get) {
        return await storage.get(key);
      }
      const val = localStorage.getItem(key);
      return val ? { value: val } : null;
    } catch (e) { return null; }
  },
  async set(key, value) {
    try {
      if (window.storage && window.storage.set) {
        return await storage.set(key, value);
      }
      localStorage.setItem(key, value);
      return { key, value };
    } catch (e) { return null; }
  }
};


// ─── DATA ────────────────────────────────────────────────────────────────────

const REGIONS = ["NAM", "EUR", "LAM", "APA", "IMEA"];

const REGION_AREAS = {
  NAM: ["NOA"],
  EUR: ["CSE", "EME", "NDC", "NEC", "SWE", "UKI"],
  LAM: ["CAC", "ESA", "WSA"],
  APA: ["GCA", "MEK", "NEA", "OCE", "SEA"],
  IMEA: ["EAA", "IBS", "PAK", "SAA", "SAI", "UAE", "WAF"],
};

const AREA_COUNTRIES = {
  NOA: ["United States", "Canada", "Mexico"],
  CSE: ["Italy", "Greece", "Croatia", "Slovenia", "Serbia", "Cyprus", "Bosnia and Herzegovina", "Macedonia", "Albania", "San Marino", "Czech Republic", "Hungary", "Slovakia"],
  EME: ["Turkey", "Bulgaria", "Georgia", "Egypt", "Israel", "Romania", "Lebanon", "Ukraine"],
  NDC: ["Denmark", "Sweden", "Norway", "Latvia", "Estonia", "Lithuania", "Finland"],
  NEC: ["Germany", "Belgium", "Netherlands", "Austria", "Poland"],
  SWE: ["Spain", "Portugal", "Algeria", "France", "Morocco", "Tunisia"],
  UKI: ["United Kingdom"],
  CAC: ["Guatemala", "Honduras", "Panama", "El Salvador", "Nicaragua", "Costa Rica", "Colombia", "Dominican Republic", "Trinidad & Tobago", "Venezuela"],
  ESA: ["Argentina", "Uruguay", "Paraguay", "Brazil"],
  WSA: ["Bolivia", "Chile", "Ecuador", "Peru"],
  GCA: ["China", "Hong Kong", "Taiwan"],
  MEK: ["Vietnam", "Thailand", "Cambodia", "Laos"],
  NEA: ["Japan", "South Korea"],
  OCE: ["Australia", "New Zealand"],
  SEA: ["Indonesia", "Malaysia", "Philippines", "Singapore"],
  EAA: ["Kenya", "Uganda", "Tanzania", "Djibouti", "Ethiopia", "Rwanda", "Sudan"],
  IBS: ["India", "Bangladesh", "Sri Lanka"],
  PAK: ["Pakistan"],
  SAA: ["Saudi Arabia", "Jordan", "Kuwait", "Bahrain", "Iraq"],
  SAI: ["South Africa", "Mozambique", "Madagascar", "Mauritius", "Zimbabwe", "Malawi", "Zambia", "Botswana", "Namibia", "Swaziland"],
  UAE: ["United Arab Emirates", "Oman", "Qatar"],
  WAF: ["Mauritania", "Congo", "Guinea", "Angola", "Benin", "Burkina Faso", "Cameroon", "Cape Verde Island", "Congo, Dem. Rep. of", "Gabon", "Gambia", "Ghana", "Ivory Coast", "Liberia", "Mali", "Niger", "Nigeria", "Senegal", "Sierra Leone", "Togo"],
};

const LANE_TYPES = ["Fleet", "Road", "Barge", "Rail", "MC"];

const AREA_TO_REGION = {};
Object.entries(REGION_AREAS).forEach(([r, areas]) =>
  areas.forEach((a) => (AREA_TO_REGION[a] = r))
);

const MULT_LABELS = {
  MODE_mult: "Mode & Handoffs",
  CONG_mult: "Congestion / Port",
  REG_mult: "Regulatory / LPI",
  DIG_mult: "Digital Maturity",
};

const MULT_GUIDANCE = {
  MODE_mult: { Road: 1.0, Barge: "1.0–1.1", Rail: "1.1–1.2", Fleet: 1.25, MC: 1.0 },
  CONG_mult: { Low: 1.0, Medium: "1.1–1.2", High: "1.2–1.4" },
  REG_mult: { "LPI ≥3.7": 1.0, "LPI 2.9–3.7": "1.1–1.2", "LPI ≤2.9": "1.2–1.25" },
  DIG_mult: { "High API/EDI": 0.95, Mixed: 1.0 },
};

// Default config
const DEFAULT_CONFIG = {
  workingDaysPerYear: 220,
  availableMinutesPerDay: 360,
  planningMinutesPerOrder: 6,
  executionMinutesPerOrder: 7,
  minutesPerAutomatedOrder: 1,
};

// Regional presets (from the Excel)
const REGIONAL_PRESETS = {
  NAM_Fleet: { MODE_mult: 1.25, CONG_mult: 1.2, REG_mult: 1.0, DIG_mult: 1.0 },
  NAM_Road: { MODE_mult: 1.0, CONG_mult: 1.1, REG_mult: 1.0, DIG_mult: 0.95 },
  NAM_Barge: { MODE_mult: 1.0, CONG_mult: 1.0, REG_mult: 1.0, DIG_mult: 0.95 },
  NAM_Rail: { MODE_mult: 1.1, CONG_mult: 1.1, REG_mult: 1.0, DIG_mult: 0.95 },
  NAM_MC: { MODE_mult: 1.0, CONG_mult: 1.4, REG_mult: 1.0, DIG_mult: 0.95 },
  EUR_Road: { MODE_mult: 1.0, CONG_mult: 1.1, REG_mult: 1.0, DIG_mult: 1.0 },
  EUR_Barge: { MODE_mult: 1.0, CONG_mult: 1.0, REG_mult: 1.0, DIG_mult: 1.0 },
  EUR_Rail: { MODE_mult: 1.1, CONG_mult: 1.0, REG_mult: 1.0, DIG_mult: 1.0 },
  EUR_Fleet: { MODE_mult: 1.25, CONG_mult: 1.2, REG_mult: 1.0, DIG_mult: 1.0 },
  EUR_MC: { MODE_mult: 1.0, CONG_mult: 1.2, REG_mult: 1.0, DIG_mult: 1.0 },
  LAM_Fleet: { MODE_mult: 1.25, CONG_mult: 1.2, REG_mult: 1.2, DIG_mult: 1.0 },
  LAM_Road: { MODE_mult: 1.0, CONG_mult: 1.1, REG_mult: 1.2, DIG_mult: 1.0 },
  LAM_Barge: { MODE_mult: 1.1, CONG_mult: 1.0, REG_mult: 1.2, DIG_mult: 1.0 },
  LAM_MC: { MODE_mult: 1.0, CONG_mult: 1.2, REG_mult: 1.2, DIG_mult: 1.0 },
  APA_Fleet: { MODE_mult: 1.25, CONG_mult: 1.1, REG_mult: 1.0, DIG_mult: 1.0 },
  APA_Road: { MODE_mult: 1.0, CONG_mult: 1.0, REG_mult: 1.0, DIG_mult: 1.0 },
  APA_Barge: { MODE_mult: 1.1, CONG_mult: 1.0, REG_mult: 1.0, DIG_mult: 1.0 },
  APA_MC: { MODE_mult: 1.0, CONG_mult: 1.3, REG_mult: 1.0, DIG_mult: 1.0 },
  IMEA_Fleet: { MODE_mult: 1.25, CONG_mult: 1.1, REG_mult: 1.1, DIG_mult: 1.0 },
  IMEA_Road: { MODE_mult: 1.0, CONG_mult: 1.0, REG_mult: 1.1, DIG_mult: 1.0 },
  IMEA_Rail: { MODE_mult: 1.2, CONG_mult: 1.0, REG_mult: 1.1, DIG_mult: 1.0 },
  IMEA_MC: { MODE_mult: 1.0, CONG_mult: 1.2, REG_mult: 1.1, DIG_mult: 1.0 },
};

// Base FRO/FFE ratios (without empties) - Productivity sheet L column
const REGIONAL_FRO_FFE_BASE = {
  NAM: { sc: 1.51, mc: 1.37 },
  EUR: { sc: 1.32, mc: 1.22 },
  LAM: { sc: 1.31, mc: 1.22 },
  APA: { sc: 1.16, mc: 1.15 },
  IMEA: { sc: 1.40, mc: 1.30 },
};
// Empties-adjusted FRO/FFE - Productivity sheet Y column
const REGIONAL_FRO_FFE_ADJ = {
  NAM: { sc: 1.51, mc: 1.40 },
  EUR: { sc: 1.28, mc: 1.21 },
  LAM: { sc: 1.31, mc: 1.17 },
  APA: { sc: 1.19, mc: 1.17 },
  IMEA: { sc: 1.33, mc: 1.27 },
};
function getRegionalFroFfe(region, hasEmpties) {
  return hasEmpties ? REGIONAL_FRO_FFE_ADJ[region] : REGIONAL_FRO_FFE_BASE[region];
}

// Regional results data (from the Excel – order shares, automation, TMS adoption per lane)
const REGIONAL_LANE_DATA = {
  NAM_Fleet: { orderShare: 0.2500, nonMcShare: 0.3720, automation: 0, tmsAdoption: 1.0 },
  NAM_Road: { orderShare: 0.0358, nonMcShare: 0.0532, automation: 0.668, tmsAdoption: 1.0 },
  NAM_Barge: { orderShare: 0, nonMcShare: 0, automation: 0, tmsAdoption: 1.0 },
  NAM_Rail: { orderShare: 0.3863, nonMcShare: 0.5748, automation: 0.725, tmsAdoption: 1.0 },
  NAM_MC: { orderShare: 0.3308, nonMcShare: null, automation: 0, tmsAdoption: 0 },
  EUR_Road: { orderShare: 0.5305, nonMcShare: 0.6813, automation: 0.4933, tmsAdoption: 0.5 },
  EUR_Barge: { orderShare: 0.0162, nonMcShare: 0.0208, automation: 0.8248, tmsAdoption: 0.5 },
  EUR_Rail: { orderShare: 0.2120, nonMcShare: 0.2722, automation: 0.7574, tmsAdoption: 0.5 },
  EUR_Fleet: { orderShare: 0.0200, nonMcShare: 0.0257, automation: 0, tmsAdoption: 0.5 },
  EUR_MC: { orderShare: 0.2213, nonMcShare: null, automation: 0, tmsAdoption: 0 },
  LAM_Fleet: { orderShare: 0.1023, nonMcShare: 0.1500, automation: 0, tmsAdoption: 0.3 },
  LAM_Road: { orderShare: 0.5117, nonMcShare: 0.7500, automation: 0.451, tmsAdoption: 0.3 },
  LAM_Barge: { orderShare: 0.0682, nonMcShare: 0.1000, automation: 0, tmsAdoption: 0.3 },
  LAM_MC: { orderShare: 0.3177, nonMcShare: null, automation: 0, tmsAdoption: 0 },
  APA_Fleet: { orderShare: 0.0200, nonMcShare: 0.0531, automation: 0.800, tmsAdoption: 0.15 },
  APA_Road: { orderShare: 0.0508, nonMcShare: 0.1347, automation: 0.515, tmsAdoption: 0.15 },
  APA_Barge: { orderShare: 0.3062, nonMcShare: 0.8122, automation: 0.803, tmsAdoption: 0.15 },
  APA_MC: { orderShare: 0.6230, nonMcShare: null, automation: 0, tmsAdoption: 0 },
  IMEA_Fleet: { orderShare: 0.0500, nonMcShare: 0.0910, automation: 0, tmsAdoption: 0.5 },
  IMEA_Road: { orderShare: 0.4350, nonMcShare: 0.7914, automation: 0.588, tmsAdoption: 0.5 },
  IMEA_Rail: { orderShare: 0.0647, nonMcShare: 0.1176, automation: 0.376, tmsAdoption: 0.5 },
  IMEA_MC: { orderShare: 0.4503, nonMcShare: null, automation: 0, tmsAdoption: 0 },
};

// Actuals data from Excel
const DEFAULT_ACTUALS = {
  NAM: { ftes: 388, scFFE: 69861, mcFFE: 39315, empties: 0, cx: 16, mcOps: 147, finOps: 0, vm: 6, exclusions: 0, volShare: 0.21 },
  EUR: { ftes: 522, scFFE: 145944, mcFFE: 41101, empties: 35631.08, cx: 110, mcOps: 66, finOps: 5, vm: 15, exclusions: 0, volShare: 0.32 },
  LAM: { ftes: 442, scFFE: 46223, mcFFE: 9806, empties: 0, cx: 47, mcOps: 0, finOps: 0, vm: 3, exclusions: 154, volShare: 0.10 },
  APA: { ftes: 362, scFFE: 44185, mcFFE: 64160, empties: 21516.78, cx: 59, mcOps: 91, finOps: 8, vm: 9, exclusions: 0, volShare: 0.20 },
  IMEA: { ftes: 305, scFFE: 65101, mcFFE: 17325, empties: 42027, cx: 66, mcOps: 15, finOps: 0, vm: 8, exclusions: 0, volShare: 0.17 },
};

// Area-level actuals (ALL = TMS + Non-TMS, auto-calculated)
const DEFAULT_AREA_ACTUALS = {
  NOA: { ftes: 388, scFFE: 69861, mcFFE: 39315, empties: 0, cx: 16, mcOps: 147, finOps: 0, vm: 6, exclusions: 0 },
  CSE: { ftes: 67, scFFE: 30309, mcFFE: 2798, empties: 6101.51, cx: 11, mcOps: 0, finOps: 0, vm: 2, exclusions: 0 },
  EME: { ftes: 83, scFFE: 20751, mcFFE: 6305, empties: 5600.08, cx: 22, mcOps: 0, finOps: 0, vm: 2, exclusions: 0 },
  NDC: { ftes: 34, scFFE: 9600, mcFFE: 750, empties: 878.5, cx: 12, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  NEC: { ftes: 180, scFFE: 39245, mcFFE: 14045, empties: 11210.29, cx: 51, mcOps: 13, finOps: 2, vm: 6, exclusions: 0 },
  SWE: { ftes: 129, scFFE: 25614, mcFFE: 14802, empties: 6326.18, cx: 14, mcOps: 53, finOps: 3, vm: 3, exclusions: 0 },
  UKI: { ftes: 29, scFFE: 20428, mcFFE: 2401, empties: 5515.56, cx: 0, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  CAC: { ftes: 79, scFFE: 9714, mcFFE: 1958, empties: 0, cx: 7, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  ESA: { ftes: 235, scFFE: 27860, mcFFE: 6640, empties: 0, cx: 30, mcOps: 0, finOps: 0, vm: 2, exclusions: 154 },
  WSA: { ftes: 128, scFFE: 8651, mcFFE: 1208, empties: 0, cx: 10, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  GCA: { ftes: 156, scFFE: 8709, mcFFE: 35000, empties: 0, cx: 40, mcOps: 14, finOps: 0, vm: 2, exclusions: 0 },
  MEK: { ftes: 113, scFFE: 23107, mcFFE: 20067, empties: 10767, cx: 16, mcOps: 46, finOps: 8, vm: 4, exclusions: 0 },
  NEA: { ftes: 24, scFFE: 0, mcFFE: 3605, empties: 1438.11, cx: 0, mcOps: 24, finOps: 0, vm: 1, exclusions: 0 },
  OCE: { ftes: 18, scFFE: 6388, mcFFE: 856, empties: 5550.85, cx: 3, mcOps: 6, finOps: 0, vm: 1, exclusions: 0 },
  SEA: { ftes: 47, scFFE: 4328, mcFFE: 6287, empties: 3760.82, cx: 0, mcOps: 8, finOps: 0, vm: 1, exclusions: 0 },
  EAA: { ftes: 36, scFFE: 6441, mcFFE: 2628, empties: 6101.8, cx: 15, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  IBS: { ftes: 54, scFFE: 29580, mcFFE: 1048, empties: 15403.2, cx: 11, mcOps: 0, finOps: 0, vm: 2, exclusions: 0 },
  PAK: { ftes: 6, scFFE: 5375, mcFFE: 6769, empties: 0, cx: 0, mcOps: 5, finOps: 0, vm: 0, exclusions: 0 },
  SAA: { ftes: 20, scFFE: 6686, mcFFE: 2853, empties: 810, cx: 0, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  SAI: { ftes: 51, scFFE: 6241, mcFFE: 1300, empties: 16736.5, cx: 11, mcOps: 7, finOps: 0, vm: 2, exclusions: 0 },
  UAE: { ftes: 8, scFFE: 2385, mcFFE: 300, empties: 4138, cx: 3, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  WAF: { ftes: 130, scFFE: 8381, mcFFE: 4022, empties: 2838, cx: 26, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
};

// TMS area-level actuals
const DEFAULT_TMS_AREA_ACTUALS = {
  NOA: { ftes: 388, scFFE: 69861, mcFFE: 39315, empties: 0, cx: 16, mcOps: 147, finOps: 0, vm: 6, exclusions: 0 },
  CSE: { ftes: 46, scFFE: 17296, mcFFE: 1450, empties: 2588, cx: 8, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  EME: { ftes: 28, scFFE: 7797, mcFFE: 705, empties: 2102.5, cx: 10, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  NDC: { ftes: 34, scFFE: 9600, mcFFE: 750, empties: 878.5, cx: 12, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  NEC: { ftes: 148, scFFE: 30368, mcFFE: 12000, empties: 8813.5, cx: 39, mcOps: 11, finOps: 2, vm: 5, exclusions: 0 },
  SWE: { ftes: 96, scFFE: 18080, mcFFE: 11769, empties: 4292, cx: 9, mcOps: 49, finOps: 3, vm: 2, exclusions: 0 },
  UKI: { ftes: 0, scFFE: 0, mcFFE: 0, empties: 0, cx: 0, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  CAC: { ftes: 63, scFFE: 9230, mcFFE: 1090, empties: 3372.5, cx: 4, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  ESA: { ftes: 21, scFFE: 1881, mcFFE: 3346, empties: 4199, cx: 4, mcOps: 0, finOps: 0, vm: 2, exclusions: 0 },
  WSA: { ftes: 0, scFFE: 0, mcFFE: 0, empties: 0, cx: 0, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  GCA: { ftes: 0, scFFE: 0, mcFFE: 0, empties: 0, cx: 0, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  MEK: { ftes: 113, scFFE: 23107, mcFFE: 20067, empties: 10767, cx: 16, mcOps: 46, finOps: 8, vm: 4, exclusions: 0 },
  NEA: { ftes: 0, scFFE: 0, mcFFE: 0, empties: 0, cx: 0, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  OCE: { ftes: 0, scFFE: 0, mcFFE: 0, empties: 0, cx: 0, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  SEA: { ftes: 0, scFFE: 0, mcFFE: 0, empties: 0, cx: 0, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  EAA: { ftes: 17, scFFE: 2044, mcFFE: 733, empties: 4343, cx: 8, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  IBS: { ftes: 0, scFFE: 0, mcFFE: 0, empties: 0, cx: 0, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  PAK: { ftes: 6, scFFE: 5375, mcFFE: 6769, empties: 0, cx: 0, mcOps: 5, finOps: 0, vm: 0, exclusions: 0 },
  SAA: { ftes: 20, scFFE: 6686, mcFFE: 2853, empties: 810, cx: 0, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  SAI: { ftes: 51, scFFE: 6241, mcFFE: 1300, empties: 16736.5, cx: 11, mcOps: 7, finOps: 0, vm: 2, exclusions: 0 },
  UAE: { ftes: 8, scFFE: 2385, mcFFE: 300, empties: 4138, cx: 3, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  WAF: { ftes: 9, scFFE: 1286, mcFFE: 0, empties: 0, cx: 1, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
};

// Non-TMS area-level actuals
const DEFAULT_NONTMS_AREA_ACTUALS = {
  NOA: { ftes: 0, scFFE: 0, mcFFE: 0, empties: 0, cx: 0, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  CSE: { ftes: 21, scFFE: 13013, mcFFE: 1348, empties: 3513.51, cx: 3, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  EME: { ftes: 55, scFFE: 12954, mcFFE: 5600, empties: 3497.58, cx: 12, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  NDC: { ftes: 0, scFFE: 0, mcFFE: 0, empties: 0, cx: 0, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  NEC: { ftes: 32, scFFE: 8877, mcFFE: 2045, empties: 2396.79, cx: 12, mcOps: 2, finOps: 0, vm: 1, exclusions: 0 },
  SWE: { ftes: 33, scFFE: 7534, mcFFE: 3033, empties: 2034.18, cx: 5, mcOps: 4, finOps: 0, vm: 1, exclusions: 0 },
  UKI: { ftes: 29, scFFE: 20428, mcFFE: 2401, empties: 5515.56, cx: 0, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
  CAC: { ftes: 16, scFFE: 484, mcFFE: 868, empties: 0, cx: 3, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  ESA: { ftes: 214, scFFE: 25979, mcFFE: 3294, empties: 0, cx: 26, mcOps: 0, finOps: 0, vm: 0, exclusions: 154 },
  WSA: { ftes: 128, scFFE: 8651, mcFFE: 1208, empties: 0, cx: 10, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  GCA: { ftes: 156, scFFE: 8709, mcFFE: 35000, empties: 0, cx: 40, mcOps: 14, finOps: 0, vm: 2, exclusions: 0 },
  MEK: { ftes: 0, scFFE: 0, mcFFE: 0, empties: 0, cx: 0, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  NEA: { ftes: 24, scFFE: 0, mcFFE: 3605, empties: 1438.11, cx: 0, mcOps: 24, finOps: 0, vm: 1, exclusions: 0 },
  OCE: { ftes: 18, scFFE: 6388, mcFFE: 856, empties: 5550.85, cx: 3, mcOps: 6, finOps: 0, vm: 1, exclusions: 0 },
  SEA: { ftes: 47, scFFE: 4328, mcFFE: 6287, empties: 3760.82, cx: 0, mcOps: 8, finOps: 0, vm: 1, exclusions: 0 },
  EAA: { ftes: 19, scFFE: 4397, mcFFE: 1895, empties: 1758.8, cx: 7, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  IBS: { ftes: 54, scFFE: 29580, mcFFE: 1048, empties: 15403.2, cx: 11, mcOps: 0, finOps: 0, vm: 2, exclusions: 0 },
  PAK: { ftes: 0, scFFE: 0, mcFFE: 0, empties: 0, cx: 0, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  SAA: { ftes: 0, scFFE: 0, mcFFE: 0, empties: 0, cx: 0, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  SAI: { ftes: 0, scFFE: 0, mcFFE: 0, empties: 0, cx: 0, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  UAE: { ftes: 0, scFFE: 0, mcFFE: 0, empties: 0, cx: 0, mcOps: 0, finOps: 0, vm: 0, exclusions: 0 },
  WAF: { ftes: 121, scFFE: 7095, mcFFE: 4022, empties: 2838, cx: 25, mcOps: 0, finOps: 0, vm: 1, exclusions: 0 },
};

// Helper: sum TMS + Non-TMS into All for an area
function sumTmsNonTms(tms, nonTms) {
  if (!tms && !nonTms) return {};
  const t = tms || {};
  const n = nonTms || {};
  const fields = ["ftes", "scFFE", "mcFFE", "empties", "cx", "mcOps", "finOps", "vm", "exclusions"];
  const result = {};
  fields.forEach((f) => { result[f] = (t[f] || 0) + (n[f] || 0); });
  return result;
}

// Recalculate all area actuals from TMS + Non-TMS
function recalcAllFromSplits(tmsAreas, nonTmsAreas) {
  const allAreas = {};
  const allAreaKeys = new Set([...Object.keys(tmsAreas), ...Object.keys(nonTmsAreas)]);
  allAreaKeys.forEach((area) => {
    allAreas[area] = sumTmsNonTms(tmsAreas[area], nonTmsAreas[area]);
  });
  return allAreas;
}

// Recalculate regional actuals from area actuals
function recalcRegionalFromAreas(areaActuals) {
  const regionals = {};
  REGIONS.forEach((region) => {
    const areas = REGION_AREAS[region];
    const fields = ["ftes", "scFFE", "mcFFE", "empties", "cx", "mcOps", "finOps", "vm", "exclusions"];
    const result = {};
    fields.forEach((f) => {
      result[f] = areas.reduce((sum, area) => sum + ((areaActuals[area] || {})[f] || 0), 0);
    });
    result.volShare = DEFAULT_ACTUALS[region]?.volShare || 0;
    regionals[region] = result;
  });
  return regionals;
}

// ─── UTILITY ────────────────────────────────────────────────────────────────

const fmt = (n, d = 0) => {
  if (n == null || isNaN(n) || !isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};
const pct = (n) => {
  if (n == null || isNaN(n) || !isFinite(n)) return "—";
  return (n * 100).toFixed(1) + "%";
};

const gapColor = (gap) => {
  if (gap == null || isNaN(gap)) return "";
  if (gap <= -0.1) return "text-emerald-400";
  if (gap <= 0.05) return "text-emerald-300";
  if (gap <= 0.2) return "text-amber-400";
  if (gap <= 0.5) return "text-orange-400";
  return "text-red-400";
};

const gapBg = (gap) => {
  if (gap == null || isNaN(gap)) return "";
  if (gap <= 0.05) return "bg-emerald-500/10";
  if (gap <= 0.2) return "bg-amber-500/10";
  if (gap <= 0.5) return "bg-orange-500/10";
  return "bg-red-500/10";
};

// ─── CALCULATION ENGINE ─────────────────────────────────────────────────────

function calcEffortIndex(preset) {
  return (preset.MODE_mult || 1) * (preset.CONG_mult || 1) * (preset.REG_mult || 1) * (preset.DIG_mult || 1);
}

function calcTarget(config, presets, laneData, froFfe, volShare, hasEmpties, emptiesShare) {
  const baseMins = config.planningMinutesPerOrder + config.executionMinutesPerOrder;
  let fullWeightedMoves = 0;  // All lanes (F column shares)
  let scWeightedMoves = 0;    // Non-MC lanes only (G column shares)

  const lanes = Object.keys(presets);
  for (const laneKey of lanes) {
    const preset = presets[laneKey];
    const data = laneData[laneKey];
    if (!data || !preset) continue;

    const effortIdx = calcEffortIndex(preset);
    const adjMins = baseMins * effortIdx;

    // Post-automation adjusted minutes
    const autoMins = config.minutesPerAutomatedOrder;
    const autoRate = data.automation || 0;
    const tmsAdopt = data.tmsAdoption || 0;
    const adjMinsPost = adjMins * (1 - autoRate * tmsAdopt) + autoMins * autoRate * tmsAdopt;
    const annualMovesPost = (config.availableMinutesPerDay / adjMinsPost) * config.workingDaysPerYear;

    // Full target: uses orderShare (F column) - all lanes including MC
    fullWeightedMoves += annualMovesPost * (data.orderShare || 0);

    // SC target: uses nonMcShare (G column) - non-MC lanes only
    if (data.nonMcShare != null) {
      scWeightedMoves += annualMovesPost * data.nonMcShare;
    }
  }

  // Monthly = annual SUMPRODUCT / 12
  const scMovesMonthly = scWeightedMoves / 12;
  const fullMovesMonthly = fullWeightedMoves / 12;

  // Apply empties adjustment to MOVES before FRO conversion
  const empFactor = 1 + 0.25 * (emptiesShare || 0);
  const scMovesAdj = hasEmpties ? scMovesMonthly * empFactor : scMovesMonthly;
  const fullMovesAdj = hasEmpties ? fullMovesMonthly * empFactor : fullMovesMonthly;

  // Convert to FFEs via FRO/FFE ratio
  const scTargetMonthly = scMovesAdj / (froFfe.sc || 1);
  const mcTargetMonthly = fullMovesAdj / (froFfe.mc || 1);
  const scTargetAnnual = scTargetMonthly * 12;
  const mcTargetAnnual = mcTargetMonthly * 12;

  return {
    movesPerFTE: fullWeightedMoves,
    scMovesMonthly,
    fullMovesMonthly,
    scTargetAnnual,
    mcTargetAnnual,
    scTargetMonthly,
    mcTargetMonthly,
  };
}

function calcActualProd(actuals, emptiesIncluded) {
  // Full (SC+MC) prod: only deduct CX, VM, exclusions
  const netFTEsFull = (actuals.ftes || 0) - (actuals.cx || 0) - (actuals.vm || 0) - (actuals.exclusions || 0) - (actuals.otherExcl || 0);
  // SC-only: also deduct MC Ops and FinOps
  const netFTEsSC = netFTEsFull - (actuals.mcOps || 0) - (actuals.finOps || 0);
  if (netFTEsFull <= 0) return { scProd: 0, mcProd: 0, netFTEs: netFTEsFull, netFTEsSC: netFTEsSC, effectiveVol: 0 };
  const scBase = (actuals.scFFE || 0);
  const totalBase = scBase + (actuals.mcFFE || 0);
  // SC prod with empties adj: (SC/netSC) * (1 + 0.25*emp/(emp+SC))
  const scProd = netFTEsSC > 0
    ? emptiesIncluded && scBase > 0
      ? (scBase / netFTEsSC) * (1 + 0.25 * ((actuals.empties || 0) / ((actuals.empties || 0) + scBase)))
      : scBase / netFTEsSC
    : 0;
  // Full prod: (SC+MC)/netFull * (1 + 0.25*emp/(emp+SC+MC))
  const mcProd = emptiesIncluded && totalBase > 0
    ? (totalBase / netFTEsFull) * (1 + 0.25 * ((actuals.empties || 0) / ((actuals.empties || 0) + totalBase)))
    : totalBase / netFTEsFull;
  const emptiesAdj = emptiesIncluded ? 0.25 * (actuals.empties || 0) : 0;
  return { scProd, mcProd, netFTEs: netFTEsFull, netFTEsSC, effectiveVol: totalBase + emptiesAdj };
}

function calcEffectiveVolume(actuals, emptiesIncluded) {
  const emptiesAdj = emptiesIncluded ? 0.25 * (actuals.empties || 0) : 0;
  return (actuals.scFFE || 0) + (actuals.mcFFE || 0) + emptiesAdj;
}

// Regional empties share for target adjustment (hardcoded calibration values)
const DEFAULT_EMPTIES_SHARE = { NAM: 0, EUR: 0.1404, LAM: 0, APA: 0.207, IMEA: 0.42 };

// Default empties config — EUR, APA, IMEA areas include empties at 25% effort
const DEFAULT_EMPTIES_CONFIG = {
  NOA: false, CSE: true, EME: true, NDC: true, NEC: true, SWE: true, UKI: true,
  CAC: false, ESA: false, WSA: false,
  GCA: false, MEK: true, NEA: true, OCE: true, SEA: true,
  EAA: true, IBS: true, PAK: false, SAA: true, SAI: true, UAE: true, WAF: true,
};

// ─── ICONS (SVG inline) ─────────────────────────────────────────────────────

const ChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex border-b border-slate-700/60">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-5 py-3 text-sm font-medium tracking-wide transition-all relative ${
            active === t.id
              ? "text-teal-300"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {t.label}
          {active === t.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400" />
          )}
        </button>
      ))}
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step = 0.05, className = "" }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      min={min}
      max={max}
      step={step}
      className={`w-20 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 text-center focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/30 ${className}`}
    />
  );
}

function Badge({ children, color = "slate" }) {
  const colors = {
    slate: "bg-slate-700 text-slate-300",
    teal: "bg-teal-900/50 text-teal-300 border border-teal-700/40",
    amber: "bg-amber-900/40 text-amber-300 border border-amber-700/40",
    red: "bg-red-900/40 text-red-300 border border-red-700/40",
    emerald: "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[color]}`}>
      {children}
    </span>
  );
}

// ─── PRESET BUILDER ──────────────────────────────────────────────────────────

function PresetBuilder({ areaPresets, setAreaPresets, areaLaneData, setAreaLaneData }) {
  const [expandedRegion, setExpandedRegion] = useState("EUR");
  const [expandedArea, setExpandedArea] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  const initAreaPreset = useCallback((area) => {
    const region = AREA_TO_REGION[area];
    const newPresets = {};
    const laneTypes = area === "NOA" ? ["Fleet", "Road", "Barge", "Rail", "MC"] : getLaneTypesForArea(area);
    laneTypes.forEach((lane) => {
      const regionKey = `${region}_${lane}`;
      const areaKey = `${area}_${lane}`;
      if (REGIONAL_PRESETS[regionKey]) {
        newPresets[areaKey] = { ...REGIONAL_PRESETS[regionKey] };
      }
    });
    return newPresets;
  }, []);

  const getLaneTypesForArea = (area) => {
    const region = AREA_TO_REGION[area];
    const regionLanes = Object.keys(REGIONAL_PRESETS)
      .filter((k) => k.startsWith(region + "_"))
      .map((k) => k.split("_")[1]);
    return [...new Set(regionLanes)];
  };

  const handleMultChange = (area, lane, mult, value) => {
    setAreaPresets((prev) => ({
      ...prev,
      [`${area}_${lane}`]: {
        ...(prev[`${area}_${lane}`] || REGIONAL_PRESETS[`${AREA_TO_REGION[area]}_${lane}`] || {}),
        [mult]: value,
      },
    }));
  };

  const handleCopyFromRegion = (area) => {
    const newPresets = initAreaPreset(area);
    setAreaPresets((prev) => ({ ...prev, ...newPresets }));
  };

  const handleLaneDataChange = (area, lane, field, value) => {
    setAreaLaneData((prev) => ({
      ...prev,
      [`${area}_${lane}`]: {
        ...(prev[`${area}_${lane}`] || {}),
        [field]: value,
      },
    }));
  };

  const getPresetStatus = (area) => {
    const laneTypes = getLaneTypesForArea(area);
    const hasAny = laneTypes.some((l) => areaPresets[`${area}_${l}`]);
    const hasAll = laneTypes.every((l) => areaPresets[`${area}_${l}`]);
    if (hasAll) return "complete";
    if (hasAny) return "partial";
    return "empty";
  };

  return (
    <div className="space-y-4">
      {/* Guidance panel */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200 tracking-wide uppercase">Area-Level Preset Builder</h3>
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="text-xs text-teal-400 hover:text-teal-300"
          >
            {showGuide ? "Hide" : "Show"} Multiplier Guide
          </button>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">
          Configure effort multipliers per area and lane type. Areas start with their regional defaults — adjust based on local complexity, mode mix, congestion, and digital maturity. Each multiplier compounds: <span className="text-slate-300 font-mono text-xs">Effort = MODE × CONG × REG × DIG</span>
        </p>

        {showGuide && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {Object.entries(MULT_GUIDANCE).map(([key, values]) => (
              <div key={key} className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
                <div className="text-xs font-semibold text-teal-400 mb-2">{MULT_LABELS[key]}</div>
                {Object.entries(values).map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs text-slate-400 py-0.5">
                    <span>{label}</span>
                    <span className="font-mono text-slate-300">{val}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Region accordion */}
      {REGIONS.map((region) => (
        <div key={region} className="bg-slate-800/30 rounded-xl border border-slate-700/40 overflow-hidden">
          <button
            onClick={() => setExpandedRegion(expandedRegion === region ? null : region)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/50 transition"
          >
            <div className="flex items-center gap-3">
              {expandedRegion === region ? <ChevronDown /> : <ChevronRight />}
              <span className="font-semibold text-slate-200">{region}</span>
              <span className="text-xs text-slate-500">
                {REGION_AREAS[region].length} areas
              </span>
            </div>
            <div className="flex gap-2">
              {REGION_AREAS[region].map((area) => {
                const status = getPresetStatus(area);
                return (
                  <Badge
                    key={area}
                    color={status === "complete" ? "emerald" : status === "partial" ? "amber" : "slate"}
                  >
                    {area}
                  </Badge>
                );
              })}
            </div>
          </button>

          {expandedRegion === region && (
            <div className="border-t border-slate-700/30">
              {REGION_AREAS[region].map((area) => {
                const laneTypes = getLaneTypesForArea(area);
                const isExpanded = expandedArea === area;

                return (
                  <div key={area} className="border-b border-slate-700/20 last:border-b-0">
                    <button
                      onClick={() => setExpandedArea(isExpanded ? null : area)}
                      className="w-full flex items-center justify-between px-5 py-3 pl-10 hover:bg-slate-800/40 transition"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown /> : <ChevronRight />}
                        <span className="text-sm font-medium text-slate-300">{area}</span>
                        <span className="text-xs text-slate-500">
                          {AREA_COUNTRIES[area]?.slice(0, 3).join(", ")}
                          {(AREA_COUNTRIES[area]?.length || 0) > 3 && ` +${AREA_COUNTRIES[area].length - 3}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge color={getPresetStatus(area) === "complete" ? "emerald" : getPresetStatus(area) === "partial" ? "amber" : "slate"}>
                          {getPresetStatus(area)}
                        </Badge>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-4 pl-16 space-y-3">
                        <div className="flex gap-2 mb-3">
                          <button
                            onClick={() => handleCopyFromRegion(area)}
                            className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg transition"
                          >
                            Copy from {region} defaults
                          </button>
                        </div>

                        {/* Lane table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-slate-500 uppercase tracking-wider">
                                <th className="text-left py-2 pr-4 font-medium">Lane</th>
                                <th className="text-center py-2 px-2 font-medium">Mode</th>
                                <th className="text-center py-2 px-2 font-medium">Congestion</th>
                                <th className="text-center py-2 px-2 font-medium">Regulatory</th>
                                <th className="text-center py-2 px-2 font-medium">Digital</th>
                                <th className="text-center py-2 px-2 font-medium">Effort Idx</th>
                                <th className="text-center py-2 px-2 font-medium">Order %</th>
                                <th className="text-center py-2 px-2 font-medium">Auto %</th>
                                <th className="text-center py-2 px-2 font-medium">TMS %</th>
                              </tr>
                            </thead>
                            <tbody>
                              {laneTypes.map((lane) => {
                                const key = `${area}_${lane}`;
                                const regionKey = `${region}_${lane}`;
                                const preset = areaPresets[key] || REGIONAL_PRESETS[regionKey] || {};
                                const laneData = areaLaneData[key] || REGIONAL_LANE_DATA[regionKey] || {};
                                const effortIdx = calcEffortIndex(preset);

                                return (
                                  <tr key={lane} className="border-t border-slate-700/20">
                                    <td className="py-2 pr-4 font-medium text-slate-300">{lane}</td>
                                    {["MODE_mult", "CONG_mult", "REG_mult", "DIG_mult"].map((mult) => (
                                      <td key={mult} className="py-2 px-1 text-center">
                                        <NumberInput
                                          value={preset[mult] || 1}
                                          onChange={(v) => handleMultChange(area, lane, mult, v)}
                                        />
                                      </td>
                                    ))}
                                    <td className="py-2 px-2 text-center">
                                      <span className={`font-mono text-sm font-semibold ${effortIdx > 1.3 ? "text-amber-400" : effortIdx > 1.1 ? "text-slate-200" : "text-emerald-400"}`}>
                                        {effortIdx.toFixed(3)}
                                      </span>
                                    </td>
                                    <td className="py-2 px-1 text-center">
                                      <NumberInput
                                        value={laneData.orderShare || 0}
                                        onChange={(v) => handleLaneDataChange(area, lane, "orderShare", v)}
                                        step={0.01}
                                        className="w-16"
                                      />
                                    </td>
                                    <td className="py-2 px-1 text-center">
                                      <NumberInput
                                        value={laneData.automation || 0}
                                        onChange={(v) => handleLaneDataChange(area, lane, "automation", v)}
                                        step={0.01}
                                        className="w-16"
                                      />
                                    </td>
                                    <td className="py-2 px-1 text-center">
                                      <NumberInput
                                        value={laneData.tmsAdoption || 0}
                                        onChange={(v) => handleLaneDataChange(area, lane, "tmsAdoption", v)}
                                        step={0.01}
                                        className="w-16"
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── TARGET CALCULATOR ───────────────────────────────────────────────────────

function TargetCalculator({ config, setConfig, areaPresets, areaLaneData }) {
  const [viewLevel, setViewLevel] = useState("region");

  const regionalTargets = useMemo(() => {
    const results = {};
    REGIONS.forEach((region) => {
      const regionPresets = {};
      const regionLaneData = {};
      Object.keys(REGIONAL_PRESETS).forEach((key) => {
        if (key.startsWith(region + "_")) {
          regionPresets[key] = REGIONAL_PRESETS[key];
          regionLaneData[key] = REGIONAL_LANE_DATA[key];
        }
      });
      results[region] = calcTarget(config, regionPresets, regionLaneData, getRegionalFroFfe(region, REGION_AREAS[region].some(a => DEFAULT_EMPTIES_CONFIG[a])), DEFAULT_ACTUALS[region]?.volShare || 0, REGION_AREAS[region].some(a => DEFAULT_EMPTIES_CONFIG[a]), DEFAULT_EMPTIES_SHARE[region]);
    });
    return results;
  }, [config]);

  const areaTargets = useMemo(() => {
    const results = {};
    Object.entries(REGION_AREAS).forEach(([region, areas]) => {
      areas.forEach((area) => {
        const aPresets = {};
        const aLaneData = {};
        const laneTypes = Object.keys(REGIONAL_PRESETS)
          .filter((k) => k.startsWith(region + "_"))
          .map((k) => k.split("_")[1]);
        
        laneTypes.forEach((lane) => {
          const areaKey = `${area}_${lane}`;
          const regionKey = `${region}_${lane}`;
          aPresets[areaKey] = areaPresets[areaKey] || REGIONAL_PRESETS[regionKey];
          aLaneData[areaKey] = areaLaneData[areaKey] || REGIONAL_LANE_DATA[regionKey];
        });
        
        if (Object.values(aPresets).some(p => p)) {
          results[area] = calcTarget(config, aPresets, aLaneData, getRegionalFroFfe(region, DEFAULT_EMPTIES_CONFIG[area] || false), DEFAULT_ACTUALS[region]?.volShare || 0, DEFAULT_EMPTIES_CONFIG[area] || false, DEFAULT_EMPTIES_SHARE[region]);
        }
      });
    });
    return results;
  }, [config, areaPresets, areaLaneData]);

  return (
    <div className="space-y-4">
      {/* Config panel */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-slate-200 tracking-wide uppercase mb-4">Model Configuration</h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {[
            ["workingDaysPerYear", "Working Days / Year"],
            ["availableMinutesPerDay", "Net Minutes / Day"],
            ["planningMinutesPerOrder", "Planning Mins / Order"],
            ["executionMinutesPerOrder", "Execution Mins / Order"],
            ["minutesPerAutomatedOrder", "Automated Mins / Order"],
          ].map(([key, label]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-slate-400">{label}</span>
              <NumberInput
                value={config[key]}
                onChange={(v) => setConfig((p) => ({ ...p, [key]: v }))}
                step={1}
                className="w-20"
              />
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-slate-700/30">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Base Minutes / Order (Plan + Execute)</span>
            <span className="font-mono text-teal-300 font-semibold">
              {config.planningMinutesPerOrder + config.executionMinutesPerOrder} min
            </span>
          </div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewLevel("region")}
          className={`px-4 py-2 text-sm rounded-lg transition ${viewLevel === "region" ? "bg-teal-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}
        >
          Regional View
        </button>
        <button
          onClick={() => setViewLevel("area")}
          className={`px-4 py-2 text-sm rounded-lg transition ${viewLevel === "area" ? "bg-teal-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}
        >
          Area View
        </button>
      </div>

      {/* Results table */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider bg-slate-800/50">
                <th className="text-left py-3 px-4 font-medium">{viewLevel === "region" ? "Region" : "Area"}</th>
                <th className="text-right py-3 px-3 font-medium">Moves/FTE/Yr</th>
                <th className="text-right py-3 px-3 font-medium">SC Annual</th>
                <th className="text-right py-3 px-3 font-medium">SC Monthly</th>
                <th className="text-right py-3 px-3 font-medium">Full Annual</th>
                <th className="text-right py-3 px-3 font-medium">Full Monthly</th>
              </tr>
            </thead>
            <tbody>
              {viewLevel === "region"
                ? REGIONS.map((region) => {
                    const t = regionalTargets[region];
                    return (
                      <tr key={region} className="border-t border-slate-700/20 hover:bg-slate-800/30">
                        <td className="py-3 px-4 font-semibold text-slate-200">{region}</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-400">{fmt(t?.movesPerFTE, 0)}</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300">{fmt(t?.scTargetAnnual, 0)}</td>
                        <td className="py-3 px-3 text-right font-mono text-teal-300 font-semibold">{fmt(t?.scTargetMonthly, 0)}</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300">{fmt(t?.mcTargetAnnual, 0)}</td>
                        <td className="py-3 px-3 text-right font-mono text-teal-300 font-semibold">{fmt(t?.mcTargetMonthly, 0)}</td>
                      </tr>
                    );
                  })
                : REGIONS.map((region) => (
                    <>
                      <tr key={region} className="bg-slate-800/40">
                        <td colSpan={6} className="py-2 px-4 font-semibold text-slate-400 text-xs uppercase tracking-wider">{region}</td>
                      </tr>
                      {REGION_AREAS[region].map((area) => {
                        const t = areaTargets[area];
                        const hasCustom = Object.keys(areaPresets).some((k) => k.startsWith(area + "_"));
                        return (
                          <tr key={area} className="border-t border-slate-700/10 hover:bg-slate-800/30">
                            <td className="py-2.5 px-4 pl-8 text-slate-300 flex items-center gap-2">
                              {area}
                              {hasCustom && <Badge color="teal">custom</Badge>}
                              {!hasCustom && <Badge color="slate">regional</Badge>}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-400">{fmt(t?.movesPerFTE, 0)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300">{fmt(t?.scTargetAnnual, 0)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-teal-300 font-semibold">{fmt(t?.scTargetMonthly, 0)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300">{fmt(t?.mcTargetAnnual, 0)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-teal-300 font-semibold">{fmt(t?.mcTargetMonthly, 0)}</td>
                          </tr>
                        );
                      })}
                    </>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── ACTUALS TRACKER ─────────────────────────────────────────────────────────

function ActualsTracker({ actuals, setActuals, areaActuals, setAreaActuals, tmsAreaActuals, setTmsAreaActuals, nonTmsAreaActuals, setNonTmsAreaActuals, metadata }) {
  const [viewLevel, setViewLevel] = useState("area");
  const [splitView, setSplitView] = useState("all"); // "all", "tms", "nontms"
  const [editingCell, setEditingCell] = useState(null);

  // Choose the right dataset based on split view
  const currentData = splitView === "tms" ? tmsAreaActuals : splitView === "nontms" ? nonTmsAreaActuals : areaActuals;
  const currentRegionalData = useMemo(() => {
    if (splitView === "all") return actuals;
    return recalcRegionalFromAreas(currentData);
  }, [splitView, currentData, actuals]);

  const handleAreaChange = (area, field, value) => {
    const numVal = parseFloat(value) || 0;
    if (splitView === "tms") {
      setTmsAreaActuals((prev) => {
        const updated = { ...prev, [area]: { ...prev[area], [field]: numVal } };
        // Auto-recalc All = TMS + Non-TMS
        const newAll = recalcAllFromSplits(updated, nonTmsAreaActuals);
        setAreaActuals(newAll);
        setActuals(recalcRegionalFromAreas(newAll));
        return updated;
      });
    } else if (splitView === "nontms") {
      setNonTmsAreaActuals((prev) => {
        const updated = { ...prev, [area]: { ...prev[area], [field]: numVal } };
        const newAll = recalcAllFromSplits(tmsAreaActuals, updated);
        setAreaActuals(newAll);
        setActuals(recalcRegionalFromAreas(newAll));
        return updated;
      });
    } else {
      // Direct edit on All — don't cascade back to TMS/Non-TMS
      setAreaActuals((prev) => {
        const updated = { ...prev, [area]: { ...prev[area], [field]: numVal } };
        setActuals(recalcRegionalFromAreas(updated));
        return updated;
      });
    }
  };

  const handleRegionalChange = (region, field, value) => {
    setActuals((prev) => ({
      ...prev,
      [region]: { ...prev[region], [field]: parseFloat(value) || 0 },
    }));
  };

  const fields = [
    { key: "ftes", label: "FTEs" },
    { key: "scFFE", label: "SC FFEs" },
    { key: "mcFFE", label: "MC FFEs" },
    { key: "empties", label: "Empties" },
    { key: "cx", label: "CX" },
    { key: "mcOps", label: "MC Ops" },
    { key: "finOps", label: "FinOps" },
    { key: "vm", label: "VM" },
    { key: "exclusions", label: "LAM Excl." },
    { key: "otherExcl", label: "Other Excl." },
  ];

  const renderEditableCell = (entity, field, value, handler) => {
    const cellKey = `${splitView}-${entity}-${field}`;
    const isEditing = editingCell === cellKey;
    const isZero = (value || 0) === 0 && splitView !== "all";
    return (
      <td
        key={field}
        className={`py-2 px-2 text-right font-mono text-sm cursor-pointer hover:bg-slate-700/30 ${isZero ? "text-slate-600" : "text-slate-300"}`}
        onClick={() => setEditingCell(cellKey)}
      >
        {isEditing ? (
          <input
            type="number"
            autoFocus
            defaultValue={value || 0}
            onBlur={(e) => {
              handler(entity, field, e.target.value);
              setEditingCell(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handler(entity, field, e.target.value);
                setEditingCell(null);
              }
            }}
            className="w-full bg-slate-900 border border-teal-500 rounded px-2 py-0.5 text-right text-sm text-slate-200 focus:outline-none"
          />
        ) : (
          fmt(value, 0)
        )}
      </td>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-slate-200 tracking-wide uppercase mb-2">Actuals Data {metadata?.lastUpdate ? `— ${metadata.lastUpdate}` : ""}</h3>
        <p className="text-sm text-slate-400">
          Click any cell to edit. Editing TMS or Non-TMS automatically recalculates the All view.
          {splitView === "all" && <span className="text-amber-400 ml-2">Tip: Edit in TMS/Non-TMS tabs for automatic roll-up.</span>}
        </p>
      </div>

      {/* Split view tabs */}
      <div className="flex gap-1 bg-slate-800/30 rounded-lg p-1 w-fit">
        {[
          { id: "all", label: "All", desc: "Combined" },
          { id: "tms", label: "TMS", desc: "TMS countries" },
          { id: "nontms", label: "Non-TMS", desc: "Non-TMS countries" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSplitView(tab.id)}
            className={`px-4 py-2 text-sm rounded-md transition ${
              splitView === tab.id
                ? "bg-teal-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setViewLevel("region")}
          className={`px-4 py-2 text-sm rounded-lg transition ${viewLevel === "region" ? "bg-slate-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}
        >
          Regional
        </button>
        <button
          onClick={() => setViewLevel("area")}
          className={`px-4 py-2 text-sm rounded-lg transition ${viewLevel === "area" ? "bg-slate-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}
        >
          Area
        </button>
      </div>

      <div className="bg-slate-800/30 rounded-xl border border-slate-700/40 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wider bg-slate-800/50">
              <th className="text-left py-3 px-4 font-medium">{viewLevel === "region" ? "Region" : "Area"}</th>
              {fields.map((f) => (
                <th key={f.key} className="text-right py-3 px-2 font-medium">{f.label}</th>
              ))}
              <th className="text-right py-3 px-4 font-medium">Net FTEs</th>
            </tr>
          </thead>
          <tbody>
            {viewLevel === "region"
              ? REGIONS.map((region) => {
                  const d = currentRegionalData[region] || {};
                  const net = (d.ftes || 0) - (d.cx || 0) - (d.vm || 0) - (d.exclusions || 0) - (d.otherExcl || 0);
                  return (
                    <tr key={region} className="border-t border-slate-700/20 hover:bg-slate-800/30">
                      <td className="py-2 px-4 font-semibold text-slate-200">{region}</td>
                      {splitView === "all" && viewLevel === "region"
                        ? fields.map((f) => renderEditableCell(region, f.key, d[f.key], handleRegionalChange))
                        : fields.map((f) => (
                            <td key={f.key} className="py-2 px-2 text-right font-mono text-sm text-slate-400">
                              {fmt(d[f.key], 0)}
                            </td>
                          ))}
                      <td className="py-2 px-4 text-right font-mono font-semibold text-teal-300">{fmt(net, 0)}</td>
                    </tr>
                  );
                })
              : REGIONS.map((region) => (
                  <>
                    <tr key={`h-${region}`} className="bg-slate-800/40">
                      <td colSpan={fields.length + 2} className="py-2 px-4 font-semibold text-slate-400 text-xs uppercase tracking-wider">{region}</td>
                    </tr>
                    {REGION_AREAS[region].map((area) => {
                      const d = currentData[area] || {};
                      const net = (d.ftes || 0) - (d.cx || 0) - (d.vm || 0) - (d.exclusions || 0) - (d.otherExcl || 0);
                      const isAllZero = !d.ftes && !d.scFFE && !d.mcFFE;
                      return (
                        <tr key={area} className={`border-t border-slate-700/10 hover:bg-slate-800/30 ${isAllZero ? "opacity-40" : ""}`}>
                          <td className="py-2 px-4 pl-8 text-slate-300">
                            {area}
                            {isAllZero && splitView !== "all" && <span className="text-xs text-slate-600 ml-2">no data</span>}
                          </td>
                          {fields.map((f) => renderEditableCell(area, f.key, d[f.key], handleAreaChange))}
                          <td className="py-2 px-4 text-right font-mono font-semibold text-teal-300">{net > 0 ? fmt(net, 0) : "—"}</td>
                        </tr>
                      );
                    })}
                  </>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── GAP ANALYSIS ────────────────────────────────────────────────────────────

function GapAnalysis({ config, actuals, areaActuals, tmsAreaActuals, nonTmsAreaActuals, areaPresets, areaLaneData, emptiesConfig, emptiesShare }) {
  const [viewLevel, setViewLevel] = useState("area");
  const [splitView, setSplitView] = useState("all");

  const currentAreaData = splitView === "tms" ? tmsAreaActuals : splitView === "nontms" ? nonTmsAreaActuals : areaActuals;
  const currentRegionalData = useMemo(() => {
    if (splitView === "all") return actuals;
    return recalcRegionalFromAreas(currentAreaData);
  }, [splitView, currentAreaData, actuals]);

  const regionalResults = useMemo(() => {
    return REGIONS.map((region) => {
      const regionPresets = {};
      const regionLaneData = {};
      Object.keys(REGIONAL_PRESETS).forEach((key) => {
        if (key.startsWith(region + "_")) {
          regionPresets[key] = REGIONAL_PRESETS[key];
          regionLaneData[key] = REGIONAL_LANE_DATA[key];
        }
      });
      // For regional view, empties included if any area in region has it enabled
      const regionHasEmpties = REGION_AREAS[region].some((a) => emptiesConfig[a]);
      const target = calcTarget(config, regionPresets, regionLaneData, getRegionalFroFfe(region, regionHasEmpties), DEFAULT_ACTUALS[region]?.volShare || 0, regionHasEmpties, emptiesShare[region]);
      const actual = calcActualProd(currentRegionalData[region] || {}, getRegionalFroFfe(region, regionHasEmpties), regionHasEmpties);
      const scGap = actual.scProd > 0 ? (target.scTargetMonthly - actual.scProd) / actual.scProd : null;
      const mcGap = actual.mcProd > 0 ? (target.mcTargetMonthly - actual.mcProd) / actual.mcProd : null;
      return { region, target, actual, scGap, mcGap };
    });
  }, [config, currentRegionalData, emptiesConfig, emptiesShare]);

  const areaResults = useMemo(() => {
    const results = [];
    REGIONS.forEach((region) => {
      REGION_AREAS[region].forEach((area) => {
        const aPresets = {};
        const aLaneData = {};
        const laneTypes = Object.keys(REGIONAL_PRESETS)
          .filter((k) => k.startsWith(region + "_"))
          .map((k) => k.split("_")[1]);
        
        laneTypes.forEach((lane) => {
          const areaKey = `${area}_${lane}`;
          const regionKey = `${region}_${lane}`;
          aPresets[areaKey] = areaPresets[areaKey] || REGIONAL_PRESETS[regionKey];
          aLaneData[areaKey] = areaLaneData[areaKey] || REGIONAL_LANE_DATA[regionKey];
        });

        const hasCustom = Object.keys(areaPresets).some((k) => k.startsWith(area + "_"));
        const target = calcTarget(config, aPresets, aLaneData, getRegionalFroFfe(region, emptiesConfig[area] || false), DEFAULT_ACTUALS[region]?.volShare || 0, emptiesConfig[area] || false, emptiesShare[region]);
        const areaData = currentAreaData[area] || {};
        const actual = calcActualProd(areaData, getRegionalFroFfe(region, emptiesConfig[area] || false), emptiesConfig[area] || false);
        const scGap = actual.scProd > 0 ? (target.scTargetMonthly - actual.scProd) / actual.scProd : null;
        const mcGap = actual.mcProd > 0 ? (target.mcTargetMonthly - actual.mcProd) / actual.mcProd : null;
        const hasData = (areaData.ftes || 0) > 0 || (areaData.scFFE || 0) > 0;

        results.push({ area, region, target, actual, scGap, mcGap, hasCustom, hasData });
      });
    });
    return results;
  }, [config, currentAreaData, areaPresets, areaLaneData, emptiesConfig, emptiesShare]);

  const GapBar = ({ gap, width = 120 }) => {
    if (gap == null || isNaN(gap) || !isFinite(gap)) return <span className="text-slate-600">—</span>;
    const clamped = Math.min(Math.max(gap, -1), 5);
    const pxWidth = Math.abs(clamped) / 5 * width;
    const isNeg = gap < 0;
    return (
      <div className="flex items-center gap-2">
        <div className="relative" style={{ width }}>
          <div className="absolute top-0 h-5 bg-slate-700/30 rounded" style={{ width, left: 0 }} />
          <div
            className={`absolute top-0 h-5 rounded ${isNeg ? "bg-emerald-500/40" : gap < 0.2 ? "bg-amber-500/30" : "bg-red-500/30"}`}
            style={{
              width: pxWidth,
              left: isNeg ? width / 2 - pxWidth : 0,
            }}
          />
        </div>
        <span className={`font-mono text-xs font-semibold ${gapColor(gap)}`}>
          {pct(gap)}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-slate-200 tracking-wide uppercase mb-2">Gap Analysis — Actuals vs Targets</h3>
        <p className="text-sm text-slate-400">
          Positive gap = below target (improvement needed). Negative gap = above target. All figures are monthly (single-month comparison).
          <span className="inline-flex items-center gap-3 ml-4">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> On/above target</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Near target</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Significant gap</span>
          </span>
        </p>
      </div>

      {/* Split view tabs */}
      <div className="flex gap-1 bg-slate-800/30 rounded-lg p-1 w-fit">
        {[
          { id: "all", label: "All" },
          { id: "tms", label: "TMS" },
          { id: "nontms", label: "Non-TMS" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSplitView(tab.id)}
            className={`px-4 py-2 text-sm rounded-md transition ${
              splitView === tab.id
                ? "bg-teal-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={() => setViewLevel("region")} className={`px-4 py-2 text-sm rounded-lg transition ${viewLevel === "region" ? "bg-slate-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}>Regional</button>
        <button onClick={() => setViewLevel("area")} className={`px-4 py-2 text-sm rounded-lg transition ${viewLevel === "area" ? "bg-slate-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}>Area</button>
      </div>

      <div className="bg-slate-800/30 rounded-xl border border-slate-700/40 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wider bg-slate-800/50">
              <th className="text-left py-3 px-4 font-medium">{viewLevel === "region" ? "Region" : "Area"}</th>
              <th className="text-right py-3 px-3 font-medium">Net FTEs</th>
              <th className="text-right py-3 px-3 font-medium">Single Carrier Actual</th>
              <th className="text-right py-3 px-3 font-medium">Single Carrier Target</th>
              <th className="text-left py-3 px-3 font-medium">SC Gap</th>
              <th className="text-right py-3 px-3 font-medium">Landside Prod Actual (SC+MC)</th>
              <th className="text-right py-3 px-3 font-medium">Landside Prod Target (SC+MC)</th>
              <th className="text-left py-3 px-3 font-medium">SC+MC Gap</th>
            </tr>
          </thead>
          <tbody>
            {viewLevel === "region"
              ? regionalResults.map((r) => (
                  <tr key={r.region} className={`border-t border-slate-700/20 hover:bg-slate-800/30 ${gapBg(r.mcGap)}`}>
                    <td className="py-3 px-4 font-semibold text-slate-200">{r.region}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300">{fmt(r.actual.netFTEs, 0)}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300">{fmt(r.actual.scProd, 0)}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-200">{fmt(r.target.scTargetMonthly, 0)}</td>
                    <td className="py-3 px-3"><GapBar gap={r.scGap} /></td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300">{fmt(r.actual.mcProd, 0)}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-200">{fmt(r.target.mcTargetMonthly, 0)}</td>
                    <td className="py-3 px-3"><GapBar gap={r.mcGap} /></td>
                  </tr>
                ))
              : REGIONS.map((region) => (
                  <>
                    <tr key={`h-${region}`} className="bg-slate-800/40">
                      <td colSpan={8} className="py-2 px-4 font-semibold text-slate-400 text-xs uppercase tracking-wider">{region}</td>
                    </tr>
                    {areaResults
                      .filter((a) => a.region === region)
                      .map((a) => (
                        <tr key={a.area} className={`border-t border-slate-700/10 hover:bg-slate-800/30 ${a.hasData ? gapBg(a.mcGap) : "opacity-35"}`}>
                          <td className="py-2.5 px-4 pl-8 text-slate-300 flex items-center gap-2">
                            {a.area}
                            {a.hasCustom && <Badge color="teal">custom</Badge>}
                            {!a.hasData && splitView !== "all" && <span className="text-xs text-slate-600">no data</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">{fmt(a.actual.netFTEs, 0)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">{fmt(a.actual.scProd, 0)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-200">{fmt(a.target.scTargetMonthly, 0)}</td>
                          <td className="py-2.5 px-3"><GapBar gap={a.scGap} /></td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">{fmt(a.actual.mcProd, 0)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-200">{fmt(a.target.mcTargetMonthly, 0)}</td>
                          <td className="py-2.5 px-3"><GapBar gap={a.mcGap} /></td>
                        </tr>
                      ))}
                  </>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── FRO/FFE RATIOS ─────────────────────────────────────────────────────────

function FroFfeManager() {
  return (
    <div className="space-y-4">
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-slate-200 tracking-wide uppercase mb-2">FRO/FFE Conversion Ratios</h3>
        <p className="text-sm text-slate-400">Two sets of ratios: Base (without empties) used for regions/areas without empties. Adjusted (with empties) used where empties are counted. The adjusted ratios account for the empties volume in the FRO-to-FFE conversion.</p>
      </div>

      <div className="bg-slate-800/30 rounded-xl border border-slate-700/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wider bg-slate-800/50">
              <th className="text-left py-3 px-4 font-medium">Region</th>
              <th className="text-center py-3 px-3 font-medium">SC Base</th>
              <th className="text-center py-3 px-3 font-medium">SC Adjusted</th>
              <th className="text-center py-3 px-3 font-medium">Full Base</th>
              <th className="text-center py-3 px-3 font-medium">Full Adjusted</th>
              <th className="text-center py-3 px-3 font-medium">Empties?</th>
            </tr>
          </thead>
          <tbody>
            {REGIONS.map((region) => {
              const hasEmp = REGION_AREAS[region].some((a) => DEFAULT_EMPTIES_CONFIG[a]);
              return (
                <tr key={region} className="border-t border-slate-700/20">
                  <td className="py-3 px-4 font-semibold text-slate-200">{region}</td>
                  <td className="py-3 px-3 text-center font-mono text-slate-300">{REGIONAL_FRO_FFE_BASE[region].sc}</td>
                  <td className={`py-3 px-3 text-center font-mono ${hasEmp ? "text-teal-300" : "text-slate-500"}`}>{REGIONAL_FRO_FFE_ADJ[region].sc}</td>
                  <td className="py-3 px-3 text-center font-mono text-slate-300">{REGIONAL_FRO_FFE_BASE[region].mc}</td>
                  <td className={`py-3 px-3 text-center font-mono ${hasEmp ? "text-teal-300" : "text-slate-500"}`}>{REGIONAL_FRO_FFE_ADJ[region].mc}</td>
                  <td className="py-3 px-3 text-center">{hasEmp ? <span className="text-teal-400 text-xs font-medium">Yes</span> : <span className="text-slate-600 text-xs">No</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── WORKFORCE PLANNING ──────────────────────────────────────────────────────

function WorkforcePlanning({ config, actuals, areaActuals, areaPresets, areaLaneData, emptiesConfig, emptiesShare }) {
  const [viewLevel, setViewLevel] = useState("region");

  const results = useMemo(() => {
    const regionResults = REGIONS.map((region) => {
      // Calculate target productivity (monthly) for this region
      const regionPresets = {};
      const regionLaneData = {};
      Object.keys(REGIONAL_PRESETS).forEach((key) => {
        if (key.startsWith(region + "_")) {
          regionPresets[key] = REGIONAL_PRESETS[key];
          regionLaneData[key] = REGIONAL_LANE_DATA[key];
        }
      });
      const target = calcTarget(config, regionPresets, regionLaneData, getRegionalFroFfe(region, REGION_AREAS[region].some(a => DEFAULT_EMPTIES_CONFIG[a])), DEFAULT_ACTUALS[region]?.volShare || 0, REGION_AREAS[region].some(a => DEFAULT_EMPTIES_CONFIG[a]), DEFAULT_EMPTIES_SHARE[region]);

      // Calculate effective volume per region (SC + MC + 25% empties where applicable)
      const areas = REGION_AREAS[region];
      let totalVol = 0;
      let totalFTEs = 0;
      let totalNetFTEs = 0;
      areas.forEach((area) => {
        const d = areaActuals[area] || {};
        totalVol += calcEffectiveVolume(d, emptiesConfig[area] || false);
        totalFTEs += d.ftes || 0;
        const net = (d.ftes || 0) - (d.cx || 0) - (d.vm || 0) - (d.exclusions || 0) - (d.otherExcl || 0);
        totalNetFTEs += Math.max(net, 0);
      });

      // FTEs needed = volume / target productivity (monthly)
      const ftesNeededAtTarget = target.mcTargetMonthly > 0 ? totalVol / target.mcTargetMonthly : 0;
      const fteSurplus = totalNetFTEs - ftesNeededAtTarget;
      const fteSurplusPct = totalNetFTEs > 0 ? fteSurplus / totalNetFTEs : 0;

      return { region, totalVol, totalFTEs, totalNetFTEs, target, ftesNeededAtTarget, fteSurplus, fteSurplusPct };
    });

    // Area results
    const areaResultsList = [];
    REGIONS.forEach((region) => {
      REGION_AREAS[region].forEach((area) => {
        const aPresets = {};
        const aLaneData = {};
        const laneTypes = Object.keys(REGIONAL_PRESETS)
          .filter((k) => k.startsWith(region + "_"))
          .map((k) => k.split("_")[1]);
        laneTypes.forEach((lane) => {
          const areaKey = `${area}_${lane}`;
          const regionKey = `${region}_${lane}`;
          aPresets[areaKey] = areaPresets[areaKey] || REGIONAL_PRESETS[regionKey];
          aLaneData[areaKey] = areaLaneData[areaKey] || REGIONAL_LANE_DATA[regionKey];
        });

        const target = calcTarget(config, aPresets, aLaneData, getRegionalFroFfe(region, DEFAULT_EMPTIES_CONFIG[area] || false), DEFAULT_ACTUALS[region]?.volShare || 0, DEFAULT_EMPTIES_CONFIG[area] || false, DEFAULT_EMPTIES_SHARE[region]);
        const d = areaActuals[area] || {};
        const vol = calcEffectiveVolume(d, emptiesConfig[area] || false);
        const netFTEs = Math.max((d.ftes || 0) - (d.cx || 0) - (d.vm || 0) - (d.exclusions || 0) - (d.otherExcl || 0), 0);
        const ftesNeeded = target.mcTargetMonthly > 0 ? vol / target.mcTargetMonthly : 0;
        const surplus = netFTEs - ftesNeeded;
        const surplusPct = netFTEs > 0 ? surplus / netFTEs : 0;

        areaResultsList.push({ area, region, vol, ftes: d.ftes || 0, netFTEs, target, ftesNeeded, surplus, surplusPct, emptiesOn: emptiesConfig[area] || false });
      });
    });

    // Global totals
    const globalVolume = regionResults.reduce((s, r) => s + r.totalVol, 0);
    const globalFTEs = regionResults.reduce((s, r) => s + r.totalNetFTEs, 0);
    const globalNeeded = regionResults.reduce((s, r) => s + r.ftesNeededAtTarget, 0);
    const globalSurplus = globalFTEs - globalNeeded;

    return { regionResults, areaResults: areaResultsList, globalVolume, globalFTEs, globalNeeded, globalSurplus };
  }, [config, areaActuals, areaPresets, areaLaneData, emptiesConfig]);

  const surplusColor = (s) => {
    if (s > 0) return "text-emerald-400";
    if (s > -5) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-slate-200 tracking-wide uppercase mb-2">Workforce Planning — FTE Reduction Opportunity</h3>
        <p className="text-sm text-slate-400">
          Calculates FTEs needed to handle current volume at target productivity. Positive surplus = FTEs above target that can be reduced. Empties counted at 25% effort where enabled.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800/40 rounded-xl border border-slate-700/40 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Current Net FTEs</div>
          <div className="text-2xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmt(results.globalFTEs, 0)}</div>
        </div>
        <div className="bg-slate-800/40 rounded-xl border border-slate-700/40 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">FTEs Needed at Target</div>
          <div className="text-2xl font-bold text-teal-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmt(results.globalNeeded, 0)}</div>
        </div>
        <div className={`bg-slate-800/40 rounded-xl border border-slate-700/40 p-4`}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">FTE Reduction Opportunity</div>
          <div className={`text-2xl font-bold ${surplusColor(results.globalSurplus)}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {results.globalSurplus > 0 ? "+" : ""}{fmt(results.globalSurplus, 0)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {results.globalFTEs > 0 ? pct(results.globalSurplus / results.globalFTEs) : "—"} of workforce
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setViewLevel("region")} className={`px-4 py-2 text-sm rounded-lg transition ${viewLevel === "region" ? "bg-teal-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}>Regional</button>
        <button onClick={() => setViewLevel("area")} className={`px-4 py-2 text-sm rounded-lg transition ${viewLevel === "area" ? "bg-teal-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}>Area</button>
      </div>

      <div className="bg-slate-800/30 rounded-xl border border-slate-700/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wider bg-slate-800/50">
              <th className="text-left py-3 px-4 font-medium">{viewLevel === "region" ? "Region" : "Area"}</th>
              <th className="text-right py-3 px-3 font-medium">Eff. Volume</th>
              <th className="text-right py-3 px-3 font-medium">Current Net FTEs</th>
              <th className="text-right py-3 px-3 font-medium">Target Prod.</th>
              <th className="text-right py-3 px-3 font-medium">FTEs Needed</th>
              <th className="text-right py-3 px-3 font-medium">Surplus/(Deficit)</th>
              <th className="text-right py-3 px-3 font-medium">% of Current</th>
            </tr>
          </thead>
          <tbody>
            {viewLevel === "region"
              ? results.regionResults.map((r) => {
                  const sc = surplusColor(r.fteSurplus);
                  return (
                    <tr key={r.region} className="border-t border-slate-700/20 hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-semibold text-slate-200">{r.region}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-300">{fmt(r.totalVol, 0)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-300">{fmt(r.totalNetFTEs, 0)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-400">{fmt(r.target.mcTargetMonthly, 0)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-300">{fmt(r.ftesNeededAtTarget, 1)}</td>
                      <td className={`py-3 px-3 text-right font-mono font-semibold ${sc}`}>{r.fteSurplus > 0 ? "+" : ""}{fmt(r.fteSurplus, 1)}</td>
                      <td className={`py-3 px-3 text-right font-mono ${sc}`}>{r.totalNetFTEs > 0 ? pct(r.fteSurplus / r.totalNetFTEs) : "—"}</td>
                    </tr>
                  );
                })
              : REGIONS.map((region) => (
                  <Fragment key={region}>
                    <tr className="bg-slate-800/40">
                      <td colSpan={7} className="py-2 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{region}</td>
                    </tr>
                    {results.areaResults.filter((a) => a.region === region).map((a) => {
                      const sc2 = surplusColor(a.surplus);
                      return (
                        <tr key={a.area} className="border-t border-slate-700/10 hover:bg-slate-800/20">
                          <td className="py-2.5 px-4 pl-8 text-slate-300">{a.area} {a.emptiesOn ? <span className="text-teal-500 text-xs ml-1">+empties</span> : ""}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-400">{fmt(a.vol, 0)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-400">{fmt(a.netFTEs, 0)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-500">{fmt(a.target.mcTargetMonthly, 0)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-400">{fmt(a.ftesNeeded, 1)}</td>
                          <td className={"py-2.5 px-3 text-right font-mono font-semibold " + sc2}>{a.surplus > 0 ? "+" : ""}{fmt(a.surplus, 1)}</td>
                          <td className={"py-2.5 px-3 text-right font-mono " + sc2}>{a.netFTEs > 0 ? pct(a.surplus / a.netFTEs) : "—"}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
            <tr className="border-t-2 border-slate-600 bg-slate-800/50 font-semibold">
              <td className="py-3 px-4 text-slate-200">Global Total</td>
              <td className="py-3 px-3 text-right font-mono text-slate-200">{fmt(results.globalVolume, 0)}</td>
              <td className="py-3 px-3 text-right font-mono text-slate-200">{fmt(results.globalFTEs, 0)}</td>
              <td className="py-3 px-3 text-right font-mono text-slate-400">—</td>
              <td className="py-3 px-3 text-right font-mono text-slate-200">{fmt(results.globalNeeded, 1)}</td>
              <td className={`py-3 px-3 text-right font-mono font-bold ${results.globalSurplus >= 0 ? "text-emerald-400" : "text-red-400"}`}>{results.globalSurplus > 0 ? "+" : ""}{fmt(results.globalSurplus, 1)}</td>
              <td className={`py-3 px-3 text-right font-mono ${results.globalSurplus >= 0 ? "text-emerald-400" : "text-red-400"}`}>{results.globalFTEs > 0 ? pct(results.globalSurplus / results.globalFTEs) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── FTE PROGRESS TRACKER ────────────────────────────────────────────────────

function FTEProgressTracker({ areaActuals, emptiesConfig, config, areaPresets, areaLaneData, emptiesShare }) {
  // Baseline: stored snapshot from a reference date (e.g. Oct 2025)
  const [baseline, setBaseline] = useState({});
  const [baselineDate, setBaselineDate] = useState("October 2025");
  const [currentDate, setCurrentDate] = useState("March 2026");

  // Load/save baseline from storage
  useEffect(() => {
    const loadBaseline = async () => {
      try {
        const res = await storage.get("fte-baseline");
        if (res) {
          const data = JSON.parse(res.value);
          if (data.baseline) setBaseline(data.baseline);
          if (data.baselineDate) setBaselineDate(data.baselineDate);
          if (data.currentDate) setCurrentDate(data.currentDate);
        }
      } catch (e) { /* no baseline yet */ }
    };
    loadBaseline();
  }, []);

  const saveBaseline = async (newBaseline, bDate, cDate) => {
    try {
      await storage.set("fte-baseline", JSON.stringify({ baseline: newBaseline, baselineDate: bDate, currentDate: cDate }));
    } catch (e) { /* storage error */ }
  };

  // Snapshot current actuals as baseline
  const captureBaseline = () => {
    const snap = {};
    REGIONS.forEach((region) => {
      REGION_AREAS[region].forEach((area) => {
        const d = areaActuals[area] || {};
        const netFTEs = Math.max((d.ftes || 0) - (d.cx || 0) - (d.vm || 0) - (d.exclusions || 0) - (d.otherExcl || 0), 0);
        const vol = calcEffectiveVolume(d, emptiesConfig[area] || false);
        snap[area] = { ftes: d.ftes || 0, netFTEs, vol };
      });
    });
    setBaseline(snap);
    saveBaseline(snap, baselineDate, currentDate);
  };

  // Calculate progress for each area
  const progress = useMemo(() => {
    const rows = [];
    let totalBaseNet = 0, totalCurrNet = 0, totalBaseGap = 0, totalReduced = 0;

    REGIONS.forEach((region) => {
      REGION_AREAS[region].forEach((area) => {
        const base = baseline[area] || {};
        const d = areaActuals[area] || {};
        const currNetFTEs = Math.max((d.ftes || 0) - (d.cx || 0) - (d.vm || 0) - (d.exclusions || 0) - (d.otherExcl || 0), 0);
        const currVol = calcEffectiveVolume(d, emptiesConfig[area] || false);

        // Calculate target FTEs needed using current volume
        const aPresets = {};
        const aLaneData = {};
        const laneTypes = Object.keys(REGIONAL_PRESETS).filter((k) => k.startsWith(region + "_")).map((k) => k.split("_")[1]);
        laneTypes.forEach((lane) => {
          const areaKey = area + "_" + lane;
          const regionKey = region + "_" + lane;
          aPresets[areaKey] = areaPresets[areaKey] || REGIONAL_PRESETS[regionKey];
          aLaneData[areaKey] = areaLaneData[areaKey] || REGIONAL_LANE_DATA[regionKey];
        });
        const target = calcTarget(config, aPresets, aLaneData, getRegionalFroFfe(region, DEFAULT_EMPTIES_CONFIG[area] || false), DEFAULT_ACTUALS[region]?.volShare || 0, DEFAULT_EMPTIES_CONFIG[area] || false, DEFAULT_EMPTIES_SHARE[region]);

        const baseNetFTEs = base.netFTEs || 0;
        const baseVol = base.vol || 0;
        const ftesNeeded = target.mcTargetMonthly > 0 ? currVol / target.mcTargetMonthly : 0;
        const baseGap = baseNetFTEs - ftesNeeded;
        const fteChange = baseNetFTEs - currNetFTEs;
        const gapClosure = baseGap > 0 ? Math.min(fteChange / baseGap, 1) : 0;

        totalBaseNet += baseNetFTEs;
        totalCurrNet += currNetFTEs;
        totalBaseGap += Math.max(baseGap, 0);
        totalReduced += Math.max(fteChange, 0);

        rows.push({ area, region, baseNetFTEs, currNetFTEs, ftesNeeded, baseGap, fteChange, gapClosure });
      });
    });

    const totalGapClosure = totalBaseGap > 0 ? Math.min(totalReduced / totalBaseGap, 1) : 0;
    return { rows, totalBaseNet, totalCurrNet, totalBaseGap, totalReduced, totalGapClosure };
  }, [baseline, areaActuals, emptiesConfig, config, areaPresets, areaLaneData, emptiesShare]);

  const hasBaseline = Object.keys(baseline).length > 0;

  return (
    <div className="space-y-4">
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-slate-200 tracking-wide uppercase mb-2">FTE Reduction Progress Tracker</h3>
        <p className="text-sm text-slate-400">
          Track FTE reductions from a baseline snapshot. Capture baseline from current actuals, then update actuals over time to see gap closure progress.
        </p>
        <div className="mt-4 flex items-end gap-4">
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">Baseline Date</label>
            <input type="text" value={baselineDate} onChange={(e) => { setBaselineDate(e.target.value); saveBaseline(baseline, e.target.value, currentDate); }} placeholder="e.g. October 2025" className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">Current Date</label>
            <input type="text" value={currentDate} onChange={(e) => { setCurrentDate(e.target.value); saveBaseline(baseline, baselineDate, e.target.value); }} placeholder="e.g. March 2026" className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none" />
          </div>
          <button onClick={captureBaseline} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg transition font-medium">
            {hasBaseline ? "Re-capture Baseline" : "Capture Baseline from Current Actuals"}
          </button>
        </div>
      </div>

      {!hasBaseline ? (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/40 p-8 text-center text-slate-500">
          No baseline captured yet. Enter your baseline actuals data, then click "Capture Baseline" to set the reference point.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-800/40 rounded-xl border border-slate-700/40 p-4">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Baseline Net FTEs</div>
              <div className="text-xl font-bold text-slate-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmt(progress.totalBaseNet, 0)}</div>
              <div className="text-xs text-slate-600 mt-1">{baselineDate}</div>
            </div>
            <div className="bg-slate-800/40 rounded-xl border border-slate-700/40 p-4">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Current Net FTEs</div>
              <div className="text-xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmt(progress.totalCurrNet, 0)}</div>
              <div className="text-xs text-slate-600 mt-1">{currentDate}</div>
            </div>
            <div className="bg-slate-800/40 rounded-xl border border-slate-700/40 p-4">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">FTEs Reduced</div>
              <div className="text-xl font-bold text-emerald-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{progress.totalReduced > 0 ? "-" : ""}{fmt(progress.totalReduced, 0)}</div>
              <div className="text-xs text-slate-600 mt-1">of {fmt(progress.totalBaseGap, 0)} gap</div>
            </div>
            <div className="bg-slate-800/40 rounded-xl border border-slate-700/40 p-4">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Gap Closure</div>
              <div className={`text-xl font-bold ${progress.totalGapClosure >= 0.75 ? "text-emerald-400" : progress.totalGapClosure >= 0.4 ? "text-amber-400" : "text-red-400"}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>{pct(progress.totalGapClosure)}</div>
              <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
                <div className={`h-2 rounded-full transition-all ${progress.totalGapClosure >= 0.75 ? "bg-emerald-500" : progress.totalGapClosure >= 0.4 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: Math.min(progress.totalGapClosure * 100, 100) + "%" }} />
              </div>
            </div>
          </div>

          {/* Area detail table */}
          <div className="bg-slate-800/30 rounded-xl border border-slate-700/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wider bg-slate-800/50">
                  <th className="text-left py-3 px-4 font-medium">Area</th>
                  <th className="text-right py-3 px-3 font-medium">Baseline FTEs</th>
                  <th className="text-right py-3 px-3 font-medium">Current FTEs</th>
                  <th className="text-right py-3 px-3 font-medium">FTEs Needed</th>
                  <th className="text-right py-3 px-3 font-medium">Baseline Gap</th>
                  <th className="text-right py-3 px-3 font-medium">FTE Change</th>
                  <th className="text-right py-3 px-3 font-medium">Gap Closure</th>
                </tr>
              </thead>
              <tbody>
                {REGIONS.map((region) => (
                  <Fragment key={region}>
                    <tr className="bg-slate-800/40">
                      <td colSpan={7} className="py-2 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{region}</td>
                    </tr>
                    {progress.rows.filter((r) => r.region === region).map((r) => {
                      const changeColor = r.fteChange > 0 ? "text-emerald-400" : r.fteChange < 0 ? "text-red-400" : "text-slate-500";
                      const closureColor = r.gapClosure >= 0.75 ? "text-emerald-400" : r.gapClosure >= 0.4 ? "text-amber-400" : r.baseGap <= 0 ? "text-slate-500" : "text-red-400";
                      return (
                        <tr key={r.area} className="border-t border-slate-700/10 hover:bg-slate-800/20">
                          <td className="py-2.5 px-4 pl-8 text-slate-300">{r.area}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-400">{fmt(r.baseNetFTEs, 0)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">{fmt(r.currNetFTEs, 0)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-500">{fmt(r.ftesNeeded, 1)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-400">{r.baseGap > 0 ? fmt(r.baseGap, 1) : "—"}</td>
                          <td className={`py-2.5 px-3 text-right font-mono font-semibold ${changeColor}`}>{r.fteChange > 0 ? "-" : r.fteChange < 0 ? "+" : ""}{fmt(Math.abs(r.fteChange), 0)}</td>
                          <td className={`py-2.5 px-3 text-right font-mono ${closureColor}`}>
                            {r.baseGap > 0 ? (
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 bg-slate-700 rounded-full h-1.5">
                                  <div className={`h-1.5 rounded-full ${r.gapClosure >= 0.75 ? "bg-emerald-500" : r.gapClosure >= 0.4 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: Math.min(r.gapClosure * 100, 100) + "%" }} />
                                </div>
                                <span>{pct(r.gapClosure)}</span>
                              </div>
                            ) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
                <tr className="border-t-2 border-slate-600 bg-slate-800/50 font-semibold">
                  <td className="py-3 px-4 text-slate-200">Global Total</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-200">{fmt(progress.totalBaseNet, 0)}</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-200">{fmt(progress.totalCurrNet, 0)}</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-400">—</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-200">{fmt(progress.totalBaseGap, 0)}</td>
                  <td className={`py-3 px-3 text-right font-mono font-bold text-emerald-400`}>{progress.totalReduced > 0 ? "-" : ""}{fmt(progress.totalReduced, 0)}</td>
                  <td className="py-3 px-3 text-right font-mono">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-slate-700 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${progress.totalGapClosure >= 0.75 ? "bg-emerald-500" : progress.totalGapClosure >= 0.4 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: Math.min(progress.totalGapClosure * 100, 100) + "%" }} />
                      </div>
                      <span className={progress.totalGapClosure >= 0.75 ? "text-emerald-400" : progress.totalGapClosure >= 0.4 ? "text-amber-400" : "text-red-400"}>{pct(progress.totalGapClosure)}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── SETTINGS PANEL ──────────────────────────────────────────────────────────

function SettingsPanel({ emptiesConfig, setEmptiesConfig, emptiesShare, setEmptiesShare, metadata, setMetadata }) {
  return (
    <div className="space-y-6">
      {/* Metadata */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-slate-200 tracking-wide uppercase mb-4">Data Metadata</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">Last Data Update</label>
            <input
              type="text"
              value={metadata.lastUpdate || ""}
              onChange={(e) => setMetadata((p) => ({ ...p, lastUpdate: e.target.value }))}
              placeholder="e.g. October 2025"
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">Updated By</label>
            <input
              type="text"
              value={metadata.updatedBy || ""}
              onChange={(e) => setMetadata((p) => ({ ...p, updatedBy: e.target.value }))}
              placeholder="Name"
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Empties configuration */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-slate-200 tracking-wide uppercase mb-2">Empties Configuration by Area</h3>
        <p className="text-sm text-slate-400 mb-4">
          Enable empties counting for areas where empties are handled at 25% effort. This affects productivity targets and actuals calculations.
        </p>
        {REGIONS.map((region) => (
          <div key={region} className="mb-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">{region}</div>
            <div className="flex flex-wrap gap-2">
              {REGION_AREAS[region].map((area) => (
                <button
                  key={area}
                  onClick={() => setEmptiesConfig((p) => ({ ...p, [area]: !p[area] }))}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    emptiesConfig[area]
                      ? "bg-teal-600/30 text-teal-300 border border-teal-500/40"
                      : "bg-slate-700/50 text-slate-500 border border-slate-600/40"
                  }`}
                >
                  {area} {emptiesConfig[area] ? "✓" : "—"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState("presets");
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [areaPresets, setAreaPresets] = useState({});
  const [areaLaneData, setAreaLaneData] = useState({});
  const [actuals, setActuals] = useState(DEFAULT_ACTUALS);
  const [areaActuals, setAreaActuals] = useState(DEFAULT_AREA_ACTUALS);
  const [tmsAreaActuals, setTmsAreaActuals] = useState(DEFAULT_TMS_AREA_ACTUALS);
  const [nonTmsAreaActuals, setNonTmsAreaActuals] = useState(DEFAULT_NONTMS_AREA_ACTUALS);
  // FRO/FFE constants
  const [emptiesShare, setEmptiesShare] = useState(DEFAULT_EMPTIES_SHARE);
  const [emptiesConfig, setEmptiesConfig] = useState(DEFAULT_EMPTIES_CONFIG);
  const [metadata, setMetadata] = useState({ lastUpdate: "October 2025", updatedBy: "" });

  // Load from storage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const stored = await storage.get("productivity-model-state");
        if (stored && stored.value) {
          const state = JSON.parse(stored.value);
          if (state.config) setConfig(state.config);
          if (state.areaPresets) setAreaPresets(state.areaPresets);
          if (state.areaLaneData) setAreaLaneData(state.areaLaneData);
          if (state.actuals) setActuals(state.actuals);
          if (state.areaActuals) setAreaActuals(state.areaActuals);
          if (state.tmsAreaActuals) setTmsAreaActuals(state.tmsAreaActuals);
          if (state.nonTmsAreaActuals) setNonTmsAreaActuals(state.nonTmsAreaActuals);
          // FRO/FFE constants
          if (state.emptiesShare) setEmptiesShare(state.emptiesShare);
          if (state.emptiesConfig) setEmptiesConfig(state.emptiesConfig);
          if (state.metadata) setMetadata(state.metadata);
        }
      } catch (e) {
        // First load, no stored data
      }
    };
    loadData();
  }, []);

  // Save to storage on changes
  useEffect(() => {
    const saveData = async () => {
      try {
        await storage.set(
          "productivity-model-state",
          JSON.stringify({ config, areaPresets, areaLaneData, actuals, areaActuals, tmsAreaActuals, nonTmsAreaActuals, emptiesConfig, emptiesShare, metadata })
        );
      } catch (e) {
        // Storage unavailable
      }
    };
    const timer = setTimeout(saveData, 500);
    return () => clearTimeout(timer);
  }, [config, areaPresets, areaLaneData, actuals, areaActuals, tmsAreaActuals, nonTmsAreaActuals, emptiesConfig, emptiesShare, metadata]);

  const tabs = [
    { id: "presets", label: "Area Presets" },
    { id: "targets", label: "Target Calculator" },
    { id: "actuals", label: "Actuals" },
    { id: "gaps", label: "Gap Analysis" },
    { id: "workforce", label: "Workforce Planning" },
    { id: "progress", label: "FTE Progress" },
    { id: "frofee", label: "FRO/FFE Ratios" },
    { id: "settings", label: "Settings" },
  ];

  const presetCount = Object.keys(areaPresets).length;
  const totalAreas = Object.values(REGION_AREAS).flat().length;
  const configuredAreas = new Set(Object.keys(areaPresets).map((k) => k.split("_")[0])).size;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200" style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div className="bg-slate-900/80 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                <h1 className="text-xl font-bold tracking-tight text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  Landside Ops Productivity Model
                </h1>
              </div>
              <p className="text-sm text-slate-500 ml-5">
                FFE/FTE Target Setting & Performance Tracking
              </p>
            </div>
            <div className="flex gap-4 text-xs text-slate-500">
              <div className="text-right">
                <span className="text-slate-400 font-semibold">{configuredAreas}</span>/{totalAreas} areas configured
              </div>
              <div className="text-right">
                <span className="text-slate-400 font-semibold">{presetCount}</span> lane presets
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-slate-900/40 border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-6">
          <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === "presets" && (
          <PresetBuilder
            areaPresets={areaPresets}
            setAreaPresets={setAreaPresets}
            areaLaneData={areaLaneData}
            setAreaLaneData={setAreaLaneData}
          />
        )}
        {activeTab === "targets" && (
          <TargetCalculator
            config={config}
            setConfig={setConfig}
            areaPresets={areaPresets}
            areaLaneData={areaLaneData}
            emptiesConfig={emptiesConfig}
          />
        )}
        {activeTab === "actuals" && (
          <ActualsTracker
            actuals={actuals}
            setActuals={setActuals}
            areaActuals={areaActuals}
            setAreaActuals={setAreaActuals}
            tmsAreaActuals={tmsAreaActuals}
            setTmsAreaActuals={setTmsAreaActuals}
            nonTmsAreaActuals={nonTmsAreaActuals}
            setNonTmsAreaActuals={setNonTmsAreaActuals}
            metadata={metadata}
          />
        )}
        {activeTab === "gaps" && (
          <GapAnalysis
            config={config}
            actuals={actuals}
            areaActuals={areaActuals}
            tmsAreaActuals={tmsAreaActuals}
            nonTmsAreaActuals={nonTmsAreaActuals}
            areaPresets={areaPresets}
            areaLaneData={areaLaneData}
            emptiesConfig={emptiesConfig}
            emptiesShare={emptiesShare}
          />
        )}
        {activeTab === "workforce" && (
          <WorkforcePlanning
            config={config}
            actuals={actuals}
            areaActuals={areaActuals}
            areaPresets={areaPresets}
            areaLaneData={areaLaneData}
            emptiesConfig={emptiesConfig}
            emptiesShare={emptiesShare}
          />
        )}
        {activeTab === "progress" && (
          <FTEProgressTracker
            areaActuals={areaActuals}
            emptiesConfig={emptiesConfig}
            config={config}
            areaPresets={areaPresets}
            areaLaneData={areaLaneData}
            emptiesShare={emptiesShare}
          />
        )}
        {activeTab === "frofee" && (
          <FroFfeManager />
        )}
        {activeTab === "settings" && (
          <SettingsPanel
            emptiesConfig={emptiesConfig}
            setEmptiesConfig={setEmptiesConfig}
            emptiesShare={emptiesShare}
            setEmptiesShare={setEmptiesShare}
            metadata={metadata}
            setMetadata={setMetadata}
          />
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-800/50 mt-8">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-slate-600">
          <span>Formula: Target Orders/FTE/Day = Available Minutes ÷ (Base Minutes × MODE × CONG × REG × DIG)</span>
          <span>Last update: {metadata.lastUpdate || "Not set"} | Data persists across sessions</span>
        </div>
      </div>
    </div>
  );
}
