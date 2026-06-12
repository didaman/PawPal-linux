export function supportsForwardedIgnoredMouseEvents(
  platform: NodeJS.Platform = process.platform
): boolean {
  return platform === "darwin" || platform === "win32";
}
