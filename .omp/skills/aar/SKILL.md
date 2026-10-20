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

Use the requested task or session scope. When Lucas asks to "just write the AAR", deliver the substantive review in chat, not another completion report or a promise to write it. Review the existing conversation and incident record first; retrieve only evidence needed to resolve a material gap. Do not reopen completed implementation, rerun infrastructure checks, publish changes or launch another backup merely to write the review. Label prior test results as historical rather than implying fresh execution. State what is unavailable rather than reconstructing it as fact. Answer briefly:

1. **What was supposed to happen?** Name the instruction, plan, and expected result.
2. **What actually happened?** Include the final state, corrections, partial work, and failures. Distinguish source edits, commits, publication, loaded configuration, and observed behavior.
3. **Why was there a difference?** Give the supported mechanism. Label an unconfirmed cause as a hypothesis and name a check that could confirm it. "Be more careful" is not a cause.
4. **What should we repeat or change?** Identify a specific condition and response that another agent could apply. Include useful successes without inventing praise.

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

Lead the final response with the four answers and concrete lessons, using short headings and bullets. Include proposed fixes only where a durable change is needed; end with actual fix status and the verified note path. A saved-file announcement or checklist of completed work is not the requested review. If storage fails, still deliver the review in chat and clearly say it was not persisted. A stored lesson is not an applied fix; an applied fix is not proof a future session loaded it.

Attribution and source-license scope are recorded in [ATTRIBUTION.json](ATTRIBUTION.json). The adapted AAR Loop material retains its [MIT notice](LICENSE.aar-loop); that notice does not relicense the inherited Huginn material.
