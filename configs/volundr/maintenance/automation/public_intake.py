"""Deterministic admission of public-origin task references, never mixed vault notes.

The initial publisher allowlist is deliberately tiny, not a cloud classification
heuristic. Expand only after source/corpus review; ordinary new archives from the
same verified publisher are discovered automatically.
"""
import json
import re
from urllib.parse import urlsplit

PREFIX='archives/'
ORIGINS={'commitmono.com':'editor-typography'}
BAD=re.compile(r'personal-notes|ecoray|klaus|payroll|salary|credential|password|secret|security|health|medical|private|confidential|100\.\d+\.\d+\.\d+|/Users/|/home/|[\w.+-]+@[\w.-]+\.[a-z]{2,}',re.I)


def admit(value):
    name=value['filename'];text=value['content']
    if not re.fullmatch(r'archives/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md',name):raise ValueError('Not public archive material')
    if len(text.encode())>16000 or BAD.search(text):raise ValueError('Mixed or sensitive public archive')
    origin=re.search(r'\*\*URL:\*\* \[([^\]]+)\]\(([^)]+)\)',text)
    if not origin or origin[1]!=origin[2]:raise ValueError('Public origin provenance absent')
    url=urlsplit(origin[1])
    if url.scheme!='https' or url.hostname not in ORIGINS or url.username or url.password or url.query or url.fragment:
        raise ValueError('Unverified public publisher')
    if 'type: reference\n' not in text or '#archived #web #reference' not in text or '## Summary\n' not in text:
        raise ValueError('Archive provenance shape differs')
    if '## Source\n\nFull content scraped from '+origin[1] not in text:raise ValueError('Incomplete publisher provenance')
    if not any(heading in text for heading in ('### Recommended Settings','### VS Code Setup')):raise ValueError('No ordinary task material')
    return {'kind':'verified-public-origin','origin':origin[1],'topic':ORIGINS[url.hostname],
        'source_sha256':value['sha256'],'not_public_by_frontmatter_alone':True}


def names(api):
    result=api('vault_list',{'pattern':'archives/*.md'})
    values=result.get('files',[])
    if len(values)>256:raise ValueError('Public discovery inventory bound')
    return sorted(n for n in values if isinstance(n,str) and n.startswith(PREFIX) and 'commit-mono' in n)


def target(name):
    return 'tech/learning/public-'+name.rsplit('/',1)[1]


def template(name,today):
    title='Public task synthesis: '+name.rsplit('/',1)[1][11:-3].replace('-',' ')
    return ('---\ntitle: '+title+'\ntype: task-synthesis\ntags: [task-guidance, typography]\nstatus: active\nupdated: '+today+
        '\ndata_class: public\nsynthesis_scope: ordinary-task\nproducer: public-task-synthesis-v1\n---\n\n# '+title+'\n\n'
        'Source-backed ordinary editor typography guidance; not operational policy.\n')