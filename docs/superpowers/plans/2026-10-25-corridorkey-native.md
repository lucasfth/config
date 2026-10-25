# Native CorridorKey OFX implementation

Approved: native OFX front end + persistent MLX subprocess; single-frame, 720p SDR first version. See main-checkout design `2026-10-25-corridorkey-native-ofx-design.md`. Original wrapper code, BSD OpenFX headers only; no community OFX source copied.

1. Protocol and model worker: fail malformed input, bound payloads, preserve float pixel contract; compare real one-frame inference with the existing batch fixture. Unit tests and real weights run separately.
2. OFX front end: standard C suites, image RAII, serialized per-instance worker, bounded transfer/cache, deadlines, host messages, deterministic out-of-order frames. Compile and exercise via mock host before Resolve.
3. Nix: pinned SDK headers, original bundle, retained runtime notices, install with backup and validation. No unrelated source publication. Do not deploy the separate menu-console fix.
4. Resolve: discover native effect and inspect controls; preview and Deliver render in disposable project. Preserve existing projects. Verify output alpha and logs. Do not claim completion until this passes.

## Checkpoint — not complete

- Protocol is 32-byte little-endian `<8sIIIIfI` plus 1280×720 float32 RGBA. Includes all parameters in the cache key. Worker uses independent single-frame inference, not temporal batch equivalence.
- Real four-frame worker/protocol run passes; deterministic repeated and out-of-order output, matte, linear-sRGB conversion and invalid-pixel refusal tested.
- Compiled mock C++ host dynamically loads the built bundle; adapter-to-worker consistency against the first batch fixture frame passes positive/negative strides with real inference, balanced image release and specific failure messages. This is not Resolve acceptance.
- Six installer tests pass, including read-only source, marker rollback and collision/running refusals. Real signed-bundle isolated first/repeat install passes.
- Nix package and ad-hoc signature pass; installed describe-fixed bundle is `/nix/store/9sgdbm6n3k7zyfwb36yg2hiwr5s43lzq-corridorkey-ofx-0.1.0`.
- Standalone protocol fake-engine test observes exactly two Python and two C-stdio inference logs for three requests (identical repeat hits cache; changed mode misses); binary reply length 44,236,824 bytes. Standalone C++ closed-reader test passes with default SIGPIPE disposition and per-pipe suppression.
- Lucas approved `/Library/OFX/Plugins` installation and disposable testing, then explicitly approved the describe fix/reopen. Both installer runs exited 0 and kept rollback backups; Gyroflow binary hash is unchanged. Resolve rejects optional OfxPropPluginDescription; removed with red/green host regression. Resolve now loads the native effect and its controls.
- `hugi` saved (log-confirmed), closed normally, and was not edited in native testing. Disposable project `CorridorKey-Native-5922253efd` contains fixture timeline and native comp. Direct node frame-0 preview alpha matches batch exactly.
- First Deliver attempts were opaque because AddFusionComp graph was not persisted in the timeline table; ImportFusionComp persisted it. Single-frame and four-frame ProRes 4444 Deliver jobs then completed with nontrivial alpha. Four-frame alpha MAEs: 0.00004895,0.00018508,0.00020589,0.00025900. Premultiplied RGB MAEs: 0.00020271,0.00024973,0.00026683,0.00029444. Frame-3 max RGB difference vs temporal batch is 0.10449 at a semi-transparent edge; native stateless vs batch max is 0.10156 there. ProRes vs same native single-frame max <=0.00597, mean <=0.000203. Temporal edge quality remains a limitation, not general equivalence.
- Passing output is ~/Movies/CorridorKey-Native-Tests/render/native-cutout-verified.mov. Lucas explicitly approved Nix native management, retiring only the store-managed batch-menu link, keeping 96441907, publication on current origin/main and tested activation via ask_user. Module/test updates are re-applied but not published or activated yet.
- Native branch is feat/corridorkey-native-ofx; unrelated Pi/Muninn/nix/common edits excluded. Origin/main advanced to 2d487aa4; rebase scoped native commit onto current remote before final build/publication. Keep console fix 96441907 in history; retired menu is no longer the consumer interface.
