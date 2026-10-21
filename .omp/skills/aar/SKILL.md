---
name: aar
description: Use when Lucas explicitly requests /aar, an AAR, or an after-action review of a task or session.
metadata:
  status: active
  applies-to: "Huginn and Loki; use only available, authorized memory tools"
  requires: "Session evidence and Muninn writing rules; see references/muninn.md"
  provenance: "Combines the former Huginn retro with AAR Loop; separate source rights in ATTRIBUTION.json"
---
# After-action review

Only run when explicitly requested. `/aar [focus]` requests a review and its Muninn record, not permission to change instructions or publish anything. `/retro` is reserved for another workflow and must not trigger this skill. Do not run on session end, failure, stop, or switch automatically.

## Review the evidence

Use the requested task or session scope. Deliver the substantive review in chat for every AAR request, including requests bundled with Muninn or company-brain updates; storage receipts supplement the review, never replace it. Explicit requests to update those knowledge stores authorize the named documentation work, not unrelated runtime or instruction changes. Review the existing conversation and incident record first; retrieve only evidence needed to resolve a material gap. Do not reopen completed implementation, rerun infrastructure checks, publish changes or launch another backup merely to write the review. Label prior test results as historical rather than implying fresh execution. State what is unavailable rather than reconstructing it as fact. Reconcile earlier success claims against the underlying receipts before recording them: a CLI reply from an embedded runner does not establish serving-gateway recovery, and an old background failure is not invalidated by a later test of a different execution path. Correct any overstatement explicitly in chat and in each requested knowledge store. Answer briefly:

1. **What was supposed to happen?** Name the instruction, plan, and expected result.
2. **What actually happened?** Include the final state, corrections, partial work, and failures. Distinguish source edits, commits, publication, loaded configuration, and observed behavior.
3. **Why was there a difference?** Give the supported mechanism. Label an unconfirmed cause as a hypothesis and name a check that could confirm it. "Be more careful" is not a cause.
4. **What should we repeat or change?** Identify a specific condition and response that another agent could apply. Include useful successes without inventing praise.

When a decisive receipt is condensed or missing after compaction, retrieve the saved output or targeted session-history entry before assigning its evidence grade. Recover the original result rather than rerunning production solely for documentation. If recovery is unavailable, distinguish an earlier assistant-reported result from retained raw evidence; missing output alone neither proves failure nor independently verifies success. In particular, a successful wrapper exit does not prove its nested SSH command, HTTP request or stream assertions passed.

Extract up to three checkable lessons. Zero lessons is valid. Search existing lessons and guidance first; if a rule already covers the failure, investigate retrieval, execution, or enforcement instead of adding a duplicate. Session summaries may contain facts that do not warrant a durable lesson.

## Propose fixes, do not infer approval

For each lesson that needs a durable change, present:

- **Evidence and cause:** observed result, relevant correction, and any uncertainty.
- **Target and edit:** exact canonical file plus the proposed text or patch. Never target a generated profile or deployed copy instead of its source.
- **Verification:** a regression check and how to confirm the changed instruction is actually loaded by each intended consumer.
- **Status:** proposed, approved, applied, or verified-loaded. Record publication and consumer pin state separately.

Applying fixes requires separate approval for the named edit. Bare `/aar`, generic "fix it", silence, and approval to store the review are not blanket permission to modify rules, commit, push, deploy, or update remote consumers. Context-only lessons need no fix plan. Project trust is not write authorization or a tool-execution sandbox.

## Record and report

Use [the Muninn storage procedure](references/muninn.md). Do not create a LESSONS.md or another parallel memory log. Preserve the daily session-note convention, existing metadata, prior entries, and index links. Never include credentials or unnecessary private details in a lesson.

For a bundled Muninn/AAR/company-brain update, first read the existing audit and canonical platform overview in each requested store. Reuse exact paths from returned links or listings rather than guessing filename case. Apply one consistent status and evidence boundary to the audit, overview and index: updating an audit alone leaves the canonical overview misleading. Preserve older specifications under an explicit historical heading or notice, and link the current audit from the overview. Use revision-locked remote writes where available and read back each changed external target. Report each store separately, distinguishing canonical local-file persistence, API availability, remote publication and backup state; none implies the others.

Lead the final response with the four answers and concrete lessons, using short headings and bullets. Include proposed fixes only where a durable change is needed; end with actual fix status and the verified note path. A saved-file announcement or checklist of completed work is not the requested review. If storage fails, still deliver the review in chat and clearly say it was not persisted. A stored lesson is not an applied fix; an applied fix is not proof a future session loaded it.

Attribution and source-license scope are recorded in [ATTRIBUTION.json](ATTRIBUTION.json). The adapted AAR Loop material retains its [MIT notice](LICENSE.aar-loop); that notice does not relicense the inherited Huginn material.
