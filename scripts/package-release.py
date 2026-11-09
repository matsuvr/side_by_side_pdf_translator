#!/usr/bin/env python3
"""Package the signed macOS app with the verified official PLaMo GGUF."""

import hashlib
import json
import plistlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def run(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    if sys.platform != "darwin":
        raise SystemExit("This packaging command requires macOS (ditto and codesign).")
    model_info = json.loads((ROOT / "licenses/plamo-model.json").read_text())
    model = ROOT / model_info["file"]
    if not model.is_file() or model.stat().st_size != model_info["size"]:
        raise SystemExit(f"Missing or incorrectly sized official GGUF: {model}")
    if sha256(model) != model_info["sha256"]:
        raise SystemExit("GGUF SHA-256 does not match the pinned official model.")
    for language, name in model_info["licenseFiles"].items():
        if sha256(ROOT / "licenses" / name) != model_info["licenseSha256"][language]:
            raise SystemExit(f"Official PLaMo license has changed: {name}")
    if run("git", "status", "--porcelain"):
        raise SystemExit("Commit source and documentation changes before packaging a release.")

    app = ROOT / "src-tauri/target/release/bundle/macos/PLaMo PDF Translator.app"
    with (app / "Contents/Info.plist").open("rb") as stream:
        info = plistlib.load(stream)
    version = json.loads((ROOT / "package.json").read_text())["version"]
    if info["CFBundleShortVersionString"] != version:
        raise SystemExit("App version does not match package.json; rebuild first.")
    executable = app / "Contents/MacOS" / info["CFBundleExecutable"]
    architecture = run("lipo", "-archs", str(executable))
    if architecture != "arm64":
        raise SystemExit(f"Expected an Apple Silicon app; found {architecture}.")
    subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)], check=True)
    resources = app / "Contents/Resources/licenses"
    documents = {
        "LICENSE": ROOT / "LICENSE",
        "THIRD_PARTY_NOTICES.md": ROOT / "THIRD_PARTY_NOTICES.md",
        "THIRD_PARTY_LICENSES.txt": ROOT / "THIRD_PARTY_LICENSES.txt",
        **{name: ROOT / "licenses" / name for name in model_info["licenseFiles"].values()},
    }
    for name, source in documents.items():
        if sha256(resources / name) != sha256(source):
            raise SystemExit(f"App has a stale or missing license resource: {name}; rebuild first.")

    name = f"PLaMo-PDF-Translator-{version}-macos-arm64"
    output = ROOT / "build/releases"
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f"{name}.zip"
    if archive.exists():
        raise SystemExit(f"Refusing to overwrite existing release: {archive}")
    with tempfile.TemporaryDirectory(prefix="package-", dir=output) as temporary:
        package = Path(temporary) / name
        package.mkdir()
        subprocess.run([
            "ditto", "--norsrc", "--noextattr", "--noqtn", str(app), str(package / app.name)
        ], check=True)
        shutil.copyfile(model, package / model.name)
        for name in ("README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "THIRD_PARTY_LICENSES.txt"):
            shutil.copyfile(ROOT / name, package / name)
        shutil.copytree(ROOT / "licenses", package / "licenses")
        shutil.copyfile(ROOT / "LICENSE", package / "licenses/LICENSE")
        (package / "docs").mkdir()
        for name in ("translation.png", "macos-validation.md"):
            shutil.copyfile(ROOT / "docs" / name, package / "docs" / name)
        (package / "BUILD_INFO.json").write_text(json.dumps({
            "version": version,
            "sourceCommit": run("git", "rev-parse", "HEAD"),
            "platform": "macos-arm64",
            "minimumSystemVersion": info.get("LSMinimumSystemVersion"),
            "backend": "Metal",
            "signing": "ad-hoc; not notarized",
            "executableSha256": sha256(executable),
            "model": model_info,
        }, indent=2) + "\n")
        files = sorted(path for path in package.rglob("*") if path.is_file())
        (package / "SHA256SUMS.txt").write_text("".join(
            f"{sha256(path)}  {path.relative_to(package).as_posix()}\n" for path in files
        ))
        subprocess.run(["ditto", "-c", "-k", "--norsrc", "--noextattr", "--keepParent",
                        str(package), str(archive)], check=True)
    checksum = archive.with_suffix(".zip.sha256")
    checksum.write_text(f"{sha256(archive)}  {archive.name}\n")
    print(archive)
    print(checksum.read_text(), end="")


if __name__ == "__main__":
    main()
