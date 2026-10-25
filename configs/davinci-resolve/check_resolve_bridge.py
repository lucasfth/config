#!/usr/bin/env python3
"""Run with ResolvePython in Studio; touches only a newly created test project.

Open Resolve at the Project Manager with no project loaded. Enable Local external
scripting yourself. Pass the manifest of a completed synthetic fixture job.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    if manifest.get("status") != "complete":
        parser.error("a complete fixture job is required")
    import DaVinciResolveScript
    resolve = DaVinciResolveScript.scriptapp("Resolve")
    if resolve is None:
        raise SystemExit("No scripting connection. Studio must be running with Local scripting enabled.")
    manager = resolve.GetProjectManager()
    if manager.GetCurrentProject() is not None:
        raise SystemExit("Refusing to leave an existing project. Return to Project Manager yourself first.")
    name = "CorridorKey-Fixture-" + uuid.uuid4().hex[:12]
    project = manager.CreateProject(name)
    if project is None:
        raise SystemExit("Resolve refused disposable project creation")
    # Intentionally retain this clearly named project, including on failure.
    # Never delete a project or modify the user's existing projects/libraries.
    spec = importlib.util.spec_from_file_location("bridge", Path(__file__).with_name("corridorkey_bridge.py"))
    bridge = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bridge)
    imported = bridge.import_outputs(project.GetMediaPool(), manifest)
    pool = project.GetMediaPool()
    if not pool.SetSelectedClip(imported[0]):
        raise SystemExit(f"Selection check failed in {name}")
    selected = pool.GetSelectedClips()
    if not selected or len(selected) != 1:
        raise SystemExit(f"Selected-clip API check failed in {name}")
    print(json.dumps({"status": "import-verified", "project": name,
                      "product": resolve.GetProductName(), "version": resolve.GetVersionString(),
                      "clips": [item.GetClipProperty() for item in imported]}, indent=2))
    print("UI alpha/render acceptance remains required; no timeline was changed.")


if __name__ == "__main__":
    main()
