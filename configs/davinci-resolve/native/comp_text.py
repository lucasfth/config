"""Extract one named tool from a Resolve-written composition or macro."""
import re


def tool_block(text, name):
    matches = list(re.finditer(r'(?<![\w])' + re.escape(name) + r'\s*=\s*[\w.]+\s*\{', text))
    if len(matches) != 1:
        raise ValueError('Missing or ambiguous tool: ' + name)
    start = matches[0].start()
    depth, quoted, escape = 0, False, False
    for index in range(text.index('{', start), len(text)):
        char = text[index]
        if quoted:
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    raise ValueError('Unterminated tool: ' + name)
