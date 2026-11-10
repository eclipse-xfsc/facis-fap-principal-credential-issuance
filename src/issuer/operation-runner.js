/** Run one UI operation: progress flag, notice reset and error normalisation. */
export function createPciOperationRunner(state, normalizeError, recoverInput) {
  return async function run(operation) {
    state.busy.value = true;
    state.notice.value = '';
    try {
      return await operation();
    } catch (error) {
      state.error.value = normalizeError(error);
      if (error?.code === 'PCI-SR2-INPUT-LOST') {
        try {
          await recoverInput();
        } catch {
          /* Keep the original error visible if recovery also fails. */
        }
      }
    } finally {
      state.busy.value = false;
    }
  };
}
