/**
 * Coordinates saving in the post editor, so that no click, keystroke or autosave can corrupt another one.
 *
 *  - One save at a time. `begin()` claims the gate synchronously and hands out a ticket, or returns `null` when a save is already
 *    running. Two clicks — or a click and the autosave — can therefore never both start; a second save of a brand-new post would
 *    otherwise create a second, duplicate post with the same address.
 *  - Edits made while a save is running are never lost. `edited()` is called on every change; when the save finishes,
 *    `untouched(ticket)` says whether the text on screen is still exactly what was saved. If it is not, the screen keeps the newer
 *    text and stays "unsaved" instead of being overwritten by the older copy.
 *  - A save that failed is not retried by the autosave until something has been typed again (`retryable()`), so being offline does
 *    not produce an error every three seconds.
 */
export interface SaveTicket {
  readonly revision: number;
}

export interface SaveGate {
  /** Claims the gate; `null` when another save is running. */
  begin(): SaveTicket | null;
  /** Releases the gate. Only the holder of the current ticket can release it. */
  end(ticket: SaveTicket): void;
  /** Remembers that the text changed. */
  edited(): void;
  /** True when nothing was changed since the ticket was handed out. */
  untouched(ticket: SaveTicket): boolean;
  /** Remembers that saving this exact text failed. */
  failed(ticket: SaveTicket): void;
  /** False until the text changes again after a failed save. */
  retryable(): boolean;
  readonly busy: boolean;
}

export function createSaveGate(): SaveGate {
  let current: SaveTicket | null = null;
  let revision = 0;
  let failedAt = -1;
  return {
    begin() {
      if (current) return null;
      current = { revision };
      return current;
    },
    end(ticket) {
      if (current === ticket) current = null;
    },
    edited() {
      revision += 1;
    },
    untouched: (ticket) => ticket.revision === revision,
    failed(ticket) {
      failedAt = ticket.revision;
    },
    retryable: () => failedAt !== revision,
    get busy() {
      return current !== null;
    }
  };
}
