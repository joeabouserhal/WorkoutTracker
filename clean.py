import os
import shutil
from pathlib import Path

# Paths to delete
TARGETS = [
    "android/build",
    "android/.cxx",
    "android/.gradle",
    "android/app/build",
    "android/app/.cxx",
    "node_modules/react-native-reanimated/android/build",
    "node_modules/react-native-reanimated/android/.cxx",
]

# Expand home for Gradle cache
HOME_GRADLE_CACHE = os.path.expanduser("~/.gradle/caches")
TARGETS.append(HOME_GRADLE_CACHE)


# Helpers
def delete_path(path_str: str):
    path = Path(path_str)

    if not path.exists():
        print(f"[SKIP] Not found: {path}")
        return

    try:
        if path.is_dir():
            shutil.rmtree(path)
            print(f"[DELETED DIR] {path}")
        else:
            path.unlink()
            print(f"[DELETED FILE] {path}")
    except Exception as e:
        print(f"[ERROR] Could not delete {path}: {e}")


def main():
    print("\nStarting React Native cleanup...\n")

    for target in TARGETS:
        delete_path(target)

    print("\nCleanup complete.\n")


if __name__ == "__main__":
    main()