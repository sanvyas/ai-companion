# Flint for Android

A thin Android app (a Trusted Web Activity) that opens the Flint site full screen in Chrome's own engine. Everything you see
is the same web app, so a deploy updates it with no new APK. It is a real browser underneath, which is why Google sign-in
works (Google refuses to sign people in inside embedded web views).

## Build

Needs JDK 17+, Gradle 8.7+ and the Android SDK (platform 34, build-tools 34.0.0).

```bash
cd apps/android
export ANDROID_HOME=~/android-sdk
gradle assembleRelease \
  -PflintKeystore=/path/to/flint-test.jks -PflintStorePass=... \
  [-PflintHost=your.server.example] [-PflintStartPath='/?ui=3']
# apps/android/app/build/outputs/apk/release/app-release.apk
```

The signing key stays out of the repository. Its SHA-256 fingerprint is published by the server at
`/.well-known/assetlinks.json` (`ANDROID_PACKAGE`, `ANDROID_CERT_SHA256`); that is what lets the app open with no browser bar.
An APK signed with a different key opens with a thin address bar until the fingerprint is added there.
