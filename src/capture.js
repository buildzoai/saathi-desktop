// capture.js — media permissions and picker-free call-audio capture for the
// app's session.
//
// The Notes recorder in portal-ui records two tracks: the mic (getUserMedia)
// and the CALL AUDIO (getDisplayMedia({ video: true, audio: true }), keeping
// only the audio track). In a browser getDisplayMedia shows a picker; here we
// answer it ourselves with system-audio loopback, so there is no picker.
//
// Everything is restricted to the configured portal origin — a page from any
// other origin gets neither the mic, the camera nor display capture.
const { desktopCapturer, systemPreferences, shell } = require("electron");
const { getAllowedOrigins } = require("./config");

// Loopback system audio: Windows has had it for years; macOS gets it from
// Electron 39 onwards via Apple's CoreAudio Tap API (macOS 14.2+), which
// needs NSAudioCaptureUsageDescription in Info.plist (see package.json).
// Linux is not a target for this app.
function supportsSystemAudio() {
  if (process.platform === "win32") return true;
  if (process.platform === "darwin") {
    const [major, minor] = (process.getSystemVersion() || "0.0").split(".").map(Number);
    return major > 14 || (major === 14 && minor >= 2);
  }
  return false;
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isOwnOrigin(urlOrOrigin) {
  const origin = originOf(urlOrOrigin);
  return !!origin && getAllowedOrigins().includes(origin);
}

// "media" = getUserMedia (mic for recording, camera for the record-meeting
// photo capture), "display-capture" = getDisplayMedia, "notifications" =
// the pre-meeting desktop notification.
const ALLOWED_PERMISSIONS = new Set(["media", "display-capture", "notifications"]);

// `isAllowed(urlOrOrigin)` defaults to "is the configured portal origin";
// the self-test passes its own local test origin instead.
function installCaptureHandlers(ses, isAllowed = isOwnOrigin) {
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const url = (details && details.requestingUrl) || (webContents && webContents.getURL());
    callback(ALLOWED_PERMISSIONS.has(permission) && isAllowed(url));
  });

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return ALLOWED_PERMISSIONS.has(permission) && isAllowed(requestingOrigin);
  });

  ses.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        const origin = request.securityOrigin || (request.frame && request.frame.origin);
        if (!isAllowed(origin)) return callback(null);

        const streams = {};
        if (request.videoRequested) {
          // The page throws the video away, so give it the cheapest, least
          // revealing video we can: the requesting page's own frame. That
          // also avoids needing macOS Screen Recording permission. Fall back
          // to the primary screen if the frame is gone.
          if (request.frame) {
            streams.video = request.frame;
          } else {
            const sources = await desktopCapturer.getSources({ types: ["screen"] });
            if (!sources.length) return callback(null);
            streams.video = sources[0];
          }
        }
        if (request.audioRequested && supportsSystemAudio()) {
          streams.audio = "loopback";
        }
        if (!streams.video && !streams.audio) return callback(null);
        callback(streams);
      } catch (err) {
        console.error("[capture] display media request failed:", err);
        try {
          callback(null);
        } catch {
          /* frame already destroyed */
        }
      }
    },
    { useSystemPicker: false }
  );
}

// ---- macOS onboarding helpers (exposed via preload as saathiDesktop.*) ----

// systemPreferences.getMediaAccessStatus only exists on macOS/Windows; on
// Windows these are always effectively granted at OS level for desktop apps
// unless the user turned the global mic toggle off.
function getPermissionStatuses() {
  const read = (kind) => {
    try {
      return systemPreferences.getMediaAccessStatus(kind);
    } catch {
      return "unknown";
    }
  };
  return {
    platform: process.platform,
    microphone: read("microphone"),
    camera: read("camera"),
    // On macOS this is the "Screen & System Audio Recording" switch. Our
    // call-audio path does NOT need it (see above); it is reported so the
    // page can explain the system-audio prompt, which macOS files under the
    // same Settings pane ("System Audio Recording Only").
    screen: read("screen"),
    systemAudio: supportsSystemAudio(),
  };
}

async function requestMicrophoneAccess() {
  if (process.platform !== "darwin") return true;
  try {
    return await systemPreferences.askForMediaAccess("microphone");
  } catch {
    return false;
  }
}

const PRIVACY_PANES = {
  microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
  camera: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
  screen: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  // System audio is listed on the same pane in macOS 14.4+.
  systemAudio: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
};

async function openPrivacySettings(kind) {
  if (process.platform !== "darwin") return false;
  if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(PRIVACY_PANES, kind)) return false;
  await shell.openExternal(PRIVACY_PANES[kind]);
  return true;
}

module.exports = {
  installCaptureHandlers,
  supportsSystemAudio,
  getPermissionStatuses,
  requestMicrophoneAccess,
  openPrivacySettings,
  isOwnOrigin,
};
