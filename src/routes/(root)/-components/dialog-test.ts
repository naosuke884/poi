/**
 * jsdom に無い <dialog> の showModal() / close() を、テストに要る分だけブラウザの動きに似せて足す。
 * 開くときにその時点のフォーカスを覚えて中の最初の操作できる要素へ移し、閉じるときに覚えた要素へ戻して close を送る
 * (ブラウザと同じく close は後から届ける。同期で送ると、届く順に頼った不具合をテストが見逃す)。
 * フォーカスの閉じ込めや背後の inert は真似しない (それはブラウザの仕事で、ここでは確かめない)
 */
export function installDialogPolyfill() {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal === "function") return;
  const openers = new WeakMap<HTMLDialogElement, Element | null>();
  proto.showModal = function (this: HTMLDialogElement) {
    if (this.open) return;
    openers.set(this, document.activeElement);
    this.setAttribute("open", "");
    this.querySelector<HTMLElement>("button, a[href], input, [tabindex]")?.focus();
  };
  proto.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute("open");
    const opener = openers.get(this);
    if (opener instanceof HTMLElement) opener.focus();
    queueMicrotask(() => this.dispatchEvent(new Event("close")));
  };
}
