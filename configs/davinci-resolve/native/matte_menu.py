"""Explicit-colour dialog for native graph setup; no batch keyer or render job."""

def run(comp, builder):
    if comp is None or comp.ActiveTool is None:
        raise ValueError('Open Fusion and select the source node first')
    source = comp.ActiveTool
    # Only offer IDs present in the live Resolve registry, not guessed strings.
    probe = comp.AddTool('ColorSpaceTransform', -32768, -32768)
    if not probe:
        raise RuntimeError('Color Space Transform is unavailable')
    try:
        enums = {i.GetAttrs().get('INPS_ID'): i.GetAttrs().get('INPIDT_ComboControl_ID', {})
                 for i in probe.GetInputList().values()}
        labels = {
            'InputColorSpace': [('Rec.709 / sRGB', 'REC709_COLORSPACE'),
                                ('Rec.2020', 'REC2020_COLORSPACE'),
                                ('Canon Cinema Gamut', 'CANONLOG2_COLORSPACE'),
                                ('DaVinci Wide Gamut', 'DWG_COLORSPACE')],
            'InputGamma': [('Gamma 2.4', 'TWOPOINTFOUR_GAMMA'), ('sRGB', 'SRGB_GAMMA'),
                           ('Linear', 'LINEAR_GAMMA'), ('Apple Log (not Log 2)', 'APPLE_LOG_GAMMA'),
                           ('Canon Log 3', 'CANONLOG3_GAMMA'), ('Fujifilm F-Log (not F-Log2)', 'FLOG_OETF_GAMMA'),
                           ('DaVinci Intermediate', 'DAV_INTER_OETF_GAMMA')]}
        choices = {}
        for key, entries in labels.items():
            allowed = set(enums.get(key, {}).values())
            choices[key] = [('Explicitly choose...', None)] + [(label, value) for label, value in entries if value in allowed]
            if len(choices[key]) == 1:
                raise RuntimeError('Cannot enumerate supported ' + key)
    finally:
        probe.Delete()
        comp.SetActiveTool(source)
    spaces, gammas = choices['InputColorSpace'], choices['InputGamma']
    answer = comp.AskUser('CorridorKey: ACTUAL input pixels (not camera name)', {
        1: {1: 'Space', 2: 'Dropdown', 'Name': 'Input primaries', 'Options': {i: t[0] for i, t in enumerate(spaces)}, 'Default': 0},
        2: {1: 'Gamma', 2: 'Dropdown', 'Name': 'Input gamma', 'Options': {i: t[0] for i, t in enumerate(gammas)}, 'Default': 0}})
    if answer is None:
        return None
    space, gamma = int(answer['Space']), int(answer['Gamma'])
    if not 0 < space < len(spaces) or not 0 < gamma < len(gammas):
        raise ValueError('Explicitly choose input primaries and gamma; colour-managed sources may already be transformed')
    graph = builder(comp, source, spaces[space][1], gammas[gamma][1])
    print('CorridorKey setup finished. The selected wrapper exposes Colour, Key, Matte and Temporal controls. '
          'Review input/output colour settings in the Inspector; no temporal render starts automatically.')
    return graph


def show_error(comp, error):
    message = str(error) + '\n\nSetup did not complete. Check any rollback notice above; retain the backup. Select the source connected directly to MediaOut1 before retrying.'
    print('CorridorKey matte setup:', message)
    if comp is not None:
        comp.AskUser('CorridorKey — setup could not continue', {
            1: {1: 'Message', 2: 'Text', 'Name': 'What to do next',
                'Default': message, 'ReadOnly': True, 'Lines': 5, 'Wrap': True}})
