import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useMemo, useState } from "react";
import { shellTips, type ShellTip } from "./catalog";
import {
  HISTORY_LIMITATION,
  tipUsageLabel,
  useHistoryUsage,
} from "./use-daily-tip";
import { useLearnedIds } from "./state";

const HISTORY_REFRESH_INTERVAL = 30_000;

type TipDetailProps = {
  tip: ShellTip;
  learned: boolean;
  usageLabel: string;
};

function TipDetail({ tip, learned, usageLabel }: TipDetailProps) {
  const markdown = [
    `# ${tip.title}`,
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
    `**${usageLabel}**`,
    "",
    `> ${HISTORY_LIMITATION}`,
  ].join("\n");

  return (
    <List.Item.Detail
      markdown={markdown}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Category"
            text={tip.category}
          />
          <List.Item.Detail.Metadata.Label
            title="Status"
            text={learned ? "Learned" : "Not learned"}
          />
          <List.Item.Detail.Metadata.Label
            title="Recent usage"
            text={usageLabel}
          />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label
            title="History note"
            text={HISTORY_LIMITATION}
          />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

export default function ShellCheatSheet() {
  const {
    learnedIds,
    isLoading: learnedLoading,
    error: learnedError,
    updateLearnedIds,
    setLearned,
  } = useLearnedIds();
  const history = useHistoryUsage(HISTORY_REFRESH_INTERVAL);
  const [category, setCategory] = useState("all");

  const categories = useMemo(
    () => [
      "all",
      ...Array.from(new Set(shellTips.map((tip) => tip.category))).sort(),
    ],
    [],
  );
  const visibleTips = useMemo(
    () =>
      category === "all"
        ? shellTips
        : shellTips.filter((tip) => tip.category === category),
    [category],
  );
  const allLearned =
    shellTips.length > 0 &&
    shellTips.every((tip) => learnedIds.includes(tip.id));
  const isLoading = learnedLoading || history.isLoading;
  const status = [learnedError, history.error, history.status]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  async function resetLearned() {
    await updateLearnedIds([]);
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Search title, command, shortcut, or category"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter by category"
          value={category}
          onChange={setCategory}
        >
          {categories.map((value) => (
            <List.Dropdown.Item
              key={value}
              value={value}
              title={value === "all" ? "All categories" : value}
            />
          ))}
        </List.Dropdown>
      }
    >
      {visibleTips.length === 0 ? (
        <List.EmptyView
          title="No tips in this category"
          icon={Icon.MagnifyingGlass}
        />
      ) : (
        <List.Section
          title={allLearned ? `All tips learned · ${status}` : status}
        >
          {visibleTips.map((tip) => {
            const learned = learnedIds.includes(tip.id);
            const usage = tipUsageLabel(tip, history.counts, history.status);
            return (
              <List.Item
                key={tip.id}
                title={tip.title}
                subtitle={tip.category}
                keywords={[
                  tip.title,
                  tip.category,
                  tip.example,
                  tip.shortcut ?? "",
                  tip.description,
                ]}
                icon={learned ? Icon.Checkmark : Icon.Terminal}
                accessories={[
                  { text: learned ? "Learned" : "New" },
                  { text: usage },
                ]}
                detail={
                  <TipDetail tip={tip} learned={learned} usageLabel={usage} />
                }
                actions={
                  <ActionPanel>
                    <Action.CopyToClipboard
                      title="Copy Example"
                      content={tip.example}
                    />
                    <Action
                      title={learned ? "Mark Unlearned" : "Mark Learned"}
                      icon={learned ? Icon.Circle : Icon.Checkmark}
                      onAction={() => setLearned(tip.id, !learned)}
                      shortcut={{ modifiers: ["cmd"], key: "l" }}
                    />
                    <Action
                      title="Reset Learned Tips"
                      icon={Icon.RotateClockwise}
                      onAction={resetLearned}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
