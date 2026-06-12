import assert from "node:assert/strict";
import { supportsForwardedIgnoredMouseEvents } from "../src/main/mouseEvents";

export const tests = [
  {
    name: "supportsForwardedIgnoredMouseEvents keeps Linux pet windows interactive",
    run(): void {
      assert.equal(supportsForwardedIgnoredMouseEvents("linux"), false);
      assert.equal(supportsForwardedIgnoredMouseEvents("darwin"), true);
      assert.equal(supportsForwardedIgnoredMouseEvents("win32"), true);
    }
  }
];
