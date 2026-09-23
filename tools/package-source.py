"""Create a checked source archive, excluding installed and private runtime files."""
import argparse
import gzip
import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=root/'.local/toolgate-source.tar.gz')
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('repository_check', root/'tools/check-repository.py')
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    count = checker.check(root)
    files = list(checker.release_files(root))
    output = args.output.resolve()
    if output.is_relative_to(root) and not output.is_relative_to(root/'.local'):
        raise ValueError('Put the archive outside the source tree or inside .local')
    if output.exists():
        raise ValueError('Output already exists; choose a new path to preserve it')
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('xb') as raw:
        with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w') as archive:
                for path in files:
                    content = path.read_bytes()
                    entry = tarfile.TarInfo('toolgate/'+path.relative_to(root).as_posix())
                    entry.size = len(content)
                    entry.mode = 0o644
                    archive.addfile(entry, io.BytesIO(content))
    print(f'Packed {count} checked source files; SHA-256 {hashlib.sha256(output.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    main()
