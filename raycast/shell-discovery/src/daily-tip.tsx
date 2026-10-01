import { Action, ActionPanel, Detail, Icon, Keyboard } from "@raycast/api";
import { shellTips } from "./catalog";
import {
  HISTORY_LIMITATION,
  useDailyTip,
  type DailyTipState,
} from "./use-daily-tip";

function buildMarkdown(
  tip: DailyTipState["tip"],
  usageLabel: DailyTipState["usageLabel"],
  historyWarning: string | undefined,
  actionError: string | undefined,
  error: string | undefined,
): string {
  if (!tip) {
    const title =
      shellTips.length > 0
        ? "No daily shell tip is available"
        : "No shell tips are available";
    return [
      "# Daily Shell Tip",
      "",
      error ?? title,
      "",
      "Open the Shell Cheat Sheet to browse every tip.",
      ...(actionError ? ["", `> ${actionError}`] : []),
    ].join("\n");
  }

  return [
    `# ${tip.title}`,
    "",
    `**${tip.category}**`,
    "",
    tip.description,
    "",
    "## Example",
    "",
    "```sh",
    tip.example,
    "```",
    ...(tip.shortcut ? ["", `**Shortcut:** \`${tip.shortcut}\``] : []),
    ...(tip.caution ? ["", `> **Caution:** ${tip.caution}`] : []),
    "",
    "## Recent history usage",
    "",
    `**${usageLabel(tip)}**`,
    ...(historyWarning ? ["", `> ${historyWarning}`] : []),
    "",
    `> ${HISTORY_LIMITATION}`,
    ...(actionError ? ["", `> ${actionError}`] : []),
  ].join("\n");
}

export default function DailyTip() {
  const {
    tip,
    learnedIds,
    learnedLoading,
    historyStatus,
    isLoading,
    error,
    actionError,
    usageLabel,
    copyExample,
    markLearned,
    markUnlearned,
    nextTip,
    openCheatSheet,
  } = useDailyTip();
  const learned = tip ? learnedIds.includes(tip.id) : false;
  const historyWarning = historyStatus.startsWith("History unavailable:")
    ? historyStatus
    : undefined;
  const markdown = buildMarkdown(
    tip,
    usageLabel,
    historyWarning,
    actionError,
    error,
  );

  return (
    <Detail
      isLoading={isLoading || learnedLoading}
      markdown={markdown}
      metadata={
        tip ? (
          <Detail.Metadata>
            <Detail.Metadata.Label title="Category" text={tip.category} />
            <Detail.Metadata.Label
              title="Learning"
              text={learned ? "Learned" : "Not learned"}
            />
            <Detail.Metadata.Label
              title="Recent usage"
              text={usageLabel(tip)}
            />
            {historyWarning ? (
              <Detail.Metadata.Label
                title="History error"
                text={historyWarning}
              />
            ) : null}
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label
              title="History note"
              text={HISTORY_LIMITATION}
            />
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          {tip ? (
            <>
              <Action
                title="Copy Example"
                icon={Icon.Clipboard}
                onAction={copyExample}
              />
              <Action
                title={learned ? "Mark Unlearned" : "Mark Learned"}
                icon={learned ? Icon.Circle : Icon.Checkmark}
                onAction={learned ? markUnlearned : markLearned}
                shortcut={{ modifiers: ["cmd"], key: "l" }}
              />
              <Action
                title="Next Tip"
                icon={Icon.ArrowClockwise}
                onAction={nextTip}
                shortcut={Keyboard.Shortcut.Common.New}
              />
            </>
          ) : null}
          <Action
            title="Open Shell Cheat Sheet"
            icon={Icon.Book}
            onAction={openCheatSheet}
          />
        </ActionPanel>
      }
    />
  );
}
