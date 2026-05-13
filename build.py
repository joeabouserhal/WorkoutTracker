import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

# ================================================================
# WorkoutTracker - Android build script
# ================================================================
# Usage:
#   python build.py
#   python build.py --build-type release --target split-arm-apk --clean no
#
# Release targets avoid x86/x86_64 by default because those ABIs make direct
# APKs much larger and are mostly useful for emulators/ChromeOS distribution.
# ================================================================

PROJECT_ROOT = Path(__file__).parent.resolve()
ANDROID_DIR = PROJECT_ROOT / "android"
BUILDS_DIR = PROJECT_ROOT / "builds"
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")

ARM64_ABI = ("arm64-v8a",)
ARM_ABIS = ("arm64-v8a", "armeabi-v7a")
ALL_ABIS = ("armeabi-v7a", "arm64-v8a", "x86", "x86_64")


@dataclass(frozen=True)
class BuildTarget:
    key: str
    label: str
    description: str
    artifact_type: str
    abis: tuple[str, ...]
    split_by_abi: bool = False


RELEASE_TARGETS = {
    "split-arm-apk": BuildTarget(
        key="split-arm-apk",
        label="Split ARM APKs",
        description="separate arm64-v8a and armeabi-v7a APKs; smallest direct-install files",
        artifact_type="apk",
        abis=ARM_ABIS,
        split_by_abi=True,
    ),
    "arm64-apk": BuildTarget(
        key="arm64-apk",
        label="ARM64 APK",
        description="single smallest APK for modern 64-bit Android phones",
        artifact_type="apk",
        abis=ARM64_ABI,
    ),
    "arm-apk": BuildTarget(
        key="arm-apk",
        label="ARM-only APK",
        description="one APK for arm64-v8a and armeabi-v7a; no x86/x86_64",
        artifact_type="apk",
        abis=ARM_ABIS,
    ),
    "play-aab": BuildTarget(
        key="play-aab",
        label="Android App Bundle",
        description="best for Google Play; Play serves optimized APKs per device",
        artifact_type="aab",
        abis=ARM_ABIS,
    ),
    "universal-apk": BuildTarget(
        key="universal-apk",
        label="Universal APK",
        description="legacy compatibility build with ARM and x86 ABIs",
        artifact_type="apk",
        abis=ALL_ABIS,
    ),
}

DEBUG_TARGET = BuildTarget(
    key="debug-apk",
    label="Debug APK",
    description="debug build with all ABIs for device and emulator testing",
    artifact_type="apk",
    abis=ALL_ABIS,
)


def parse_args():
    parser = argparse.ArgumentParser(description="Build WorkoutTracker Android artifacts.")
    parser.add_argument("--build-type", choices=("release", "debug"), help="Build variant.")
    parser.add_argument(
        "--target",
        choices=tuple(RELEASE_TARGETS.keys()),
        help="Release output target. Defaults to split-arm-apk in prompts.",
    )
    parser.add_argument("--clean", choices=("yes", "no"), help="Run Gradle clean before building.")
    parser.add_argument(
        "--skip-keystore-check",
        action="store_true",
        help="Do not stop on missing release keystore properties.",
    )
    return parser.parse_args()


def header():
    print()
    print("================================================")
    print("  WorkoutTracker - Build Script")
    print("================================================")
    print()


def step(number: int, total: int, message: str):
    print(f"[ {number}/{total} ] {message}")


def format_size(path: Path) -> str:
    return f"{path.stat().st_size / (1024 * 1024):.1f} MB"


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


def ask_build_type(cli_value: str | None) -> str:
    step(1, 6, "Choose build type")
    if cli_value:
        print(f"        Selected from CLI: {cli_value.title()}")
        print()
        return cli_value

    print()
    print("        Release - signed APK/AAB, no dev server, production ready")
    print("        Debug   - unsigned APK with dev tools, good for testing")
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


def ask_release_target(build_type: str, cli_value: str | None) -> BuildTarget:
    step(2, 6, "Choose output target")
    if build_type == "debug":
        print(f"        Selected: {DEBUG_TARGET.label}")
        print(f"        ABIs: {', '.join(DEBUG_TARGET.abis)}")
        print()
        return DEBUG_TARGET

    if cli_value:
        target = RELEASE_TARGETS[cli_value]
        print(f"        Selected from CLI: {target.label}")
        print(f"        ABIs: {', '.join(target.abis)}")
        print()
        return target

    ordered_targets = [
        RELEASE_TARGETS["split-arm-apk"],
        RELEASE_TARGETS["arm64-apk"],
        RELEASE_TARGETS["arm-apk"],
        RELEASE_TARGETS["play-aab"],
        RELEASE_TARGETS["universal-apk"],
    ]

    print()
    for index, target in enumerate(ordered_targets, start=1):
        recommended = " (recommended)" if target.key == "split-arm-apk" else ""
        print(f"        {index}. {target.label}{recommended}")
        print(f"           {target.description}")
        print(f"           ABIs: {', '.join(target.abis)}")
        print()

    while True:
        answer = input("        Output target [1]: ").strip().lower()
        if answer == "":
            answer = "1"
        if answer.isdigit():
            index = int(answer)
            if 1 <= index <= len(ordered_targets):
                target = ordered_targets[index - 1]
                print()
                print(f"        Selected: {target.label}")
                print()
                return target
        for target in ordered_targets:
            if answer == target.key:
                print()
                print(f"        Selected: {target.label}")
                print()
                return target
        print("        Pick a number from the list or enter the target key.")


def check_android_dir():
    step(3, 6, "Checking project structure...")
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


