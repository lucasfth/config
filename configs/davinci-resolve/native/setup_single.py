"""Insert the current CorridorKey wrapper into a simple timeline composition.

Resolve's Paste path is unreliable here; export/import the composition with a
recoverable backup. Refuse complex routing rather than guessing connections.
"""
import re
from pathlib import Path
from comp_text import tool_block


def insert_group(text, source_name, colour_space, gamma, macro):
    for value in (source_name, colour_space, gamma):
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', value):
            raise ValueError('Unsupported source name or colour identifier')
    if re.search(r'\bCorridorKey\s*=\s*(?:GroupOperator|MacroOperator)', text):
        raise ValueError('CorridorKey already exists; select its outer node instead')
    tool_block(text, source_name)
    output = tool_block(text, 'MediaOut1')
    connection = re.compile(r'SourceOp\s*=\s*"' + re.escape(source_name) + r'"\s*,\s*Source\s*=\s*"Output"')
    if len(connection.findall(output)) != 1:
        raise ValueError('Select the source connected directly to MediaOut1; complex routing is unchanged')
    group = tool_block(macro, 'CorridorKey')
    anchor = 'Controls = BrightnessContrast { Inputs = {'
    if group.count(anchor) != 1:
        raise ValueError('Unsupported installed wrapper layout')
    group = group.replace(anchor, anchor + f' Input = Input {{ SourceOp = "{source_name}", Source = "Output", }},', 1)
    original = tool_block(group, 'OriginalLinear')
    configured = re.sub(r'InputColorSpace = Input \{ Value = FuID \{ "[^"]+" \}',
                        'InputColorSpace = Input { Value = FuID { "' + colour_space + '" }', original)
    configured = re.sub(r'InputGamma = Input \{ Value = FuID \{ "[^"]+" \}',
                        'InputGamma = Input { Value = FuID { "' + gamma + '" }', configured)
    group = group.replace(original, configured, 1)
    updated = connection.sub('SourceOp = "CorridorKey", Source = "MainOutput1"', output)
    return text.replace(output, group + ',\n' + updated, 1)


def import_group(item, destination, backup, source_name, colour_space, gamma):
    names = item.GetFusionCompNameList()
    # Restrict the initial setup path instead of guessing which comp is active.
    if len(names) != 1 or item.GetFusionCompCount() != 1:
        raise ValueError('Automatic setup requires exactly one composition on the clip')
    original_name, original_index = names[0], 1
    if backup.exists():
        raise ValueError('Backup already exists; choose a new setup directory')
    if not item.ExportFusionComp(str(backup), original_index) or not backup.is_file():
        raise RuntimeError('Cannot back up the original composition; nothing imported')
    try:
        comp = item.ImportFusionComp(str(destination))
        if not comp:
            raise RuntimeError('Resolve refused CorridorKey wrapper')
        tools = list(comp.GetToolList(False).values())
        groups = [t for t in tools if t.GetAttrs().get('TOOLS_Name') == 'CorridorKey'
                  and t.GetAttrs().get('TOOLS_RegID') == 'GroupOperator']
        if len(groups) != 1:
            raise RuntimeError('Imported group is missing or ambiguous')
        group = groups[0]
        sources = [t for t in tools if t.GetAttrs().get('TOOLS_Name') == source_name]
        outputs = [t for t in tools if t.GetAttrs().get('TOOLS_Name') == 'MediaOut1']
        if len(sources) != 1 or len(outputs) != 1:
            raise RuntimeError('Imported source/output is ambiguous')
        if not group.ConnectInput('MainInput1', sources[0]) or not outputs[0].ConnectInput('Input', group.FindMainOutput(1)):
            raise RuntimeError('Cannot connect wrapper')
        for key, value in [('InputSpace', colour_space), ('InputGamma', gamma)]:
            if group.GetInput(key) != value:
                raise RuntimeError('Wrapper input colour readback differs: ' + key)
        owner = outputs[0].FindMainInput(1).GetConnectedOutput().GetTool()
        if owner.GetAttrs().get('TOOLS_Name') not in ('CorridorKey', 'SelectMatte'):
            raise RuntimeError('Wrapper output readback failed')
        imported_names = item.GetFusionCompNameList()
        additions = [name for name in imported_names if name not in names]
        if len(additions) > 1 or item.GetFusionCompCount() != 1 + len(additions):
            raise RuntimeError('Unexpected composition count after setup')
        selected_name = additions[0] if additions else original_name
        if not item.LoadFusionCompByName(selected_name):
            raise RuntimeError('Cannot select verified wrapper composition')
        comp.SetActiveTool(group)
        group.ShowControlPage('Colour')
        if additions and not item.DeleteFusionCompByName(original_name):
            raise RuntimeError('Cannot remove superseded composition; backup retained')
        if item.GetFusionCompCount() != 1 or item.GetFusionCompNameList() != [selected_name]:
            raise RuntimeError('Setup did not leave exactly one wrapper composition')
        return comp, group
    except Exception as error:
        try:
            current_names = item.GetFusionCompNameList()
            added = [name for name in current_names if name not in names]
            if added:
                # Appending import left the original intact; remove only owned additions.
                for name in added:
                    if not item.DeleteFusionCompByName(name):
                        raise RuntimeError('Cannot remove failed imported composition')
            else:
                # This Resolve build may replace the active composition on import.
                if not item.LoadFusionCompByName(original_name) or not item.ImportFusionComp(str(backup)):
                    raise RuntimeError('Cannot restore original composition')
                restored_names = item.GetFusionCompNameList()
                additions = [name for name in restored_names if name not in names]
                if additions:
                    if len(additions) != 1:
                        raise RuntimeError('Ambiguous rollback import')
                    import uuid
                    displaced = 'Failed setup ' + uuid.uuid4().hex[:8]
                    if not item.RenameFusionCompByName(original_name, displaced):
                        raise RuntimeError('Cannot preserve failed composition before rollback rename')
                    if not item.RenameFusionCompByName(additions[0], original_name):
                        item.RenameFusionCompByName(displaced, original_name)
                        raise RuntimeError('Cannot restore composition name; both versions retained')
                    if not item.DeleteFusionCompByName(displaced):
                        raise RuntimeError('Original restored but failed composition retained')
            if item.GetFusionCompNameList() != names or item.GetFusionCompCount() != len(names):
                raise RuntimeError('Composition count/name not restored')
            if not item.LoadFusionCompByName(original_name):
                raise RuntimeError('Cannot select restored composition')
            check = backup.with_name('rollback-readback.comp')
            if not item.ExportFusionComp(str(check), original_index):
                raise RuntimeError('Cannot verify restored composition')
            if check.read_text(encoding='utf-8') != backup.read_text(encoding='utf-8'):
                raise RuntimeError('Restored composition differs from backup; manual review required')
        except Exception as rollback_error:
            raise RuntimeError('Setup failed; rollback not verified. Backup: ' + str(backup) +
                               '; ' + str(rollback_error)) from error
        raise


