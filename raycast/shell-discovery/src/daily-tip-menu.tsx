import { Icon, MenuBarExtra } from "@raycast/api";
import { shellTips } from "./catalog";
import { HISTORY_LIMITATION, useDailyTip } from "./use-daily-tip";

const MENU_REFRESH_INTERVAL = 60 * 60 * 1000;

function truncate(value: string, maximum: number): string {
  const characters = Array.from(value);
  if (characters.length <= maximum) return value;
  return `${characters.slice(0, Math.max(0, maximum - 1)).join("")}…`;
}

export default function DailyTipMenu() {
  const {
    tip,
    learnedIds,
    isLoading,
    error,
    actionError,
    historyStatus,
    usageLabel,
    copyExample,
    markLearned,
    markUnlearned,
    nextTip,
    openCheatSheet,
  } = useDailyTip({ refreshIntervalMs: MENU_REFRESH_INTERVAL });
  const learned = tip ? learnedIds.includes(tip.id) : false;
  const allLearned =
    shellTips.length > 0 &&
    shellTips.every((candidate) => learnedIds.includes(candidate.id));
  const status =
    actionError ||
    error ||
    (historyStatus.startsWith("History unavailable:")
      ? historyStatus
      : undefined);

  return (
    <MenuBarExtra
      title="Zsh"
      icon={Icon.Terminal}
      tooltip={tip ? tip.title : "Daily shell tip"}
      isLoading={isLoading}
    >
      {tip ? (
        <>
          <MenuBarExtra.Item
            title={truncate(tip.title, 56)}
            subtitle={tip.category}
            tooltip={`${tip.title}: ${tip.description}`}
          />
          <MenuBarExtra.Item
            title={truncate(tip.description, 80)}
            tooltip={tip.description}
          />
          <MenuBarExtra.Item
            title={`Example: ${truncate(tip.example, 70)}`}
            tooltip={`Copy example: ${tip.example}`}
            onAction={copyExample}
          />
          <MenuBarExtra.Item
            title={usageLabel(tip)}
            tooltip={HISTORY_LIMITATION}
          />
          {status ? (
            <MenuBarExtra.Item title="Status" subtitle={status} />
          ) : null}
          <MenuBarExtra.Section title="Actions">
            <MenuBarExtra.Item
              title="Copy Example"
              icon={Icon.Clipboard}
              onAction={copyExample}
            />
            <MenuBarExtra.Item
              title={learned ? "Mark Unlearned" : "Mark Learned"}
              icon={learned ? Icon.Circle : Icon.Checkmark}
              onAction={learned ? markUnlearned : markLearned}
            />
            <MenuBarExtra.Item
              title="Next Tip"
              icon={Icon.ArrowClockwise}
              onAction={nextTip}
            />
            <MenuBarExtra.Item
              title="Open Shell Cheat Sheet"
              icon={Icon.Book}
              onAction={openCheatSheet}
            />
          </MenuBarExtra.Section>
        </>
      ) : (
        <>
          <MenuBarExtra.Item
            title={
              status ||
              (allLearned ? "All shell tips learned" : "No daily tip available")
            }
            tooltip={HISTORY_LIMITATION}
          />
          <MenuBarExtra.Item
            title="Open Shell Cheat Sheet"
            icon={Icon.Book}
            onAction={openCheatSheet}
          />
        </>
      )}
    </MenuBarExtra>
  );
}
