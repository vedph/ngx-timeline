/**
 * Styles shared by the timeline HTML controls (toolbar and custom range).
 */
export const TIMELINE_CONTROL_STYLES = `
  .tm-btn {
    font: inherit;
    font-size: 0.875rem;
    line-height: 1.25;
    padding: 0.25rem 0.625rem;
    color: var(--tm-control-fg);
    background: var(--tm-control-bg);
    border: 1px solid var(--tm-control-border);
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }
  .tm-btn:hover:not([aria-disabled='true']) {
    background: var(--tm-control-hover-bg);
  }
  .tm-btn[aria-disabled='true'] {
    cursor: default;
    opacity: 0.6;
  }
  .tm-btn:focus-visible,
  select:focus-visible,
  input[type='range']:focus-visible {
    outline: 2px solid var(--tm-focus-color);
    outline-offset: 1px;
  }
`;
