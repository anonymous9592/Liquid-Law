# Case Canvas for Android (tablets)

A Capacitor shell around the same renderer as the web and Windows builds (`../prototype`). Android 15 (API 35)
and up, tablets only (`requiresSmallestWidthDp="600"`).

| | |
|---|---|
| App id | `com.stuthilabs.casecanvas` |
| Renderer | `../prototype` (copied into `android/app/src/main/assets/public` by `cap sync`) |
| Native bridge | `prototype/android.js` builds `window.desktop` on the `CaseFiles` plugin (`android/app/src/main/java/com/stuthilabs/casecanvas/CaseFilesPlugin.java`) |
| Files | Storage Access Framework: the system picker for opening PDFs / cases, the system "create document" dialog for saving; no storage permission. A `.lawcase` opened from Files or Drive launches the app (VIEW intent) |
| Icons / splash | `python ../tools/make_android_icons.py` (same starburst as the desktop icon) |

## Build

Needs Android Studio (for its SDK and bundled JDK) and Node.

```bash
cd mobile
npm install
npx cap sync android
cd android
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
gradlew assembleDebug            # android/app/build/outputs/apk/debug/app-debug.apk
gradlew assembleRelease          # android/app/build/outputs/apk/release/app-release.apk (signed, see below)
```

`android/local.properties` points at the SDK (`sdk.dir=…\Android\Sdk`). `android/gradle.properties` sets
`org.gradle.java.home` to Android Studio's JBR, so `JAVA_HOME` is only needed for the wrapper script itself.

**Signing.** `android/keystore.properties` + `android/casecanvas-release.jks` (both git-ignored) sign the release
APK for sideloading and internal testing. That key was generated locally and is **not** a Play Store upload key:
create the firm's own keystore before publishing and point `keystore.properties` at it. Without the properties file
the release build is unsigned.

Version: `versionName` / `versionCode` in `android/app/build.gradle`, kept in step with `package.json` and
`APP_VERSION` in `prototype/index.html` (0.6.0 = versionCode 60).

## Run on the emulator

```bash
emulator -avd Medium_Tablet          # Pixel Tablet image, API 35, 2560×1600
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.stuthilabs.casecanvas/.MainActivity
```

The debug build has WebView debugging on: `adb forward tcp:9335 localabstract:webview_devtools_remote_<pid>` and
open `http://127.0.0.1:9335/json` (or chrome://inspect) to drive the renderer; `window.caseApp` has the test hooks.

## What is different from the desktop build

- No native menu: everything is in the **Case ▾** menu.
- The Google Cloud key is kept in the WebView's localStorage (the app's private sandbox), not in an OS key store.
- Bytes never ride on a plugin call that opens a system dialog (Android parcels that call into the saved activity
  state and kills the app past ~1 MB): picked documents are staged in the app cache and fetched through Capacitor's
  local server; saves stream through a temp file in 1 MB chunks and are committed into the chosen document.
- `backgroundThrottling` has no equivalent; a long OCR continues while the app is in the foreground.
