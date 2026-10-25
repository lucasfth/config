# Muninn write validation and real-note dependency pilot

## Approved goal and scope

Lucas approved the recommended improvements after the Instagram/Muninn comparison. Keep Muninn and its existing preservation and synthesis infrastructure. Implement server-side frontmatter validation and qualify source-backed synthesis on real operational notes. No new scheduler, automatic rewriting, vault migration or whole-index prompt injection.

## Ownership and architecture

The serving source is on Loki under `~/.hermes/mcp-vault-server/`, not this config repository. Stage an exact source copy outside active lifecycle/watchdog inputs. Keep private source, real-note copies and receipts outside Git. Preserve unrelated config changes. The existing `capture_rules.py` module owns the writing contract; `server.py::execute_tool` must invoke its validator before creating directories, preserving previous bytes or writing content.

## Behavior and acceptance

1. For non-private Markdown `vault_write` creates and replacements, require a YAML mapping with unique top-level string keys; nonempty string `title`, `type`, `status`; 2–5 distinct lowercase kebab-case string tags; and a valid ISO calendar date `updated`. Bound the frontmatter and reject YAML aliases. Extra metadata remains allowed. Never echo rejected note bodies into errors.
2. Reject invalid writes as MCP tool errors without changing files, creating directories, adding archive events or invalidating the index. Validator failures fail closed. Valid replacement retains exact-byte preservation. Historical malformed notes stay readable and archive/restore retains exact original bytes. Private and non-Markdown behavior is unchanged; this does not strengthen personal-note authorization.
3. Update tool descriptions to distinguish blocking metadata validation from advisory search-first/capture/link warnings. Do not change authentication, tool names or required argument fields.
4. Prove one failing regression before implementation; run the actual JSON-RPC handler and relevant existing suites in an isolated vault. Update old write fixtures to valid metadata rather than removing their preservation/retrieval assertions. Record unrelated baseline failures separately.
5. Use current MCP reads and exact hashes for a small real-note dependency graph. Only register a summary whose source dependence is explicit and supportable. Test source revision changes, transitive warnings, read/search exposure and no automatic summary rewrite on isolated copies. Do not mutate live factual sources to simulate change. Distinguish deterministic freshness handling from model answer-quality improvement.
6. Record evidence, warnings and remaining gates in the existing canonical maintenance documentation using preservation-enabled MCP, with prior-revision verification. Update `_INDEX.md` with the canonical link (verify the existing link rather than duplicate it).

## Sequence and rollback

- Inventory source, instructions, ownership and current behavior; retain baseline hashes.
- Add one rejection regression, observe failure, implement the validator and pre-write call; extend boundary checks.
- Run relevant existing regression tests and JSON-RPC acceptance, preserving authentication in serving-path tests.
- Run the bounded real-note freshness pilot and record exact sources and limitations.
- Retain the staged candidate, diff, manifest and logs outside active runtime inputs. Source rollback is the retained baseline; never roll back the evidence ledger over newer registrations.

## Approval boundaries

This session authorizes source implementation, isolated tests and the bounded knowledge pilot. It does not authorize commit/push, service restart, live deployment, watchdog expectation changes, scheduler changes, browser reconnection, encrypted-backup publication or readable-snapshot refresh. Live server activation requires separate approval. No claim of fleet model compliance or answer-quality improvement without actual consumer evidence.
