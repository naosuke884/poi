import { describe, expect, it } from "vite-plus/test";

import { nextInstallState, type InstallState } from "./install-prompt";

describe("ホーム画面への追加の状態 (HAY-125)", () => {
  it("beforeinstallprompt は 1 回だけ届き、マウントより前の状態でもダイアログを出せるように残す", () => {
    const beforeMount: InstallState = { canPrompt: false, installed: false };
    const received = nextInstallState(beforeMount, "beforeinstallprompt");
    expect(received).toEqual({ canPrompt: true, installed: false });
    // 2 回目が来ても、出せるダイアログは 1 回分のまま
    expect(nextInstallState(received, "beforeinstallprompt")).toEqual(received);
  });

  it("prompt() は 1 回しか使えないので、使ったらダイアログを出せなくする", () => {
    const ready: InstallState = { canPrompt: true, installed: false };
    expect(nextInstallState(ready, "prompt")).toEqual({ canPrompt: false, installed: false });
  });

  it("appinstalled のあとタブはブラウザのままなので、display-mode を読み直さず追加済みにする", () => {
    // installed: false は、display-mode を今読むとブラウザのまま、という意味
    const stillInBrowser: InstallState = { canPrompt: true, installed: false };
    expect(nextInstallState(stillInBrowser, "appinstalled")).toEqual({
      canPrompt: false,
      installed: true,
    });
  });
});
