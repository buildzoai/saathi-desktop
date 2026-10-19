// config.js — persisted env (prod|dev) selection, stored as a plain JSON
// file under app.getPath('userData'). Lets us flip environments (for our
// own testing against dev.buildzo.ai) without a rebuild. Hand-rolled
// instead of a library (electron-store v10 is ESM-only and doesn't load
// from this CommonJS main process) — the actual need is one string.
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

// The dev box hosts SIX independent slots (dev, dev1..dev5), each a separate
// checkout + backend + database, so "the dev server" is never one thing —
// whichever slot your branch is deployed to is the one you need to point at.
// Listing them all beats editing this file every time a branch moves slots.
const ENV_URLS = {
  // data.mygenieprojects.com now 301-redirects here (checked 19 Oct 2026).
  prod: "https://os.buildzo.ai",
  dev: "https://dev.buildzo.ai",
  dev1: "https://dev1.buildzo.ai",
  dev2: "https://dev2.buildzo.ai",
  dev3: "https://dev3.buildzo.ai",
  dev4: "https://dev4.buildzo.ai",
  dev5: "https://dev5.buildzo.ai",
  local: "http://localhost:8080",
};

// Other origins that serve the same environment (old hostnames that redirect
// to the canonical one). Treated as "our own" for navigation and permissions.
const ENV_ALIASES = {
  prod: ["https://data.mygenieprojects.com"],
};

const ENV_LABELS = {
  prod: "Production",
  dev: "Development (dev)",
  dev1: "Development (dev1)",
  dev2: "Development (dev2)",
  dev3: "Development (dev3)",
  dev4: "Development (dev4)",
  dev5: "Development (dev5)",
  local: "Local (localhost:8080)",
};

const RECORD_MEETING_PATH = "/saathi/record-meeting";
// Default start page: the MyGenie Notes list (portal-ui route /notes).
const NOTES_PATH = "/notes";

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(data) {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(data));
  } catch (err) {
    console.error("[config] failed to persist config:", err);
  }
}

// Validated against ENV_URLS rather than a hand-listed set, so adding a slot
// above is the only edit needed. Anything unrecognised (including a config
// written by an older build that knew fewer names) falls back to prod.
function getEnv() {
  const env = readConfig().env;
  return Object.prototype.hasOwnProperty.call(ENV_URLS, env) ? env : "prod";
}

function setEnv(env) {
  const normalized = Object.prototype.hasOwnProperty.call(ENV_URLS, env) ? env : "prod";
  writeConfig({ ...readConfig(), env: normalized });
}

function getBaseUrl() {
  return ENV_URLS[getEnv()];
}

// Every origin the active environment's pages may load from. Used by the
// navigation lock-down (windowManager.js) and by capture.js, so mic, camera,
// display capture and the onboarding IPC are granted to these origins only.
function getAllowedOrigins() {
  const env = getEnv();
  return [ENV_URLS[env], ...(ENV_ALIASES[env] || [])].map((u) => new URL(u).origin);
}

function getRecordMeetingUrl() {
  return `${getBaseUrl()}${RECORD_MEETING_PATH}?kiosk=1`;
}

function getNotesUrl() {
  return `${getBaseUrl()}${NOTES_PATH}`;
}

// Last user-dragged position of the floating "recording in progress" widget
// — null until the user has actually moved it once, so a fresh install falls
// back to windowManager.js's own default corner placement.
function getWidgetPosition() {
  const pos = readConfig().widgetPosition;
  if (pos && typeof pos.x === "number" && typeof pos.y === "number") return pos;
  return null;
}

function setWidgetPosition(pos) {
  writeConfig({ ...readConfig(), widgetPosition: { x: pos.x, y: pos.y } });
}

module.exports = {
  getEnv,
  setEnv,
  getBaseUrl,
  getAllowedOrigins,
  getRecordMeetingUrl,
  getNotesUrl,
  RECORD_MEETING_PATH,
  NOTES_PATH,
  getWidgetPosition,
  setWidgetPosition,
  ENV_URLS,
  ENV_LABELS,
};