def build(comp, source, colour_space, gamma):
    """Menu adapter: one selected simple timeline source -> one wrapper."""
    import tempfile
    if comp is None or source is None:
        raise ValueError('Select a source node in a timeline Fusion composition')
    import DaVinciResolveScript as d
    resolve = d.scriptapp('Resolve')
    if not resolve:
        raise RuntimeError('Resolve is not available')
    project = resolve.GetProjectManager().GetCurrentProject()
    timeline = project.GetCurrentTimeline() if project else None
    if not timeline:
        raise ValueError('Open a timeline before creating CorridorKey')
    attrs = source.GetAttrs()
    source_name, source_id = attrs.get('TOOLS_Name'), attrs.get('TOOLI_ID')
    if not isinstance(source_id, (int, float)):
        raise ValueError('Cannot identify selected source')
    # Remote wrappers are not identity-stable; refuse ambiguous matching IDs.
    matches = []
    for track in range(1, timeline.GetTrackCount('video') + 1):
        for item in timeline.GetItemListInTrack('video', track) or []:
            if item.GetFusionCompCount() != 1:
                continue
            candidate = item.GetFusionCompByIndex(1)
            for node in candidate.GetToolList(False).values():
                data = node.GetAttrs()
                if data.get('TOOLS_Name') == source_name and data.get('TOOLI_ID') == source_id:
                    matches.append(item)
    if len(matches) != 1:
        raise ValueError('Cannot uniquely locate selected source; use one simple composition per clip')
    item = matches[0]
    root = Path.home() / 'Movies/CorridorKey/setup-backups'
    root.mkdir(parents=True, exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix='setup-', dir=root))
    snapshot = directory / 'snapshot.comp'
    if not item.ExportFusionComp(str(snapshot), 1):
        raise RuntimeError('Cannot snapshot selected composition')
    original = snapshot.read_text(encoding='utf-8')
    macro = Path.home() / 'Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Macros/CorridorKey.setting'
    modified = insert_group(original, source_name, colour_space, gamma, macro.read_text(encoding='utf-8'))
    destination = directory / 'single-node.comp'
    destination.write_text(modified, encoding='utf-8')
    # Check again after the dialog/snapshot so intervening edits are not lost.
    check = directory / 'before-import.comp'
    if not item.ExportFusionComp(str(check), 1) or check.read_text(encoding='utf-8') != original:
        raise ValueError('Composition changed during setup; nothing imported')
    created, group = import_group(item, destination, directory / 'original.comp',
                                  source_name, colour_space, gamma)
    print('CorridorKey single node created. Input/output connected; original backup: ' + str(directory))
    return dict(group=group, composition=created, backup=str(directory))
