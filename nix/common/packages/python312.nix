{pkgs}: let
  python = pkgs.python312;
in
  if pkgs.stdenv.hostPlatform.system != "aarch64-darwin"
  then python
  else
    python.override {
      packageOverrides = final: prev: {
        backrefs = prev.backrefs.overridePythonAttrs (old:
          pkgs.lib.optionalAttrs (old.version == "6.2") {
            # Backrefs 6.2 times regex callbacks using wall time, but regex enforces
            # a CPU-time budget. Build contention can prevent the expected timeout.
            # Deselect only this direct regex test; retain the other 566 checks.
            # Revisit/remove when backrefs moves past 6.2 or fixes this test.
            pytestFlags =
              (old.pytestFlags or [])
              ++ [
                "--deselect=tests/test_bregex.py::TestExceptions::test_timeout"
              ];
          });
      };
    }
