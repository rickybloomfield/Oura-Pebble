#include <pebble.h>

int main(void) {
  Window *w = window_create();
  window_stack_push(w, true);

  // Fixed-size XS memory pools (no growth): must be large enough upfront.
  // Peak usage measured via instrumentation: ~22KB slot + ~17KB chunk.
  // NOTE: firmware v4.17.0 (shipped in the SDK 4.17 emulator) ignores these
  // values due to a shadowed-variable bug (fixed in v4.29+, so real watches
  // honor them). Our local SDK 4.17 emulator image is hex-patched to raise
  // the default 32KB static cap to 64KB so the app runs there anyway — see
  // docs/sdk-4.17-emulator-memory-bug.md.
  ModdableCreationRecord creation = {
    .recordSize = sizeof(ModdableCreationRecord),
    .stack = 4096,
    .slot = 32768,
    .chunk = 32768
  };
  moddable_createMachine(&creation);

  window_destroy(w);
}
