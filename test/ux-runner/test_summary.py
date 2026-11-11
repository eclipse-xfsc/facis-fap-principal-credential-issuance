# Copyright (c) 2026 LEANEA GmbH and others.
#
# This program and the accompanying materials are made available under the
# terms of the Apache License, Version 2.0 which is available at
# https://www.apache.org/licenses/LICENSE-2.0.
#
# SPDX-License-Identifier: Apache-2.0
#
# Prepared with AI-assisted tools and reviewed by the author.
# Assisted-by: AI

"""Protect the acceptance summary from zero-test and incomplete-run passes."""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('ux_runner', ROOT / 'scripts/run-ux-bdd.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

def passing():
    return [{'tags': ['pci-ux'], 'elements': [
        {'type': 'scenario', 'name': name, 'status': 'passed', 'steps': [{'result': {'status': 'passed'}}]}
        for name in sorted(runner.EXPECTED)]}]

class SummaryTests(unittest.TestCase):
    def test_complete_run(self):
        result = runner.summarize(passing())
        self.assertEqual((result['status'], result['passedScenarios']), ('PASS', 12))

    def test_zero_run_fails(self):
        self.assertEqual(runner.summarize([])['status'], 'FAIL')

    def test_missing_scenario_fails(self):
        value = passing();value[0]['elements'].pop()
        self.assertEqual(runner.summarize(value)['status'], 'FAIL')

    def test_duplicate_scenario_fails(self):
        value = passing();value[0]['elements'].append(copy.deepcopy(value[0]['elements'][0]))
        self.assertEqual(runner.summarize(value)['status'], 'FAIL')

    def test_failed_step_fails(self):
        value = passing();value[0]['elements'][0]['steps'][0]['result']['status'] = 'failed'
        self.assertEqual(runner.summarize(value)['status'], 'FAIL')

    def test_skipped_scenario_fails(self):
        value = passing();value[0]['elements'][0]['status'] = 'skipped'
        self.assertEqual(runner.summarize(value)['status'], 'FAIL')

    def test_unexpected_selection_fails(self):
        value = passing();value[0]['elements'].append({'type': 'scenario', 'name': 'Unexpected', 'status': 'passed'})
        self.assertEqual(runner.summarize(value)['status'], 'FAIL')

    def test_unselected_deletion_does_not_count(self):
        value = passing();value.append({'tags': ['ux'], 'elements': [{'type': 'scenario', 'name': 'Participant administrator deletes a disposable tenant', 'status': 'skipped'}]})
        self.assertEqual(runner.summarize(value)['status'], 'PASS')

    def test_scenario_level_tag_is_accepted(self):
        value = passing();value[0]['tags'] = []
        for scenario in value[0]['elements']:scenario['tags'] = ['pci-ux']
        self.assertEqual(runner.summarize(value)['status'], 'PASS')

    def test_no_step_results_fails(self):
        value = passing();value[0]['elements'][0]['steps'] = [{}]
        self.assertEqual(runner.summarize(value)['status'], 'FAIL')

if __name__ == '__main__':
    unittest.main()
