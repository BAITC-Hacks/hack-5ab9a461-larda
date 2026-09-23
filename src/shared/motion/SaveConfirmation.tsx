export interface SaveConfirmationProps {
  message: string | null;
}

/** Keep the live region mounted. The caller owns the message lifetime. */
export function SaveConfirmation({ message }: SaveConfirmationProps) {
  return (
    <div className="motion-confirmation" role="status" aria-live="polite" aria-atomic="true">
      {message && <span key={message} className="motion-confirmation__message">
        <span aria-hidden="true">✓</span><span>{message}</span>
      </span>}
    </div>
  );
}
