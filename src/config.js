// config.js — persisted env (prod|dev) selection, stored as a plain JSON
// file under app.getPath('userData'). Lets us flip environments (for our
// own testing against dev.buildzo.ai) without a rebuild. Hand-rolled
// instead of a library (electron-store v10 is ESM-only and doesn't load
// from this CommonJS main process) — the actual need is one string.
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const ENV_URLS = {
  prod: "https://data.mygenieprojects.com",
  dev: "https://dev.buildzo.ai",
};

const RECORD_MEETING_PATH = "/saathi/record-meeting";

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

function getEnv() {
  return readConfig().env === "dev" ? "dev" : "prod";
}

function setEnv(env) {
  writeConfig({ ...readConfig(), env: env === "dev" ? "dev" : "prod" });
}

function getBaseUrl() {
  return ENV_URLS[getEnv()];
}

function getRecordMeetingUrl() {
  return `${getBaseUrl()}${RECORD_MEETING_PATH}?kiosk=1`;
}

module.exports = { getEnv, setEnv, getBaseUrl, getRecordMeetingUrl, RECORD_MEETING_PATH };
