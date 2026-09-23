"""Check the publishable source tree; ignored runtime files are not release files."""
import argparse
import os
from pathlib import Path
import re

EXCLUDED = {'.git','.local','.venv','.tools','node_modules','target','bin','dist','coverage','__pycache__'}


def release_files(root):
    for directory, children, files in os.walk(root):
        children[:] = sorted(name for name in children if name not in EXCLUDED)
        for name in sorted(files):
            if name.endswith(('.pyc','.tgz','.local.json')): continue
            path=Path(directory)/name
            if path.is_symlink(): raise ValueError('Release files must not be symlinks')
            yield path


def check(root):
    failures=[];files=list(release_files(root))
    for path in files:
        rel=path.relative_to(root)
        if path.name.startswith('.env') and path.name!='.env.example': failures.append(str(rel)+': private environment file')
        try:text=path.read_text()
        except UnicodeDecodeError:failures.append(str(rel)+': unexpected binary');continue
        if chr(0x2014) in text:failures.append(str(rel)+': forbidden punctuation')
        if ('/'+'home/') in text or ('/'+'Users/') in text:failures.append(str(rel)+': author-specific path')
        if any(part in ('woku-server','admin') for part in rel.parts):failures.append(str(rel)+': excluded provider source')
        if path.suffix=='.md':
            for target in re.findall(r'\[[^\]]+\]\(([^\s)]+)\)',text):
                if target.startswith(('http://','https://','#','mailto:')):continue
                resolved=(path.parent/target.split('#')[0]).resolve()
                if not resolved.is_relative_to(root.resolve()) or not resolved.exists():failures.append(str(rel)+': broken/outside link '+target)
    for required in ('README.md','Makefile','docs/REPRODUCTION.md','docs/PROVIDER_INTEGRATION.md','shared/contract.lock.json','data/woku-corpus.en.json','tools/run-experiment.mjs'):
        if not (root/required).is_file():failures.append('Missing '+required)
    if failures:raise ValueError('\n'.join(failures))
    return len(files)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);args=parser.parse_args()
    print(f'Checked {check(args.root)} publishable text files: no private paths, excluded provider source, broken local links or forbidden punctuation')
