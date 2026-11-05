export interface ReleasableSession {
  release(): void;
}

export interface SessionState<TSession extends ReleasableSession> {
  /** The session that is currently installed. */
  session: TSession;
  modelIndex: number;
  isLoadingModel: boolean;
  /** Set once the example is cleaned up. */
  disposed: boolean;
}

/**
 * Switches to the model at `modelIndex`. A prepared session is either installed (and the previous
 * one released), or, if the example was cleaned up while it was being prepared, released right away.
 * Overlapping switches are ignored, and a failed switch keeps the current session.
 */
export async function switchSession<TSession extends ReleasableSession>(
  state: SessionState<TSession>,
  modelIndex: number,
  prepare: (modelIndex: number) => Promise<TSession>,
): Promise<void> {
  if (state.disposed || state.isLoadingModel || modelIndex === state.modelIndex) {
    return;
  }
  state.isLoadingModel = true;

  try {
    const prepared = await prepare(modelIndex);

    if (state.disposed) {
      prepared.release();
      return;
    }

    const previous = state.session;
    state.session = prepared;
    state.modelIndex = modelIndex;
    previous.release();
  } catch (error) {
    // Cleaning up while the model is loading can make the loading itself fail.
    if (!state.disposed) {
      throw error;
    }
  } finally {
    state.isLoadingModel = false;
  }
}

/**
 * Marks the example as cleaned up and releases the session that is installed at that point.
 * Calling it again does nothing, so a session is never released twice.
 */
export function disposeSessions<TSession extends ReleasableSession>(
  state: SessionState<TSession>,
): void {
  if (state.disposed) {
    return;
  }
  state.disposed = true;
  state.session.release();
}
