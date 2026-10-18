import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { getSelectListTheme } from '@earendil-works/pi-coding-agent';
import { Container, Input, SelectList, Spacer, Text, matchesKey } from '@earendil-works/pi-tui';
import type { SelectItem } from '@earendil-works/pi-tui';

export function filterModelChoices(choices: SelectItem[], query: string) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return choices.filter(item => words.every(word => `${item.value} ${item.label} ${item.description ?? ''}`.toLocaleLowerCase().includes(word)));
}

export async function pickModelOverlay(ctx: ExtensionCommandContext, title: string, choices: SelectItem[]) {
  return ctx.ui.custom<string | undefined>((_tui, theme, _keys, done) => {
    const root = new Container();
    const input = new Input();
    input.focused = true;
    let list = new SelectList(choices, 10, getSelectListTheme());
    root.addChild(new Text(theme.bold(theme.fg('accent', title)), 1, 0));
    root.addChild(new Text(theme.fg('muted', 'Type to filter · ↑↓ select · Enter confirm · Esc cancel'), 1, 0));
    root.addChild(new Spacer(1));
    root.addChild(input);
    root.addChild(new Spacer(1));
    const listContainer = new Container();
    listContainer.addChild(list);
    root.addChild(listContainer);
    list.onSelect = item => done(item.value);
    list.onCancel = () => done(undefined);
    input.onSubmit = () => { const item = list.getSelectedItem(); if (item) done(item.value); };
    return {
      focused: true,
      render: width => root.render(width),
      invalidate: () => root.invalidate(),
      handleInput(data) {
        if (matchesKey(data, 'escape')) { done(undefined); return; }
        if (matchesKey(data, 'up') || matchesKey(data, 'down') || matchesKey(data, 'pageUp') || matchesKey(data, 'pageDown')) list.handleInput(data);
        else {
          const previous = input.getValue();
          input.handleInput(data);
          if (input.getValue() !== previous) {
            list = new SelectList(filterModelChoices(choices, input.getValue()), 10, getSelectListTheme());
            list.onSelect = item => done(item.value);
            list.onCancel = () => done(undefined);
            listContainer.clear();
            listContainer.addChild(list);
          }
        }
      },
    };
  }, { overlay: true, overlayOptions: { width: '86%', maxHeight: '70%', anchor: 'center', margin: 1 } });
}
