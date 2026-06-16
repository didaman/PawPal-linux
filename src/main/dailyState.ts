import { todayKey } from "../shared/constants";

export type DailyState = {
  breakMutedDate?: string;
};

export function isBreakMutedToday(
  state: DailyState,
  date = todayKey()
): boolean {
  return state.breakMutedDate === date;
}

export function clearExpiredDailyState(
  state: DailyState,
  date = todayKey()
): DailyState {
  if (!state.breakMutedDate || state.breakMutedDate === date) return state;
  return { ...state, breakMutedDate: undefined };
}

export function nextLocalMidnightDelayMs(now = new Date()): number {
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(1, nextMidnight.getTime() - now.getTime());
}
