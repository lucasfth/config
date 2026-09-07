---
name: writing-ecoray-release-notes
description: Use when Lucas asks for EcoRay release notes, a changelog, a main-to-dev summary, or sales-facing deployment communication.
---

# Writing EcoRay Release Notes

Produce Danish release notes that explain commercial impact before implementation detail.

## Default scope

- Use `origin/main..origin/dev` unless Lucas names a different range.
- Inspect the commit list and relevant diffs. Do not infer behavior from commit subjects alone.
- Reuse the prior release-note format when Lucas says “like yesterday”; do not ask for the same audience, language, or structure again.
- Do not run tests merely to write release notes. State only verification supported by commits, test output already available, or commands run in this session.

## Required structure

1. **Det ændrer sig for salg**
   - Lead every customer- or workflow-affecting change with what sales should say or do differently.
   - State explicitly when no sales workflow changes.
   - Distinguish new-report behavior from existing saved reports or offers.
2. Product-area sections, grouped by user impact.
3. **Verifikation** with evidence and its limit.
4. **Komplet commitliste** with every commit hash and subject from the selected range.

Keep internal optimization and test-only commits out of the sales section unless they alter visible behavior.

## Default Slack delivery

Every EcoRay release-note request is a Slack-delivery request unless Lucas explicitly asks for another format.

- Create `release-notes-slack.html` in the repository root before replying, even when Lucas only says “Write release notes.”
- Use semantic HTML: `<strong>` for emphasis, `<ul><li>` for bullets, and `<code>` for commit IDs.
- Never return only Markdown/plaintext or ask whether Slack format is wanted. Slack does not render pasted Markdown and will show literal asterisks.
- Never create a plaintext `.md` or `.txt` release-note file.
- Remove a prior generated `release-notes-slack.md` file if present; do not leave the broken alternative behind.
- Tell Lucas to open the HTML file in Chrome or Safari, then press **⌘A**, **⌘C**, and paste into Slack.

### Delivery red flags

- “They did not ask for a file, so inline Markdown is the smallest deliverable.”
- “Creating HTML is slower under a deadline.”
- “I will create the file only after Lucas says the notes are for Slack.”

All three violate the default. Create the HTML artifact first.

## Checklist

- [ ] Danish prose; operational impact before technical detail.
- [ ] Every sales-facing consequence, changed customer talking point, and no-workflow-change claim is explicit.
- [ ] No unsupported test or deployment claims.
- [ ] Complete selected-range commit list.
- [ ] `release-notes-slack.html` created with rich-text HTML, regardless of whether Slack was named.
