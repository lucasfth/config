"""Workspace > Scripts: process one selected 720p sRGB Media Pool source.

Batch operation, not OpenFX. Audio/timelines are unchanged. See the repo guide.
Errors and the retained output directory are printed to Workspace > Console.
"""
import importlib.util
from pathlib import Path
import uuid

BRIDGE = "@bridge@"
FFPROBE = "@ffprobe@"


def run(resolve):
    if resolve is None:
        raise RuntimeError("Resolve Studio scripting connection unavailable")
    project = resolve.GetProjectManager().GetCurrentProject()
    if project is None:
        raise ValueError("Open a project and select exactly one Media Pool source clip")
    spec = importlib.util.spec_from_file_location("corridorkey_bridge", BRIDGE)
    bridge = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bridge)
    pool = project.GetMediaPool()
    source = bridge.selected_path(pool)
    print("CorridorKey: processing", source, "(720p tagged sRGB only; no audio)")
    manifest = bridge.process(source, Path.home() / "Movies/CorridorKey",
                              Path.home() / "Library/Application Support/CorridorKey-Resolve", FFPROBE)
    current = resolve.GetProjectManager().GetCurrentProject()
    if current is None or current.GetUniqueId() != project.GetUniqueId():
        raise RuntimeError(f"Project changed; no import attempted. Output: {manifest['job']}")
    previous = pool.GetCurrentFolder()
    name = "CorridorKey-" + uuid.uuid4().hex[:8]
    folder = pool.AddSubFolder(pool.GetRootFolder(), name)
    if not folder or not pool.SetCurrentFolder(folder):
        raise RuntimeError(f"Cannot select output bin; output preserved: {manifest['job']}")
    try:
        imported = bridge.import_outputs(pool, manifest)
        print(f"CorridorKey: imported {len(imported)} straight-alpha cutout in {name}. "
              f"Output/matte/logs: {manifest['job']}")
    finally:
        if not pool.SetCurrentFolder(previous):
            print("CorridorKey: previous Media Pool folder could not be restored")
    return manifest


if __name__ == "__main__":
    try:
        app = globals().get("resolve")
        if app is None:
            import DaVinciResolveScript
            app = DaVinciResolveScript.scriptapp("Resolve")
        run(app)
    except Exception as error:
        print(f"CorridorKey ERROR: {error}. Open the Media Pool and select one original 720p sRGB video, not a Fusion node or output sequence.")
        raise
