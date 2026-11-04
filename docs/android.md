# Android development

The Capacitor Android project is in `frontend/android`. It packages the Vite
frontend; FastAPI still runs separately. Initial app ID is
`com.ticketdashboard.app`, display name `Tickets Laboratorios`. Review the ID
before distributing the first release. Launcher artwork is still the template.

## Setup

Install Node 22+, Android Studio 2025.2.1+ and Android SDK Platform 36 with
platform/build tools. Use a compatible Java 21 Gradle JVM and align `JAVA_HOME`
for command-line builds. Select an emulator or enable USB debugging on a phone.
Set the SDK location through Android Studio (local.properties is ignored).

From `frontend`, run `npm ci`. Copy `.env.android.example` to
`.env.android.local` and replace the example API URL with the reachable HTTPS
FastAPI endpoint. Existing `.env` frontend auth settings are loaded too. Vite
embeds these values in the app: only public client configuration belongs there.
No deployed API was provisioned as part of this starter.

The backend allows `https://localhost`, the packaged Android origin, plus the
existing Vite development origins. Override `CORS_ORIGINS` with a JSON array to
include any deployed web origin. Restart/redeploy the backend after changing it.
Do not substitute a wildcard for the origin allowlist.

## Build and run

### Local backend development

For the standard Android emulator, `npm run android:run:dev` builds/syncs and
runs against `http://10.0.2.2:8000` (the emulator's alias for your PC). Start
FastAPI on your PC at port 8000 first. `npm run android:sync:dev` only builds and
copies assets. HTTP and mixed-content access are enabled only in debug builds.
The Capacitor origin remains `https://localhost`, matching backend CORS.

For a USB phone, run `adb reverse tcp:8000 tcp:8000`, put
`VITE_ANDROID_API_URL=http://localhost:8000` in `frontend/.env.android-dev.local`, and
use `android:run:dev`. Remove/repeat forwarding when reconnecting the device.
The frontend still needs its existing public auth configuration in `.env`.
These modes connect to the running API; they do not start it or its database.

### Hosted backend / production configuration

```powershell
cd frontend
npm run android:sync
npm run android:open
# Or build, sync, and deploy to a connected device/emulator:
npm run android:run
```

`android:sync` builds in Android mode before copying assets. It refuses HTTP or
loopback API URLs. Regular `npm run build` and `npm run dev` retain web behavior.
Use the Android script after web changes; a Gradle build alone does not refresh
the bundled frontend. The current local assets were built with `android:sync:dev`.
Run the appropriate sync command again before each native build.

After syncing, build a testing APK:

```powershell
cd android
./gradlew.bat assembleDebug
```

Output: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.
Release signing and Play distribution are separate steps; signing keys are ignored.

## Device acceptance checks still required

- Login, token refresh, process restart, logout, and role-based screens.
- Create, assign, and resolve a ticket against the real API.
- Back button, page navigation, keyboard, dialogs, rotation, and system insets.
- Wide tables and CSV download/share behavior on a physical device.
- Password recovery from an email app. Configure a hosted HTTPS recovery page
  with the backend's `PASSWORD_RECOVERY_REDIRECT_URL`; native app links are not
  implemented by this starter. The current localhost recovery default will not
  work on a phone.

## References

Implementation verification: ordinary web build and Android development
build/sync passed. The emulator URL was confirmed in both API and recovery
bundles. CORS and password recovery tests passed (25 tests). Production URL
validation rejects missing, HTTP and loopback endpoints. Gradle 8.14.3 launched
and configured the Android project but `assembleDebug` stopped with
`SDK location not found`. No APK or emulator/device runtime verification yet.
The existing Vite 8.3.0 dependency also reports one high-severity npm audit
finding; dependency remediation was not included in this starter.

- [Capacitor installation](https://capacitorjs.com/docs/getting-started)
- [Android setup](https://capacitorjs.com/docs/android)
- [Capacitor configuration](https://capacitorjs.com/docs/config)
- [Android command-line builds](https://developer.android.com/build/building-cmdline)
