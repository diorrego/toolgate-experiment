"""Contract drift and generation regression tests, independent of runtime cores."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from tools.contract import build_lock, generate_schema, verify_lock


class ContractTests(unittest.TestCase):
    def test_lock_detects_file_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'source.json').write_text('{}\n')
            lock = build_lock(root, ['source.json'], '0.1.0')
            verify_lock(root, lock)
            (root / 'source.json').write_text('{"changed":true}\n')
            with self.assertRaisesRegex(ValueError, 'source.json'):
                verify_lock(root, lock)

    def test_lock_detects_manifest_tampering(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'source.json').write_text('{}\n')
            lock = build_lock(root, ['source.json'], '0.1.0')
            lock['contract_version'] = '9.0.0'
            with self.assertRaisesRegex(ValueError, 'digest'):
                verify_lock(root, lock)

    def test_generation_rewrites_refs_without_mutating_source(self):
        api = {'components': {'schemas': {'Health': {'type': 'object'},
               'Envelope': {'$ref': '#/components/schemas/Health'}}}}
        before = copy.deepcopy(api)
        generated = generate_schema(api)
        self.assertEqual(generated['$defs']['Envelope']['$ref'], '#/$defs/Health')
        self.assertEqual(api, before)
        self.assertEqual(json.loads(json.dumps(generated)), generated)
