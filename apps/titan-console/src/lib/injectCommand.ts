/**
 * injectCommand
 *
 * Copies a command string to clipboard and injects it into the operator
 * chat input. Used by action buttons across DecisionTraceBlock,
 * TruthTraceBlock, and InspectorPanel.
 *
 * Single source of truth for the "click action → fill chat" pattern.
 */
export function injectCommand(command: string): void {
  navigator.clipboard.writeText(command);
  const input = document.getElementById('operator-input') as HTMLInputElement | null;
  if (input) {
    input.value = command;
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
