import { describe, expect, it, vi } from "vitest";
import { isNetworkError, OfflineError, onlineOrKept, sessionOnlineOrSaved, withTimeout } from "../offline/network.js";

const noNetwork = () => Promise.reject(new TypeError("Failed to fetch"));

describe("onlineOrKept", () => {
  it("online when it can, the kept copy with no network, the error with nothing kept", async () => {
    expect(await onlineOrKept(async () => "online", async () => "kept")).toBe("online");
    expect(await onlineOrKept(noNetwork, async () => "kept")).toBe("kept");
    await expect(onlineOrKept(noNetwork, async () => undefined)).rejects.toThrow("Failed to fetch");
  });

  it("a server's error isn't a missing network", async () => {
    await expect(onlineOrKept(() => Promise.reject(new Error("HTTP 500")), async () => "kept")).rejects.toThrow("HTTP 500");
  });
});

describe("withTimeout", () => {
  it("a network that hangs counts as down", async () => {
    vi.useFakeTimers();
    const hanging = withTimeout(new Promise(() => {}), 100);
    vi.advanceTimersByTime(100);
    await expect(hanging).rejects.toBeInstanceOf(OfflineError);
    vi.useRealTimers();
    expect(isNetworkError(new OfflineError())).toBe(true);
  });
});

describe("sessionOnlineOrSaved", () => {
  const saved = async () => ({ data: "kept user", savedAt: "2026-09-25T10:00:00.000Z" });

  it("online: the server's session, nothing wiped", async () => {
    const forget = vi.fn(async () => {});
    expect(await sessionOnlineOrSaved({ online: async () => "user", saved, forget })).toEqual({ data: "user", savedAt: null });
    expect(forget).not.toHaveBeenCalled();
  });

  it("the server saying there's no session wipes the device", async () => {
    const forget = vi.fn(async () => {});
    expect(await sessionOnlineOrSaved({ online: async () => null, saved, forget })).toBeNull();
    expect(forget).toHaveBeenCalledOnce();
  });

  it("no network: the saved session; nothing saved: the error", async () => {
    const forget = vi.fn(async () => {});
    expect(await sessionOnlineOrSaved({ online: noNetwork, saved, forget })).toEqual({ data: "kept user", savedAt: "2026-09-25T10:00:00.000Z" });
    await expect(sessionOnlineOrSaved({ online: noNetwork, saved: async () => undefined, forget })).rejects.toThrow();
    expect(forget).not.toHaveBeenCalled();
  });

  it("a server error neither signs out nor wipes", async () => {
    const forget = vi.fn(async () => {});
    await expect(sessionOnlineOrSaved({ online: () => Promise.reject(new Error("HTTP 502")), saved, forget })).rejects.toThrow("HTTP 502");
    expect(forget).not.toHaveBeenCalled();
  });
});
