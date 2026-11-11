# Imported: the native Android app

This directory is a Kotlin / Jetpack Compose rewrite of Spine Route, imported from a
separate private repository rather than merged commit-by-commit.

- Source: `jcltd303-hub/bookmoney`, branch `main`, tree `a71df0c00e8c6e7abbdd6c8c47f81a2c821bbeb1`
- Imported: 2026-11-10, as one commit
- Excluded: `.gradle/` (Gradle build cache, ~1.7 MB of `executionHistory.bin` and friends),
  `artifacts/`, `screenshots/`, `attachments/` — workspace output, not source

**Why not a real merge:** a merge commit needs both parents to exist in the same repository.
`bookmoney` is private and the GitHub App is not installed on it, so its commits cannot be
fetched here — a commit referencing them would be rejected. The import therefore records the
source tree above instead, which is traceable but does not join the histories. If you want
the histories joined, install the GitHub App on `bookmoney` and the two can be merged with
`git merge --allow-unrelated-histories` (expect conflicts on `README.md`, `package.json` and
`.gitignore`, all of which exist in both).

It sits under `native/` because it collides with the web app at the root — both have a
`package.json`, a `README.md` and a `.gitignore`, and this one has its own `app/` Gradle
module alongside the Capacitor `android/` at the top level.

**Building it.** The source repository never committed a Gradle wrapper, so `./gradlew` did not
exist here; one is now included, pinned to Gradle 8.10.2 because AGP 8.8.0 requires it (the
Capacitor project's 8.2.1 is too old):

```bash
cd native
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```

Needs **JDK 21** and the Android SDK (platform 35, build-tools as AGP requires).

JDK 21 specifically: the module targets `jvmTarget = "21"`, Gradle 8.10.2 cannot run on Java
24 or newer, and AGP 8.8.0 does not support them either. On Java 25 the build fails with

```
FAILURE: Build failed with an exception.
* What went wrong:
25.0.4.1
```

which is the JDK version string rather than anything in the source. Point Gradle at a 21:

```bash
# whichever you have: apt install openjdk-21-jdk, dnf install java-21-openjdk-devel,
# sdk install java 21.0.7-tem, or mise use java@21
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))
java -version    # must say 21
./gradlew assembleDebug
```

Or set `org.gradle.java.home=/path/to/jdk-21` in `gradle.properties` to keep it permanent.

Two things worth reading first, because they are the parts the web app does not have:

- `app/src/main/java/com/example/spineroute/domain/SpineAiAnalyzer.kt` — on-device spine
  analysis in Kotlin.
- `app/src/main/java/com/example/spineroute/ui/screens/CameraSpineScanScreen.kt` — the camera
  and scan UI in Compose (798 lines).

Everything else mirrors the web app: `BinPacker`, `QTrader`, `RoutePlanner`, `ShelfJudge`,
and the five screens.
