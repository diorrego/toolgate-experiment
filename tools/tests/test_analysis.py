import importlib.util
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).parents[1]))
import analysis
spec = importlib.util.spec_from_file_location('export_results',Path(__file__).parents[1]/'export-results.py')
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)

def result(data):
    return {'content':[{'type':'text','text':json.dumps(data)}]}

class AnalysisTests(unittest.TestCase):
    def test_ambiguity_recall_is_separate_from_automatic_selection(self):
        record={'mode':'go-binary-first','hostTools':[{'tool':'prepare_action','status':'completed',
                'result':result({'status':'needs_choice','operation_id':'op','candidates':[{'tool_id':'read'},{'tool_id':'other'}]})}],
                'tools':[], 'trace':[{'kind':'sdk_remote','attempts':1,'durationMs':100,
                'hops':[{'jevCalls':22,'jevMs':1000,'selectorMs':90,'jevMaxConcurrent':22}]}]}
        record['grade']=analysis.grade(record,{'tool':'read','arguments':{}})
        quality=analysis.statistics([record])['selection_quality']
        self.assertEqual(quality['automatic_choices'],0)
        self.assertEqual(quality['ambiguities'],1)
        self.assertEqual(quality['ambiguities_containing_expected_tool'],1)
        self.assertFalse(record['grade']['expected_query'])

    def test_parallel_attempts_do_not_replace_wall_latency(self):
        record={'mode':'go-binary-first','status':'completed','finalAnswer':'Synthetic answer',
                'answerCompleteMs':2000,'trace':[{'kind':'sdk_remote','attempts':1,'durationMs':850,
                'hops':[{'jevCalls':22,'jevMs':11000,'selectorMs':800,'jevMaxConcurrent':22,
                         'jevUsageCalls':22,'jevInputTokens':2200,'jevOutputTokens':440}]}]}
        s=analysis.statistics([record])
        self.assertEqual(s['p50_final_ms'],2000)
        self.assertEqual(s['selector_measurements']['batch_wall_p50_ms'],800)
        self.assertEqual(s['selector_measurements']['max_concurrent_requests'],22)
        self.assertEqual(s['jev_attempts'],22)
        self.assertAlmostEqual(analysis.api_cost(record)['jev_usd'],2200*.042/1e6)

    def test_host_binding_and_failure_are_not_hidden(self):
        record={'hostTools':[{'tool':'prepare_action','status':'completed','result':result({'status':'ready','operation_id':'bound','selected_tool':{'tool_id':'read'}})}],
                'tools':[{'tool':'execute_read_action','status':'failed','arguments':{'operation_id':'wrong','arguments':{}},'result':result('failed')}]}
        grade=analysis.grade(record,{'tool':'read','arguments':{}})
        self.assertTrue(grade['initial_tool_matches']);self.assertFalse(grade['expected_query']);self.assertEqual(grade['tool_errors'],1)
        self.assertEqual(analysis.statistics([record])['mcp_calls'],2)

    def test_cost_partitions_cache_and_counts_failed_usage(self):
        record={'mode':'direct','model':'gpt-6-astra','status':'timeout','tokenUsage':{'total':{'inputTokens':1000,'cachedInputTokens':600,'cacheWriteInputTokens':100,'outputTokens':100,'reasoningOutputTokens':40}}}
        self.assertAlmostEqual(analysis.api_cost(record)['total_usd'],.00985)
        self.assertIsNone(analysis.api_cost(record)['actual_billed_usd'])
        self.assertIsNone(analysis.api_cost({'mode':'go'})['jev_usd'])

    def test_missing_attempt_usage_remains_unknown(self):
        hop={'jevCalls':1,'jevUsageCalls':1,'jevInputTokens':1000,'jevOutputTokens':50}
        record={'mode':'go','trace':[{'kind':'sdk_remote','attempts':2,'hops':[hop,hop]}]}
        self.assertAlmostEqual(analysis.api_cost(record)['jev_usd'],.000084)
        record['trace'][0]['hops'].pop()
        self.assertIsNone(analysis.api_cost(record)['jev_usd'])

    def test_provider_defaults_are_explicit(self):
        self.assertFalse(analysis.arguments_match('read',{'limit':5},{'limit':5,'page':1}))
        self.assertTrue(analysis.arguments_match('read',{'limit':5},{'limit':5,'page':1},{'read':{'page':1}}))

    def test_public_export_removes_private_payloads_and_recomputes_numbers(self):
        secret='PRIVATE_SENTINEL_DO_NOT_EXPORT'
        cases=[{'id':f'Q{i:02}','question':'Read '+secret,'tool':'read','arguments':{'id':secret}} for i in range(1,31)]
        record={'caseId':'Q01','mode':'direct','model':'gpt-6-astra','status':'completed','answerCompleteMs':1200,'turnCompleteMs':1201,'finalAnswer':secret,
                'tools':[{'tool':'read','status':'completed','arguments':{'id':secret},'result':result({'value':secret})}],
                'resources':{'provider':{'cpuMs':2,'peakRssKiB':10,'private':secret}},
                'tokenUsage':{'total':{'inputTokens':1000,'cachedInputTokens':0,'cacheWriteInputTokens':0,'outputTokens':100}},'trace':[]}
        report={'runId':'test','state':'finished','language':'en','modes':list(analysis.MODES),'primaryBoundary':'full answer','environment':{'jevModel':'jev-1.13.0','password':secret,'dataset':secret},'hashes':{},'cases':cases,'records':[record],'reviewNotes':[secret]}
        public=exporter.sanitize(report,{'cases':[{**c,'question':'Read {{id}}','arguments':{'id':'{{id}}'}} for c in cases]})
        self.assertNotIn(secret,json.dumps(public))
        original,_=analysis.analyze(report);recomputed,_=analysis.analyze(public)
        self.assertEqual(original['modes'],recomputed['modes'])
        self.assertEqual(recomputed['expected_records'],150)
        self.assertFalse(recomputed['all_expected_recorded'])

if __name__=='__main__':unittest.main()
