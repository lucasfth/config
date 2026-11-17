#!/usr/bin/env python3
"""Deterministic write-time privacy gate for extracted AAR content.

Scans model-proposed lesson text, evidence and open items BEFORE any candidate
artifact exists. A hit fails closed: the proposed record is quarantined by
record metadata only (source identity + rule ids); no candidate file is written
and the proposal ledger is untouched. Matched secret values are never recorded.

Source-side sensitive-path exclusions (extract.session_path) remain the first
layer; this gate covers credential- and identity-shaped values stated in prose.
Rule additions must stay high-precision: a false positive only delays a review,
a false negative ships a secret into a candidate note.
"""
import re

RULES = (
    ('openai-style-key', re.compile(r'\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b')),
    ('github-token', re.compile(r'\bgh[pousr]_[A-Za-z0-9]{16,}\b')),
    ('slack-token', re.compile(r'\bxox[baprs]-[A-Za-z0-9-]{10,}\b')),
    ('bearer-token', re.compile(r'(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{24,}\b')),
    ('key-assignment', re.compile(
        r"(?i)\b(?:api[-_ ]?key|auth[-_ ]?token|secret|password)\b[\s:=]{1,4}['\"]?[A-Za-z0-9._~+/=-]{16,}")),
    ('hex-basic-auth-pair', re.compile(r'\b[a-fA-F0-9]{32}:[a-fA-F0-9]{32}\b')),
    ('dk-iban', re.compile(r'\bDK[0-9]{2}[A-Z0-9]{14,18}\b')),
    ('cpr-number', re.compile(r'\b\d{6}-\d{4}\b')),
)


def scan_text(text):
    hits = set()
    for rule_id, pattern in RULES:
        if pattern.search(text):
            hits.add(rule_id)
    return sorted(hits)


def gate_proposal(value):
    if not isinstance(value, dict):
        return []
    targets = []
    for lesson in value.get('lessons') or []:
        if isinstance(lesson, dict):
            for field in ('text', 'evidence'):
                body = lesson.get(field)
                if isinstance(body, str):
                    targets.append(body)
    for item in value.get('open_items') or []:
        if isinstance(item, str):
            targets.append(item)
    hits = set()
    for body in targets:
        hits.update(scan_text(body))
    return sorted(hits)