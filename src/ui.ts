export interface ActionSpec {
  label: string;
  primary?: boolean;
  onClick: (btn: HTMLButtonElement) => void;
}

export function actionButtons(specs: ActionSpec[]): HTMLButtonElement[] {
  return specs.map((spec) => {
    const btn = document.createElement("button");
    btn.className = spec.primary ? "btn btn-primary" : "btn";
    btn.textContent = spec.label;
    btn.addEventListener("click", () => spec.onClick(btn));
    return btn;
  });
}
