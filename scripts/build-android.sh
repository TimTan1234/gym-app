#!/usr/bin/env bash
# Builds the GymPal Health Android app and puts it where Settings offers it for download
# (public/downloads/gympal-health.apk). Needs JDK 21 and the Android SDK; see android/README.md.
set -euo pipefail
cd "$(dirname "$0")/../android"
export JAVA_HOME="${GYMPAL_JDK:-$HOME/.local/toolchains/jdk-21}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
./gradlew --no-daemon -q testDebugUnitTest assembleDebug
mkdir -p ../public/downloads
cp app/build/outputs/apk/debug/app-debug.apk ../public/downloads/gympal-health.apk
echo "public/downloads/gympal-health.apk"
