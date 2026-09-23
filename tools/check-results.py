"""Recompute the published result tables without private provider data or paid calls."""
import json
import argparse
from pathlib import Path
from analysis import analyze
from report import markdown


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--name', choices=['english','binary'], default='english')
    name = parser.parse_args().name
    report = json.loads((root/f'results/{name}-observations.json').read_text())
    review = json.loads((root/'results'/('review-notes.json' if name=='english' else 'binary-review-notes.json')).read_text())
    if not report.get('sanitized') or review['runId'] != report['runId']:
        raise ValueError('Expected sanitized observations and matching review notes')
    report['reviewNotes'] = review['notes']
    summary, _ = analyze(report)
    if report['state'] != 'finished' or not summary['all_expected_recorded']:
        raise ValueError('The published primary matrix is incomplete')
    if summary != json.loads((root/f'results/{name}/summary.json').read_text()):
        raise ValueError('Published summary differs from the observations')
    if markdown(report, summary) != (root/f'results/{name}/report.md').read_text():
        raise ValueError('Published report differs from the observations')
    print('Recomputed all 150 public observations: summary and report match exactly')


if __name__ == '__main__':
    main()
