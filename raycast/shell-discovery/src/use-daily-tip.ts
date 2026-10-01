import {
  Clipboard,
  LaunchType,
  getPreferenceValues,
  launchCommand,
  showToast,
  Toast,
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { shellTips, type ShellTip } from "./catalog";
import { localDateKey, readHistoryUsage, selectDailyTip } from "./discovery";
import {
  clearDailySelection,
  readDailySelection,
  useLearnedIds,
  writeDailySelection,
} from "./state";

export type HistoryCounts = Readonly<Record<string, number>>;

type Preferences = {
  historyPath?: string;
};

type HistoryState = {
  counts: HistoryCounts;
  status: string;
  isLoading: boolean;
  error?: string;
};

export type DailyTipOptions = {
  refreshIntervalMs?: number;
};

export type DailyTipState = {
  tip?: ShellTip;
  learnedIds: string[];
  learnedLoading: boolean;
  learnedError?: string;
  historyCounts: HistoryCounts;
  historyStatus: string;
  historyLoading: boolean;
  historyError?: string;
  isLoading: boolean;
  error?: string;
  actionError?: string;
  usageLabel: (tip: ShellTip) => string;
  copyExample: () => Promise<void>;
  markLearned: () => Promise<void>;
  markUnlearned: () => Promise<void>;
  nextTip: () => Promise<void>;
  openCheatSheet: () => Promise<void>;
};

const DEFAULT_HISTORY_PATH = "~/.zsh_history";
const DEFAULT_REFRESH_INTERVAL = 30_000;
const HISTORY_UNAVAILABLE_PREFIX = "History unavailable:";
export const HISTORY_LIMITATION =
  "Recent-history counts are deduplicated entries from the recent local tail and may underestimate use.";

export function tipUsageLabel(
  tip: ShellTip,
  counts: HistoryCounts,
  historyStatus: string,
): string {
  if (!tip.historyPattern) return "Shortcut usage unknown";
  if (historyStatus.startsWith(HISTORY_UNAVAILABLE_PREFIX))
    return "History unavailable";

  const count = counts[tip.id];
  if (count === undefined) return "History usage unknown";
  if (count === 0) return "Not seen in recent history";
  return `${count} recent history entr${count === 1 ? "y" : "ies"}`;
}

export function useHistoryUsage(refreshIntervalMs: number): HistoryState {
  const preferences = getPreferenceValues<Preferences>();
  const [counts, setCounts] = useState<HistoryCounts>({});
  const [status, setStatus] = useState("Checking local history…");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const result = await readHistoryUsage(
        preferences.historyPath || DEFAULT_HISTORY_PATH,
        shellTips,
      );
      setCounts(result.counts);
      setStatus(result.status);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "History usage could not be loaded.";
      setCounts({});
      setStatus(
        "History unavailable: the local Zsh history file could not be read.",
      );
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [preferences.historyPath]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [refresh, refreshIntervalMs]);

  return { counts, status, isLoading, error };
}

export function useDailyTip(options: DailyTipOptions = {}): DailyTipState {
  const refreshIntervalMs =
    options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL;
  const {
    learnedIds,
    isLoading: learnedLoading,
    error: learnedError,
    updateLearnedIds,
  } = useLearnedIds();
  const history = useHistoryUsage(refreshIntervalMs);
  const [tip, setTip] = useState<ShellTip>();
  const [selectionLoading, setSelectionLoading] = useState(true);
  const [selectionError, setSelectionError] = useState<string>();
  const [actionError, setActionError] = useState<string>();

  const refreshSelection = useCallback(
    async (previousId?: string) => {
      setSelectionLoading(true);
      setSelectionError(undefined);
      try {
        const dateKey = localDateKey();
        const cached = await readDailySelection();
        const cachedTip =
          cached?.dateKey === dateKey
            ? shellTips.find((candidate) => candidate.id === cached.tipId)
            : undefined;
        const unlearned = shellTips.filter(
          (candidate) => !learnedIds.includes(candidate.id),
        );
        const lowestRank =
          unlearned.length > 0
            ? Math.min(
                ...unlearned.map(
                  (candidate) => history.counts[candidate.id] ?? 0,
                ),
              )
            : undefined;
        const cachedIsEligible =
          !previousId &&
          cachedTip !== undefined &&
          !learnedIds.includes(cachedTip.id) &&
          lowestRank !== undefined &&
          (history.counts[cachedTip.id] ?? 0) === lowestRank;
        const selected = cachedIsEligible
          ? cachedTip
          : selectDailyTip(
              shellTips,
              learnedIds,
              history.counts,
              dateKey,
              previousId ?? cached?.tipId,
            );

        setTip(selected);
        if (selected) {
          await writeDailySelection({ dateKey, tipId: selected.id });
        } else {
          await clearDailySelection();
        }
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "Daily tip could not be loaded.";
        setSelectionError(message);
        setTip(undefined);
      } finally {
        setSelectionLoading(false);
      }
    },
    [history.counts, learnedIds],
  );

  useEffect(() => {
    if (!learnedLoading && !history.isLoading) {
      void refreshSelection();
    }
  }, [history.isLoading, learnedLoading, refreshSelection]);

  const usageLabel = useCallback(
    (candidate: ShellTip) =>
      tipUsageLabel(candidate, history.counts, history.status),
    [history.counts, history.status],
  );

  const copyExample = useCallback(async () => {
    if (!tip) return;
    try {
      setActionError(undefined);
      await Clipboard.copy(tip.example);
      await showToast({ style: Toast.Style.Success, title: "Example copied" });
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "Example could not be copied.",
      );
    }
  }, [tip]);

  const markLearned = useCallback(async () => {
    if (!tip) return;
    setActionError(undefined);
    await updateLearnedIds([...learnedIds, tip.id]);
  }, [learnedIds, tip, updateLearnedIds]);

  const markUnlearned = useCallback(async () => {
    if (!tip) return;
    setActionError(undefined);
    await updateLearnedIds(learnedIds.filter((id) => id !== tip.id));
  }, [learnedIds, tip, updateLearnedIds]);

  const nextTip = useCallback(async () => {
    if (!tip) return;
    setActionError(undefined);
    await refreshSelection(tip.id);
  }, [refreshSelection, tip]);

  const openCheatSheet = useCallback(async () => {
    try {
      setActionError(undefined);
      await launchCommand({
        name: "shell-cheat-sheet",
        type: LaunchType.UserInitiated,
      });
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "Shell Cheat Sheet could not be opened.",
      );
    }
  }, []);

  const error = selectionError || learnedError || history.error;
  return {
    tip,
    learnedIds,
    learnedLoading,
    learnedError,
    historyCounts: history.counts,
    historyStatus: history.status,
    historyLoading: history.isLoading,
    historyError: history.error,
    isLoading: learnedLoading || history.isLoading || selectionLoading,
    error,
    actionError,
    usageLabel,
    copyExample,
    markLearned,
    markUnlearned,
    nextTip,
    openCheatSheet,
  };
}
