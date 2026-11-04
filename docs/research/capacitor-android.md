# Capacitor Android feasibility

Checked 2026-11-03 in `D:/Ale Code/API 2 - Copy`, branch `feature/api-57-recuperacion`, HEAD `a23f5a5`. Research only; Capacitor and Android tooling were not installed.

## Recommendation

Yes: this project is a good candidate for an Android APK using Capacitor. Keep the current JavaScript/HTML/CSS frontend and FastAPI backend. Capacitor supplies the Android native container and JavaScript-to-native bridge; Android Studio manages, runs, and packages the Android project. The screen UI remains rendered in a WebView. Ionic UI components are optional; a React/Vue/Kotlin UI rewrite is unnecessary. This assessment is an inference from the existing frontend and Capacitor's [existing-app requirements](https://capacitorjs.com/docs/getting-started), [Android runtime](https://capacitorjs.com/docs/android), and [plugin architecture](https://capacitorjs.com/docs/basics/using-plugins).

## Project fit and remaining work

- `frontend/package.json` uses Vite 8.3 with vanilla JavaScript. `vite.config.js` builds several HTML entries; the default output is `dist`. Set Capacitor `webDir` to `dist` within `frontend`. An `index.html` with a head element exists. These satisfy the structural [installation requirements](https://capacitorjs.com/docs/getting-started).
- The parent agent ran `npm.cmd run build`: PASS, 80 modules, with `dist/index.html` and all configured nested HTML pages emitted. This proves web compilation, not Android runtime behavior. Check every page transition, root-relative asset, and login redirect in the packaged app.
- `frontend/src/api.js` and `src/pages/login/recuperar.js` default to `http://localhost:8000`. A phone's localhost refers to that phone. Build with a reachable HTTPS `VITE_API_URL`; Vite's development proxy does not ship inside the APK. Keep business requests routed through FastAPI as required by ADR 0002; HTTPS cloud access follows ADR 0005.
- `backend/app/main.py` currently permits only `http://localhost:5173` and `http://127.0.0.1:5173` in CORS. With normal WebView fetch, add the exact packaged Android origin, normally `https://localhost`, and verify preflight/Authorization headers. That default origin follows Capacitor's hostname and Android scheme [configuration](https://capacitorjs.com/docs/config).
- The current frontend attaches bearer tokens rather than relying on API session cookies. Test sign-in, persistent sessions across process restarts, refresh, logout, and expiry in the WebView. No cookie redesign is indicated by the inspected code. If cookies are introduced, explicitly test their domain/SameSite/secure behavior and native/web cookie stores. Capacitor's optional native HTTP fetch patch is disabled by default; do not enable it without testing auth and request behavior. See [HTTP API](https://capacitorjs.com/docs/apis/http).
- Password recovery currently redirects to a web URL: the backend default is `http://localhost:5173/src/pages/login/nueva-contrasena.html`. For a first APK, use a real hosted HTTPS recovery page and test it from the email app. Returning directly into the installed app is additional work: configure a validated app link/custom scheme, server-controlled redirect, auth redirect allowlist, and an app handler that consumes recovery credentials safely. Capacitor provides [app URL events and Android intent-filter integration](https://capacitorjs.com/docs/apis/app); wrapping the site alone does not implement this flow.
- Existing media queries and mobile report screenshots are a useful start, but some tables retain large minimum widths (reports: 960px). Check horizontal scrolling, forms, keyboard overlap, touch targets, modal dialogs, rotation, and Android back behavior. Test system-bar/safe-area insets: Capacitor 8 changed edge-to-edge handling, as documented in its [upgrade guide](https://capacitorjs.com/docs/updating/8-0).
- Reports currently export CSV using an HTML download link. Verify WebView behavior on a physical phone; if saving/sharing needs native handling, add filesystem/share integration. The [Share plugin](https://capacitorjs.com/docs/apis/share) can share content and files with Android apps. Camera/push/filesystem features can be added selectively through [plugins](https://capacitorjs.com/docs/basics/using-plugins). A wrapper does not automatically provide offline ticket operations or background synchronization.

## Android toolchain

Official stable documentation currently describes Capacitor 8 (including an [8.5 guide](https://capacitorjs.com/docs/updating/8-5)); avoid accidentally following the separate `next` documentation.

Use Node 22+, Android Studio 2025.2.1 or newer, and Android SDK packages. Android Studio includes a JDK. See [environment setup](https://capacitorjs.com/docs/getting-started/environment-setup). Capacitor 8's documented Android defaults are minSdk 24 (Android 7), compile/target SDK 36, Android Gradle Plugin 8.13.0, and Gradle wrapper 8.14.3; keep the generated project's compatible versions together. See [8.0 upgrade requirements](https://capacitorjs.com/docs/updating/8-0). Its [official Android library source](https://raw.githubusercontent.com/ionic-team/capacitor/8.0.0/android/capacitor/build.gradle) targets Java 21. Install SDK Platform 36, platform-tools, build tools requested by Gradle, and an emulator image or use a USB-connected phone.

Local checks reported by the parent agent: Node 22.20 and npm 10.9.3 are present. Android Studio/SDK were not found in standard install locations, PATH, or Studio uninstall registration; a custom installation is still possible. Java on PATH is Temurin 25.0.2 while JAVA_HOME points to BellSoft JDK 21. Align the Gradle JVM and shell JAVA_HOME with the chosen compatible JDK before building; the project has not yet passed an Android build.

## First implementation sequence

These commands describe proposed work, not actions performed:

```powershell
# From D:/Ale Code/API 2 - Copy/frontend
npm install @capacitor/core@8 @capacitor/android@8
npm install --save-dev @capacitor/cli@8
npx cap init
# Choose app name/application ID; set webDir to dist.
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Keep selected package versions compatible and locked. After each web change, rebuild then sync before running Android. Configure the reachable API and CORS first; then verify login, tickets, reports/CSV and password recovery on emulator and physical device. Choose an application ID before distributing builds.

## APK delivery

For initial testing, run `./gradlew.bat assembleDebug` inside `frontend/android`. The expected artifact is `app/build/outputs/apk/debug/app-debug.apk`; it is signed with a debug key and can be installed for testing. See Android's [command-line build guide](https://developer.android.com/build/building-cmdline).

For release, create a signed release APK for direct distribution, or a signed Android App Bundle for Play submission. Preserve the release/upload signing material for future updates. Android Studio's Generate Signed App Bundle or APK wizard handles this. The Run button's test-only APK is different from a distributable build. See [Android release builds](https://developer.android.com/build/build-for-release). No APK has been produced in this research task.
