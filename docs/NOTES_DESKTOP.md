# MyGenie Notes — desktop app (Windows + macOS)

The desktop app is a thin Electron shell around the portal. It opens
`<env>/notes` (MyGenie Notes) and keeps the old Record Meeting page one tray
click away ("Open Record Meeting (old)").

What the shell adds over a browser tab:

- **No picker for call audio.** When the Notes page calls
  `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })`, the
  app answers it itself with **system-audio loopback** (everything the
  computer is playing, i.e. the other people on the call). The video track it
  hands back is just the page's own frame, which the recorder throws away; no
  screen is captured.
- Mic, camera, display capture and notifications are granted **only** to the
  active environment's origin (plus old hostnames that redirect to it, e.g.
  `data.mygenieprojects.com` → `os.buildzo.ai`). See `src/capture.js`.
- Floating "recording in progress" widget, tray / menu-bar icon, auto-update.

## What the page can use (`window.saathiDesktop`)

| Member | Meaning |
| --- | --- |
| `systemAudio` | `true` when getDisplayMedia is answered picker-free with loopback audio (Windows; macOS 14.2+). |
| `platform` | `"win32"` or `"darwin"`. |
| `reportRecordingStatus(status, elapsedMs)` | `"recording"` / `"paused"` / `"stopped"`; drives the floating widget. |
| `permissions()` | Promise of `{ platform, microphone, camera, screen, systemAudio }`; statuses are `granted` / `denied` / `restricted` / `not-determined` / `unknown`. |
| `requestMicrophoneAccess()` | macOS: shows the mic prompt if not decided yet. Promise of boolean. |
| `openPrivacySettings(kind)` | macOS: opens System Settings at `microphone`, `camera`, `screen` or `systemAudio`. Other values are refused. Promise of boolean. |

The onboarding calls only answer pages from the active environment's origin.

## Building

```bash
npm ci
npm start                 # run against the env picked in the tray (default prod)
npm run selftest          # proves picker-free loopback on this machine (see below)

npm run dist              # Windows NSIS installer (needs build/icon.ico)
npm run dist:mac          # macOS dmg + zip, arm64 + x64 (signed if a cert is available)
npm run dist:mac:unsigned # macOS .app only, unsigned, for local testing
```

The zip is required: electron-updater installs macOS updates from it, and
`latest-mac.yml` is generated next to it. `npm run publish:mac` uploads to
GitHub Releases like `npm run publish` does for Windows.

The tray icon for macOS is drawn by `npm run tray-icon`
(`scripts/make-tray-icon.js` → `src/assets/trayTemplate*.png`). There is no
macOS app icon yet (`build/icon.icns`), so the default Electron icon is used.

### Signing and notarising (env vars, names only)

Nothing is hard-coded. electron-builder reads these at build time:

- macOS signing: `CSC_LINK`, `CSC_KEY_PASSWORD` (a Developer ID Application
  .p12), or a cert in the login keychain with `CSC_NAME`.
- macOS notarising: either `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
  `APPLE_TEAM_ID`; or `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`.
- Windows signing: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (or `CSC_LINK` /
  `CSC_KEY_PASSWORD` when building on Windows).
- Publishing to GitHub Releases: `GH_TOKEN`.
- Unsigned local builds: `CSC_IDENTITY_AUTO_DISCOVERY=false` (already set by
  `dist:mac:unsigned`).

Hardened runtime is on. Entitlements are in `build/entitlements.mac.plist`
(JIT + unsigned executable memory for V8, `device.audio-input`,
`device.camera`). Usage strings are in `package.json` → `build.mac.extendInfo`
(`NSMicrophoneUsageDescription`, `NSAudioCaptureUsageDescription`,
`NSCameraUsageDescription`).

An unsigned or ad-hoc-signed build gets a new identity on every build, so
macOS asks for permissions again after each one. Only a signed, notarised
build keeps them across updates and opens without a Gatekeeper warning.

## What macOS users will see

1. **First launch:** an unsigned build is blocked by Gatekeeper (right-click →
   Open). A notarised build just opens.
2. **First recording, microphone:** "Saathi Recorder would like to access the
   microphone" with our text *"Notes records your microphone so it can write
   up your meetings."* → Allow. If they said no: System Settings → Privacy &
   Security → Microphone (`openPrivacySettings("microphone")`).
3. **First recording, call audio:** macOS asks to let the app record **system
   audio** with *"Notes records the call's audio so it can transcribe what
   others say."* → Allow. It is listed under Privacy & Security → Screen &
   System Audio Recording → "System Audio Recording Only"
   (`openPrivacySettings("systemAudio")`). Screen Recording itself should **not** be
   needed (the video track is the page's own frame, not the screen).
4. The menu-bar mic icon is the app; closing the window hides it there. Quit
   from the menu-bar menu or Cmd+Q.

## Known limits

- macOS call audio needs **macOS 14.2 or later** (Apple's CoreAudio Tap API,
  the default in Electron 39+). On macOS 13–14.1 `systemAudio` is `false` and
  the page must fall back to its own instructions. The app itself needs
  macOS 13+ (Electron 44 bundle sets LSMinimumSystemVersion 13.0).
- If system-audio permission is denied, macOS gives the page a **silent**
  audio track, not an error. `npm run selftest` reports this as `SILENT`.
  The page should watch the call-audio level and warn if it stays at zero.
- Loopback is everything the computer plays: notification sounds, music, and
  the Notes page's own audio, not just the call. On Windows it also includes
  any other app's audio.
- Chromium applies echo cancellation / noise suppression / auto gain to the
  loopback track unless the page asks for them off in the `audio` constraints
  of getDisplayMedia.
- The display handler serves the active environment only. Switching env in
  the tray relaunches the app.
- `npm run selftest` from a terminal runs under the terminal's permissions
  (macOS attributes capture to the app that launched Electron).

## Self-test

`npm run selftest` serves a local page, installs the same handlers as the app
(`src/capture.js`) for that page's origin, calls getDisplayMedia exactly like
the recorder, plays a quiet 1.5 s tone and measures the loopback level.
It prints one `SELFTEST {...}` JSON line and exits `0` (PASS: audio track
with signal), `1` (FAIL: no audio track / error) or `2` (SILENT: track but no
signal, usually missing permission).

## References

- Electron `desktopCapturer` docs (macOS caveats: 14.2+ needs
  `NSAudioCaptureUsageDescription`; CoreAudio Tap default since v39):
  https://www.electronjs.org/docs/latest/api/desktop-capturer
- Electron `session.setDisplayMediaRequestHandler`:
  https://www.electronjs.org/docs/latest/api/session
