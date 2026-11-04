import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
}

/** A radio group drawn as joined buttons. Arrow keys and screen-reader semantics come from the native inputs. */
export function Segmented<T extends string>({ legend, name, value, options, onChange }: SegmentedProps<T>) {
  return (
    <fieldset className="field">
      <legend className="legend">{legend}</legend>
      <div className="segmented">
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => {
                onChange(option.value);
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export function Stepper({ label, value, min, max, onChange }: StepperProps) {
  const id = useId();
  return (
    <div className="field" role="group" aria-labelledby={id}>
      <span id={id} className="field__label">
        {label}
      </span>
      <div className="stepper">
        <button
          type="button"
          className="btn"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => {
            onChange(value - 1);
          }}
        >
          −
        </button>
        <output aria-live="polite">{value}</output>
        <button
          type="button"
          className="btn"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => {
            onChange(value + 1);
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

interface SwitchProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ label, hint, checked, onChange }: SwitchProps) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <span>
        {label}
        {hint ? <span className="field__hint"> {hint}</span> : null}
      </span>
    </label>
  );
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

function trapFocus(event: KeyboardEvent<HTMLElement>, container: HTMLElement | null): void {
  const items = Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A dialog that traps focus, closes on Escape and hands focus back to whatever opened it. */
export function Modal({ title, onClose, children }: ModalProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    // Start on the first control in the content; fall back to the Close button for content-free dialogs.
    (
      body.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    )?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Tab') {
      trapFocus(event, panel.current);
    }
  };

  return (
    <div className="modal-backdrop" onKeyDown={onKeyDown} role="presentation">
      <div ref={panel} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Close
          </button>
        </div>
        <div ref={body} className="stack">
          {children}
        </div>
      </div>
    </div>
  );
}
