import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { app } from "electron";

const LINUX_DESKTOP_FILE_NAME = "PawPal.desktop";

function supportsNativeLoginItemSettings(): boolean {
  return (process.platform === "darwin" || process.platform === "win32") && app.isPackaged;
}

function supportsLinuxAutostart(): boolean {
  return process.platform === "linux" && app.isPackaged;
}

export function supportsLoginItemSettings(): boolean {
  return supportsNativeLoginItemSettings() || supportsLinuxAutostart();
}

function linuxConfigHome(): string {
  const configHome = process.env.XDG_CONFIG_HOME?.trim();
  if (configHome && isAbsolute(configHome)) return configHome;
  return join(app.getPath("home"), ".config");
}

function linuxAutostartDesktopPath(): string {
  return join(linuxConfigHome(), "autostart", LINUX_DESKTOP_FILE_NAME);
}

function linuxLaunchExecutablePath(): string {
  const appImagePath = process.env.APPIMAGE?.trim();
  return appImagePath || app.getPath("exe");
}

function quoteDesktopExecPath(path: string): string {
  return `"${path.replace(/(["\\`$])/g, "\\$1")}"`;
}

function linuxDesktopEntry(executablePath: string): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=PawPal",
    "Comment=A tiny desktop dog that reminds you to take breaks, drink water, and stay focused.",
    `Exec=${quoteDesktopExecPath(executablePath)}`,
    "Terminal=false",
    "Categories=Utility;",
    "X-GNOME-Autostart-enabled=true",
    ""
  ].join("\n");
}

function applyLinuxLaunchAtLoginPreference(enabled: boolean): void {
  const desktopPath = linuxAutostartDesktopPath();
  try {
    if (enabled) {
      mkdirSync(dirname(desktopPath), { recursive: true });
      writeFileSync(desktopPath, linuxDesktopEntry(linuxLaunchExecutablePath()), "utf8");
      return;
    }
    if (existsSync(desktopPath)) unlinkSync(desktopPath);
  } catch (error) {
    console.warn("Failed to update Linux autostart entry:", error);
  }
}

function getLinuxLaunchAtLoginState(fallback: boolean): boolean {
  try {
    const desktopPath = linuxAutostartDesktopPath();
    if (!existsSync(desktopPath)) return false;

    const desktopEntry = readFileSync(desktopPath, "utf8");
    if (/^\s*Hidden\s*=\s*true\s*$/im.test(desktopEntry)) return false;
    if (/^\s*X-GNOME-Autostart-enabled\s*=\s*false\s*$/im.test(desktopEntry)) return false;
    return true;
  } catch (error) {
    console.warn("Failed to read Linux autostart entry:", error);
    return fallback;
  }
}

export function applyLaunchAtLoginPreference(enabled: boolean): void {
  if (supportsLinuxAutostart()) {
    applyLinuxLaunchAtLoginPreference(enabled);
    return;
  }
  if (!supportsNativeLoginItemSettings()) return;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true
  });
}

export function getLaunchAtLoginState(fallback: boolean): boolean {
  if (supportsLinuxAutostart()) return getLinuxLaunchAtLoginState(fallback);
  if (!supportsNativeLoginItemSettings()) return fallback;
  return app.getLoginItemSettings().openAtLogin;
}
