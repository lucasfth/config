import unittest
import synthesis_consumer as consumer

class AlertTests(unittest.TestCase):
    def test_stale_results_emit_once_and_recovery_emits(self):
        receipt={'status':'complete','after':None,'pending':{},'overflow':{},
                 'report':{'items':[{'filename':'tech/fixture.md','status':'stale','registration_id':'fixture',
                                    'warnings':[{'filename':'tech/source.md','reason':'revision_changed'}]}]}}
        first=consumer._alert(receipt,{})
        self.assertTrue(first['emit'])
        second=consumer._alert(receipt,first);self.assertFalse(second['emit'])
        receipt['alert']=first
        self.assertIn('1 stale',consumer.alert_text(receipt))
        recovered={'status':'complete','after':None,'pending':{},'report':{'items':[]}}
        recovered['alert']=consumer._alert(recovered,second)
        self.assertTrue(recovered['alert']['emit'])
        self.assertIn('recovered',consumer.alert_text(recovered))
    def test_changed_revision_finding_realerts_but_unchanged_does_not(self):
        receipt={'status':'complete','after':None,'pending':{},'report':{'items':[
          {'filename':'tech/a.md','status':'stale','registration_id':'old','warnings':[]}]}}
        first=consumer._alert(receipt,{})
        receipt['report']['items'][0]['registration_id']='new'
        self.assertTrue(consumer._alert(receipt,first)['emit'])

    def test_two_page_cycle_never_recovers_before_page_two_reexamined(self):
        stale={'filename':'tech/z.md','status':'stale','registration_id':'late','warnings':[]}
        page1={'status':'partial','after':None,'pending':{},'report':{
            'status':'partial','items':[],'examined_paths':['tech/a.md']}}
        page2={'status':'complete','after':'tech/a.md','pending':{},'report':{
            'status':'complete','items':[stale],'examined_paths':['tech/z.md']}}
        a=consumer._alert(page1,{})
        b=consumer._alert(page2,a);self.assertTrue(b['emit'])
        c=consumer._alert(page1,b);self.assertFalse(c['emit'])
        self.assertTrue(c['stale_findings'])
        d=consumer._alert(page2,c);self.assertFalse(d['emit'])
        e=consumer._alert(page1,d);self.assertFalse(e['emit'])
        page2['report']['items']=[]
        f=consumer._alert(page2,e);self.assertTrue(f['emit']);self.assertFalse(f['stale_findings'])

    def test_stale_on_retry_final_page_survives_cycle_restart(self):
        page={'status':'retry','after':None,'pending':{'tech/x.md':{'status':'incomplete'}},
              'report':{'status':'complete','items':[{'filename':'tech/z.md','status':'stale','warnings':[]}]}}
        first=consumer._alert(page,{})
        self.assertIn('tech/z.md',first['stale_findings'])
        retry={'status':'retry','after':None,'pending':{'tech/x.md':{'status':'incomplete'}},
               'report':{'status':'partial','items':[]}}
        second=consumer._alert(retry,first)
        self.assertIn('tech/z.md',second['stale_findings'])
        self.assertFalse(second['emit'])

if __name__=='__main__':unittest.main()
