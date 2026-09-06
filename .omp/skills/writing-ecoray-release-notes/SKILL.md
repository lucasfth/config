---
name: writing-ecoray-release-notes
description: Use when Lucas asks for EcoRay release notes, a changelog, a main-to-dev summary, sales-facing deployment communication, or copy-paste-ready Slack release notes.
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

## Slack delivery

When Lucas asks for a file that can be pasted into Slack with formatting preserved:

- Create `release-notes-slack.html` in the repository root.
- Use semantic HTML: `<strong>` for emphasis, `<ul><li>` for bullets, and `<code>` for commit IDs.
- Never create a plaintext `.md` or `.txt` file for formatted Slack pasting. Slack does not render pasted Markdown and will show literal asterisks.
- Tell Lucas to open the HTML file in Chrome or Safari, then press **⌘A**, **⌘C**, and paste into Slack.
- Replace a prior generated `release-notes-slack.md` file; do not leave the broken alternative behind.

## Checklist

- [ ] Danish prose; operational impact before technical detail.
- [ ] Every sales-facing consequence, changed customer talking point, and no-workflow-change claim is explicit.
- [ ] No unsupported test or deployment claims.
- [ ] Complete selected-range commit list.
- [ ] HTML rich-text file, if Slack-ready output was requested.
