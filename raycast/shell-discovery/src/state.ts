import { LocalStorage } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";

export const LEARNED_IDS_KEY = "learnedIds";
export const DAILY_SELECTION_KEY = "dailySelection";

export type DailySelection = {
  dateKey: string;
  tipId: string;
};

export function useLearnedIds() {
  const [learnedIds, setLearnedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void LocalStorage.getItem<string>(LEARNED_IDS_KEY)
      .then((stored) => {
        const parsed: unknown = stored === undefined ? [] : JSON.parse(stored);
        if (
          !Array.isArray(parsed) ||
          parsed.some((id) => typeof id !== "string")
        ) {
          throw new Error("Stored learned tips are invalid.");
        }
        if (active) {
          setLearnedIds(parsed);
        }
      })
      .catch(() => {
        if (active) {
          setError(
            "Learned tip progress could not be read; reset is available.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const updateLearnedIds = useCallback(async (nextIds: string[]) => {
    const uniqueIds = [...new Set(nextIds)];
    try {
      await LocalStorage.setItem(LEARNED_IDS_KEY, JSON.stringify(uniqueIds));
      setLearnedIds(uniqueIds);
      setError(undefined);
    } catch {
      setError("Learned tip progress could not be saved.");
    }
  }, []);

  const setLearned = useCallback(
    (id: string, learned: boolean) =>
      updateLearnedIds(
        learned
          ? [...learnedIds, id]
          : learnedIds.filter((learnedId) => learnedId !== id),
      ),
    [learnedIds, updateLearnedIds],
  );

  return { learnedIds, isLoading, error, updateLearnedIds, setLearned };
}

export async function readDailySelection(): Promise<
  DailySelection | undefined
> {
  const stored = await LocalStorage.getItem<string>(DAILY_SELECTION_KEY);
  if (stored === undefined) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(stored);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("dateKey" in parsed) ||
    !("tipId" in parsed) ||
    typeof parsed.dateKey !== "string" ||
    typeof parsed.tipId !== "string" ||
    parsed.tipId.length === 0
  ) {
    throw new Error("Stored daily tip selection is invalid.");
  }
  return { dateKey: parsed.dateKey, tipId: parsed.tipId };
}

export function writeDailySelection(selection: DailySelection) {
  return LocalStorage.setItem(DAILY_SELECTION_KEY, JSON.stringify(selection));
}

export function clearDailySelection() {
  return LocalStorage.removeItem(DAILY_SELECTION_KEY);
}
