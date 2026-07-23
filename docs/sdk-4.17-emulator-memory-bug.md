# Bug report: SDK 4.17 emulator firmware ignores `ModdableCreationRecord` memory sizes

**Summary:** JavaScript (Alloy/Moddable) apps that pass custom `stack`/`slot`/`chunk` sizes to
`moddable_createMachine()` abort at launch with `xsPlatform.c:125> fxAbort memory full:` on the
SDK 4.17 emulator, because the firmware silently ignores the requested sizes and always uses the
default 32 KB static machine. The root cause is already fixed on PebbleOS `main`, but SDK 4.17
still ships emulator firmware built from v4.17.0, which predates the fix. Requesting an SDK
release with emulator firmware ≥ v4.29.0.

## Environment

- pebble-tool v5.0.39, SDK 4.17 (active), macOS (Apple Silicon)
- `pebble install --emulator emery` (emulator firmware identifies as v4.17.0)
- App: JS mod (mcrun/XSA) using the PIU framework, with a C bootstrap (`mdbl.c`) passing:

```c
ModdableCreationRecord creation = {
  .recordSize = sizeof(ModdableCreationRecord),
  .stack = 4096,
  .slot  = 32768,
  .chunk = 32768
};
moddable_createMachine(&creation);
```

## Symptom

- App builds cleanly and installs, then immediately logs `fxAbort memory full` and hangs the
  emulator firmware (subsequent `pebble ping` / `pebble screenshot` time out until the QEMU
  process is killed and storage wiped).
- The same app binary and creation record work correctly on the SDK 4.9.127 emulator, where the
  requested pool sizes are honored.
- Enabling `kModdableCreationFlagLogInstrumentation` on the 4.17 emulator confirms the record is
  ignored — at the abort the VM reports the *default* pools despite the explicit record:
  `Chunk available: 8192, Slot available: 8176, Stack available: 6144` (i.e. the default
  creation: chunk 8192, heap 512 slots, stack 384 slots, 32 KB static). This app's real peak
  usage (measured on 4.9.127) is ~21.7 KB slot + ~16.9 KB chunk, so it can never fit the 32 KB
  static default.

## Root cause

In firmware v4.17.0, `src/fw/applib/moddable/moddable.c` (`moddable_createMachine` syscall)
declares a **shadowing** local inside the size-override branch:

```c
struct xsCreationRecord creation = *defaultCreation;   // outer
if (NULL != cr) {
    ...
    if (stack || slot || chunk) {
        ...
        struct xsCreationRecord creation = *defaultCreation;   // <-- shadows the outer variable
        creation.stackCount = stack / sizeof(xsSlot);          //     all writes discarded
        creation.initialHeapCount = slot / sizeof(xsSlot);
        creation.initialChunkSize = chunk;
        ...
    }
    ...
}
xsMachine *the = modCloneMachine(&creation, NULL);     // uses the untouched outer defaults
```

All customizations are applied to the inner copy, which goes out of scope; `modCloneMachine`
always receives the defaults. (A secondary issue in the same version: the `fxBuildFFI` branch
resizes the initial pools to fill `staticSize` exactly without zeroing `staticSize`, leaving no
headroom for machine overhead — also already fixed on `main`.)

This was fixed upstream in coredevices/pebbleos commit `76cd7328`
("moddable: fix ffi memory crash and memory allocation", 2026-07-03), first included in the
v4.29.0 firmware release (2026-07-17). Real watches on current firmware are therefore fine —
only the SDK-bundled emulator firmware is affected.

## Request

Publish an SDK update whose emulator images (`qemu_micro_flash.bin`) are built from firmware
≥ v4.29.0, so that JS apps needing more than the 32 KB default can be developed in the emulator.

## Workaround (for anyone else hitting this)

The default `txCreation` for app machines is plain ROM data in the emulator image. In
`SDKs/4.17/sdk-core/pebble/emery/qemu/qemu_micro_flash.bin` the struct
`{8192, 1024, 512, 64, 384, 32, 32, 53, 3, 1024, 17, 32768}` (twelve little-endian int32s) is at
offset `0x117230`; patching the final value (`staticSize`, offset `0x117230 + 44`) from `32768`
to `65536` raises the cap and lets larger apps run (growth happens within the static region).
Values much larger (e.g. 96 KB) starve the kernel heap the machine is allocated from and hang
the emulator; 64 KB works. Back up the image first.