def check_keystore_configured(build_type: str, skip_check: bool):
    if build_type != "release" or skip_check:
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
        missing = [key for key in required_keys if key not in content]
        if missing:
            issues.append(
                "Missing keystore entries in android/gradle.properties:\n"
                + "\n".join(f"           - {key}" for key in missing)
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
    print("        Gradle may fail without a valid keystore.")
    print("        You can skip this check and try anyway, or abort.")
    print()

    if not ask_yes_no("        Skip keystore check and build anyway?", default_yes=False):
        fail("Build cancelled. Configure your keystore or choose a debug build.")


def gradle_property_args(target: BuildTarget) -> list[str]:
    return [
        f"-PreactNativeArchitectures={','.join(target.abis)}",
        f"-PenableSeparateBuildPerCPUArchitecture={str(target.split_by_abi).lower()}",
    ]


def gradle_task(build_type: str, target: BuildTarget) -> str:
    variant = "Release" if build_type == "release" else "Debug"
    if target.artifact_type == "aab":
        return f":app:bundle{variant}"
    return f":app:assemble{variant}"


def run_gradle(task: str, label: str, extra_args: list[str] | None = None):
    gradlew = ANDROID_DIR / "gradlew.bat"
    command = [str(gradlew), task, *(extra_args or [])]
    display_command = " ".join(["gradlew.bat", task, *(extra_args or [])])
    print(f"        Running: {display_command}")
    print()

    result = subprocess.run(
        command,
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


def maybe_clean(cli_value: str | None):
    step(4, 6, "Clean previous build?")

    if cli_value:
        should_clean = cli_value == "yes"
        print(f"        Selected from CLI: {'clean' if should_clean else 'skip clean'}")
        print()
    else:
        print("        Cleaning removes cached build files and ensures a fresh compile.")
        print("        Skipping is faster for JS-only changes.")
        print()
        should_clean = ask_yes_no("        Run gradlew clean before building?", default_yes=True)
        print()

    if should_clean:
        print("        Cleaning...")
        print()
        run_gradle("clean", "Clean")
    else:
        print("        Skipping clean.")
        print()


def build_artifacts(build_type: str, target: BuildTarget):
    label = "Release" if build_type == "release" else "Debug"
    step(5, 6, f"Building {label}: {target.label}...")
    print(f"        ABIs: {', '.join(target.abis)}")
    print("        This may take several minutes on the first run.")
    print()
    run_gradle(
        gradle_task(build_type, target),
        f"{label} build",
        gradle_property_args(target),
    )


def apk_output_dir(build_type: str) -> Path:
    return ANDROID_DIR / "app" / "build" / "outputs" / "apk" / build_type


def bundle_output_path(build_type: str) -> Path:
    return (
        ANDROID_DIR
        / "app"
        / "build"
        / "outputs"
        / "bundle"
        / build_type
        / f"app-{build_type}.aab"
    )


def read_apk_outputs(build_type: str) -> list[Path]:
    output_dir = apk_output_dir(build_type)
    metadata_path = output_dir / "output-metadata.json"
    if metadata_path.exists():
        data = json.loads(metadata_path.read_text())
        outputs = [
            output_dir / element["outputFile"]
            for element in data.get("elements", [])
            if str(element.get("outputFile", "")).endswith(".apk")
        ]
        existing_outputs = [path for path in outputs if path.exists()]
        if existing_outputs:
            return existing_outputs

    return sorted(output_dir.glob("*.apk"))


def find_artifacts(build_type: str, target: BuildTarget) -> list[Path]:
    if target.artifact_type == "aab":
        bundle_path = bundle_output_path(build_type)
        return [bundle_path] if bundle_path.exists() else []

    apks = read_apk_outputs(build_type)
    if target.split_by_abi:
        return [
            apk for apk in apks
            if any(abi in apk.name for abi in target.abis)
        ]
    return apks[:1]


def artifact_suffix(path: Path, target: BuildTarget) -> str:
    if target.split_by_abi:
        for abi in ALL_ABIS:
            if abi in path.name:
                return abi.replace("-", "_")
    if target.key in ("debug-apk",):
        return "debug"
    return target.key.replace("-", "_")


def final_name(build_type: str, target: BuildTarget, artifact: Path) -> str:
    variant_label = "Release" if build_type == "release" else "Debug"
    suffix = artifact_suffix(artifact, target)
    return f"WorkoutTracker_{variant_label}_{suffix}_{TIMESTAMP}{artifact.suffix}"


def verify_and_copy(build_type: str, target: BuildTarget) -> list[Path]:
    step(6, 6, "Verifying and copying artifacts...")

    artifacts = find_artifacts(build_type, target)
    if not artifacts:
        fail(
            "No build artifact was found for the selected target.\n"
            "       Check the Gradle output above for details."
        )

    BUILDS_DIR.mkdir(exist_ok=True)
    destinations = []
    for artifact in artifacts:
        destination = BUILDS_DIR / final_name(build_type, target, artifact)
        shutil.copy2(str(artifact), str(destination))
        destinations.append(destination)
        print(f"        Saved: builds/{destination.name} ({format_size(destination)})")

    return destinations


def success_banner(paths: list[Path], build_type: str, target: BuildTarget):
    label = "Release" if build_type == "release" else "Debug"
    print()
    print("================================================")
    print(f"  Build successful ({label}: {target.label})")
    for path in paths:
        print(f"  File : builds/{path.name}")
        print(f"  Size : {format_size(path)}")
    print("================================================")
    print()


def main():
    args = parse_args()
    header()

    build_type = ask_build_type(args.build_type)
    target = ask_release_target(build_type, args.target)
    check_android_dir()
    check_keystore_configured(build_type, args.skip_keystore_check)
    maybe_clean(args.clean)
    build_artifacts(build_type, target)
    final_artifacts = verify_and_copy(build_type, target)
    success_banner(final_artifacts, build_type, target)


if __name__ == "__main__":
    main()
