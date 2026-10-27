"""Workspace > Scripts > Utility: insert one colour-managed CorridorKey node."""
import importlib.util
from pathlib import Path


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    import DaVinciResolveScript as d
    support = Path.home() / 'Library/Application Support/CorridorKey-Resolve'
    import sys
    sys.path.insert(0, str(support / 'setup'))
    setup = load('corridor_single_setup', support / 'setup/setup_single.py')
    menu = load('corridor_matte_menu', support / 'corridor_matte_menu.py')
    resolve = d.scriptapp('Resolve')
    comp = globals().get('comp')
    if comp is None and resolve:
        comp = resolve.Fusion().GetCurrentComp()
    try:
        return menu.run(comp, setup.build)
    except Exception as error:
        menu.show_error(comp, error)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('CorridorKey matte setup:', error)
        raise
