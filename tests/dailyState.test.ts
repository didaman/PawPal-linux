import assert from "node:assert/strict";
import {
  clearExpiredDailyState,
  isBreakMutedToday,
  nextLocalMidnightDelayMs
} from "../src/main/dailyState";

export const tests = [
  {
    name: "isBreakMutedToday recognizes a mute for the current local day",
    run(): void {
      assert.equal(isBreakMutedToday({ breakMutedDate: "2026-05-05" }, "2026-05-05"), true);
      assert.equal(isBreakMutedToday({ breakMutedDate: "2026-05-04" }, "2026-05-05"), false);
      assert.equal(isBreakMutedToday({}, "2026-05-05"), false);
    }
  },
  {
    name: "clearExpiredDailyState keeps today's mute and clears older mute dates",
    run(): void {
      assert.deepEqual(
        clearExpiredDailyState({ breakMutedDate: "2026-05-05" }, "2026-05-05"),
        { breakMutedDate: "2026-05-05" }
      );
      assert.deepEqual(
        clearExpiredDailyState({ breakMutedDate: "2026-05-04" }, "2026-05-05"),
        { breakMutedDate: undefined }
      );
    }
  },
  {
    name: "nextLocalMidnightDelayMs returns the delay until the next local day",
    run(): void {
      assert.equal(nextLocalMidnightDelayMs(new Date(2026, 4, 5, 23, 59, 30)), 30_000);
      assert.equal(nextLocalMidnightDelayMs(new Date(2026, 4, 5, 0, 0, 0)), 86_400_000);
    }
  }
];
