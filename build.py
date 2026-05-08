import os
import sys
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

# ================================================================
# WorkoutTracker — Release Build Script
# ================================================================
# Usage: python build.py
# Run from the project root directory
# ================================================================

PROJECT_ROOT = Path(__file__).parent.resolve()
ANDROID_DIR = PROJECT_ROOT / "android"
BUILDS_DIR = PROJECT_ROOT / "builds"
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")


def get_apk_path(build_type: str) -> Path:
    return (
        ANDROID_DIR
        / "app"
        / "build"
        / "outputs"
        / "apk"
        / build_type
        / f"app-{build_type}.apk"
    )


def get_final_name(build_type: str) -> str:
    label = "Release" if build_type == "release" else "Debug"
    return f"WorkoutTracker_{label}_{TIMESTAMP}.apk"


def header():
    print()
    print("================================================")
    print("  WorkoutTracker — Build Script")
    print("================================================")
    print()


def step(number, total, message):
    print(f"[ {number}/{total} ] {message}")


def success_banner(apk_path: Path, build_type: str):
    size_bytes = apk_path.stat().st_size
    size_mb = size_bytes / (1024 * 1024)
    label = "Release" if build_type == "release" else "Debug"
    print()
    print("================================================")
    print(f"  Build successful ({label})")
    print(f"  File : builds/{apk_path.name}")
    print(f"  Size : {size_mb:.1f} MB")
    print("================================================")
    print()


def fail(message: str):
    print()
    print(f"ERROR: {message}")
    print()
    sys.exit(1)


def ask_yes_no(question: str, default_yes: bool = True) -> bool:
    hint = "[Y/n]" if default_yes else "[y/N]"
    while True:
        answer = input(f"{question} {hint}: ").strip().lower()
        if answer == "":
            return default_yes
        if answer in ("y", "yes"):
            return True
        if answer in ("n", "no"):
            return False
        print("        Please enter y or n.")


def ask_build_type() -> str:
    step(1, 5, "Choose build type")
    print()
    print("        Release — signed APK, no dev server, production ready")
    print("                  requires a keystore to be configured in")
    print("                  android/gradle.properties")
    print()
    print("        Debug   — unsigned APK, includes dev tools,")
    print("                  faster to build, good for device testing")
    print("                  without needing a keystore")
    print()

    while True:
        answer = input("        Build type [R/d]: ").strip().lower()
        if answer in ("", "r", "release"):
            print()
            print("        Selected: Release")
            print()
            return "release"
        if answer in ("d", "debug"):
            print()
            print("        Selected: Debug")
            print()
            return "debug"
        print("        Please enter r for release or d for debug.")


def check_android_dir():
    step(2, 5, "Checking project structure...")
    if not ANDROID_DIR.exists():
        fail(
            "android/ directory not found.\n"
            "       Make sure you are running this script from the project root."
        )
    gradlew = ANDROID_DIR / "gradlew.bat"
    if not gradlew.exists():
        fail(
            "gradlew.bat not found inside android/.\n"
            "       Your React Native project may not be set up correctly."
        )
    print("        Project structure OK.")
    print()


def check_keystore_configured(build_type: str):
    if build_type != "release":
        return

    gradle_props = ANDROID_DIR / "gradle.properties"

    issues = []

    if not gradle_props.exists():
        issues.append("android/gradle.properties not found")
    else:
        content = gradle_props.read_text()
        required_keys = [
            "MYAPP_RELEASE_STORE_FILE",
            "MYAPP_RELEASE_KEY_ALIAS",
            "MYAPP_RELEASE_STORE_PASSWORD",
            "MYAPP_RELEASE_KEY_PASSWORD",
        ]
        missing = [k for k in required_keys if k not in content]
        if missing:
            issues.append(
                "Missing keystore entries in android/gradle.properties:\n"
                + "\n".join(f"           - {k}" for k in missing)
            )

    if not issues:
        print("        Keystore config OK.")
        print()
        return

    print()
    print("        WARNING: Keystore issues detected:")
    for issue in issues:
        print(f"          - {issue}")
    print()
    print("        Gradle will likely fail without a valid keystore.")
    print("        You can skip this check and try anyway, or abort")
    print("        and run a debug build instead.")
    print()

    if not ask_yes_no("        Skip keystore check and build anyway?", default_yes=False):
        fail("Build cancelled. Configure your keystore or choose a debug build.")


def run_gradle(task: str, label: str):
    gradlew = ANDROID_DIR / "gradlew.bat"
    print(f"        Running: gradlew.bat {task}")
    print()

    result = subprocess.run(
        [str(gradlew), task],
        cwd=str(ANDROID_DIR),
        stdout=None,
        stderr=None,
    )

    if result.returncode != 0:
        fail(
            f"{label} failed with exit code {result.returncode}.\n"
            "       Check the Gradle output above for details."
        )

    print()
    print(f"        {label} complete.")
    print()


def maybe_clean():
    step(3, 5, "Clean previous build?")
    print("        Cleaning removes cached build files and ensures a")
    print("        fresh compile. Recommended if you have changed native")
    print("        code or installed new packages. Skipping is faster")
    print("        for JS-only changes.")
    print()

    if ask_yes_no("        Run gradlew clean before building?", default_yes=True):
        print()
        print("        Cleaning...")
        print()
        run_gradle("clean", "Clean")
    else:
        print()
        print("        Skipping clean.")
        print()


def build_apk(build_type: str):
    label = "Release" if build_type == "release" else "Debug"
    task = "assembleRelease" if build_type == "release" else "assembleDebug"
    step(4, 5, f"Building {label} APK...")
    print("        This may take several minutes on the first run.")
    print()
    run_gradle(task, f"{label} build")


def verify_and_copy(build_type: str) -> Path:
    step(5, 5, "Verifying and copying APK...")

    output_apk = get_apk_path(build_type)
    if not output_apk.exists():
        fail(
            f"APK not found at expected path:\n"
            f"       {output_apk}\n"
            f"       The build may have failed silently. Check Gradle output."
        )

    BUILDS_DIR.mkdir(exist_ok=True)
    final_name = get_final_name(build_type)
    destination = BUILDS_DIR / final_name
    shutil.copy2(str(output_apk), str(destination))
    print(f"        Saved as: builds/{final_name}")
    return destination


def main():
    header()

    # Step 1 — choose build type
    build_type = ask_build_type()

    # Step 2 — sanity check
    check_android_dir()

    # Extra check for release — keystore must be configured
    check_keystore_configured(build_type)

    # Step 3 — ask about clean
    maybe_clean()

    # Step 4 — build
    build_apk(build_type)

    # Step 5 — verify and copy
    final_apk = verify_and_copy(build_type)

    # Done
    success_banner(final_apk, build_type)


if __name__ == "__main__":
    main()