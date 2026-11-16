// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { ReplayUploadPanel } from "@/app/nufflizier/ReplayUploadPanel";
import { REPLAY_LIMITS } from "@/domain/replay/limits";

vi.mock("@/lib/readAnalysisResponse", () => ({
  readAnalysisResponse: async (response: Response) => response.json()
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const replay = (name = "match.bbr") => new File(["replay"], name);
function mount(hasReport = false) {
  const props = {
    onReport: vi.fn(),
    onReset: vi.fn(),
    onDownload: vi.fn(),
    hasReport
  };
  render(createElement(ReplayUploadPanel, props));
  const input = document.querySelector(
    'input[name="replay"]'
  ) as HTMLInputElement;
  return { ...props, input };
}
function choose(input: HTMLInputElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("replay upload workflow", () => {
  it("selects a file without transmitting it and rejects invalid replacements without clearing a report", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { input, onReset } = mount(true);
    choose(input, replay());
    expect(screen.getByText(/Ready: match.bbr/)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Analyze Nuffle Luck"
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    choose(input, replay("wrong.txt"));
    expect(screen.getByRole("alert").textContent).toContain(".xml or .bbr");
    const huge = replay();
    Object.defineProperty(huge, "size", {
      value: REPLAY_LIMITS.inputBytes + 1
    });
    choose(input, huge);
    expect(screen.getByRole("alert").textContent).toContain(
      "Maximum size is 4 MB"
    );
    choose(input, new File([], "empty.xml"));
    expect(screen.getByRole("alert").textContent).toContain("empty");
    expect(onReset).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts exactly one dropped file with the same validation and explicit Analyze action", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    mount();
    const dropzone = screen
      .getByText("Choose or drop your replay")
      .closest("div")!;
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [replay("dropped.xml")] }
    });
    expect(screen.getByText(/Ready: dropped.xml/)).toBeTruthy();
    fireEvent.drop(dropzone, { dataTransfer: { files: [replay(), replay()] } });
    expect(screen.getByRole("alert").textContent).toContain("one replay");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels immediately and ignores stale success while a retry completes", async () => {
    const old = deferred<Response>();
    const fresh = deferred<Response>();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    vi.stubGlobal("fetch", fetch);
    const { input, onReport } = mount();
    choose(input, replay());
    fireEvent.click(
      screen.getByRole("button", { name: "Analyze Nuffle Luck" })
    );
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "Cancel analysis" }));
    expect(signal.aborted).toBe(true);
    expect(screen.getByText(/Analysis cancelled/).textContent).toContain(
      "cancelled"
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Analyze Nuffle Luck" })
    );
    old.resolve({ json: async () => ({ id: "old" }) } as Response);
    await Promise.resolve();
    await Promise.resolve();
    expect(onReport).not.toHaveBeenCalled();
    fresh.resolve({ json: async () => ({ id: "fresh" }) } as Response);
    await waitFor(() => expect(onReport).toHaveBeenCalledWith({ id: "fresh" }));
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the selected replay after an error and resets selection and focus for another upload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Service unavailable. Try again."))
    );
    const { input, onReset, onDownload } = mount(true);
    choose(input, replay());
    fireEvent.click(screen.getByRole("button", { name: "Download JSON" }));
    expect(onDownload).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", { name: "Analyze Nuffle Luck" })
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Service unavailable"
      )
    );
    expect(screen.getByText(/Ready: match.bbr/)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Analyze Nuffle Luck"
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Upload Another Replay" })
    );
    expect(screen.getByText("No replay selected.")).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect(onReset).toHaveBeenCalledTimes(2);
  });
});

describe("public sample selection", () => {
  it("does not fetch or submit on selection, and a normal file replaces it", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { input, onReset } = mount(true);
    fireEvent.click(screen.getByRole("button", { name: "Use sample replay" }));
    expect(screen.getByText(/Ready: sample replay/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();
    choose(input, replay("mine.xml"));
    expect(screen.getByText(/Ready: mine.xml/)).toBeTruthy();
    expect(screen.queryByText(/Ready: sample replay/)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads the public bytes only after Analyze and sends a file to the normal API", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(["sample bytes"])
      })
      .mockResolvedValueOnce({ json: async () => ({ id: "sample-result" }) });
    vi.stubGlobal("fetch", fetch);
    const { onReport } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Use sample replay" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Analyze Nuffle Luck" })
    );
    await waitFor(() =>
      expect(onReport).toHaveBeenCalledWith({ id: "sample-result" })
    );
    expect(fetch.mock.calls[0][0]).toBe("/samples/demo1.bbr");
    expect(fetch.mock.calls[1][0]).toBe("/api/nufflizier/analyze");
    expect(fetch.mock.calls[1][1].method).toBe("POST");
    const file = fetch.mock.calls[1][1].body.get("replay") as File;
    expect(file.name).toBe("sample-demo1.bbr");
    expect(file.size).toBe(12);
  });

  it("cancels a pending sample load without sending a late POST", async () => {
    const pending = deferred<Response>();
    const fetch = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetch);
    const { onReport } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Use sample replay" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Analyze Nuffle Luck" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel analysis" }));
    pending.resolve({
      ok: true,
      blob: async () => new Blob(["sample bytes"])
    } as Response);
    await waitFor(() =>
      expect(screen.getByText(/Analysis cancelled/)).toBeTruthy()
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledOnce();
    expect(onReport).not.toHaveBeenCalled();
  });

  it("shows a retryable error for a missing sample without calling the API", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetch);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Use sample replay" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Analyze Nuffle Luck" })
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "sample could not be loaded"
      )
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(
      (
        screen.getByRole("button", {
          name: "Analyze Nuffle Luck"
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
  });
});
