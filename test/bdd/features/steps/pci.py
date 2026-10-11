# SPDX-License-Identifier: Apache-2.0
# The shared Executor supplies its base steps; these steps test PCI-specific
# behavior against a deployed environment. No service/crypto/network doubles.
from eu.xfsc.bdd.core.steps import *
from behave import given,when,then
import json,os,subprocess,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]

def fetch(url,headers=None):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers=headers or {}),timeout=20) as r:return r.status,r.read(1048576)
    except urllib.error.HTTPError as e:return e.code,b''

@given('the PCI environment is configured')
def configured(c):
    c.base=c.settings['mainUrl'].rstrip('/')

@when('I request the readiness endpoint')
def ready(c):c.status,c.body=fetch(c.base+'/readyz')

@then('the deployed runtime is ready')
def ready_result(c):assert c.status==200, 'Readiness failed with status '+str(c.status)

@when('I run G0 with an invalid argument')
def invalid(c):
    c.result=subprocess.run(['bash',str(ROOT/'dist/ground-zero.sh'),'--invalid-pci-test'],capture_output=True,timeout=10)

@then('G0 rejects the argument before deployment')
def invalid_result(c):assert c.result.returncode!=0 and b'unknown' in c.result.stderr.lower(), 'Invalid argument was not rejected'

@given('a signed-in "{role}" browser session')
def session(c,role):
    settings=c.settings['sessions'][role]
    c.browser_context=c.browser.new_context(storage_state=settings['stateFile'])
    c.page=c.browser_context.new_page();c.url=settings['url'].rstrip('/');c.page.goto(c.url+'/ui/',wait_until='networkidle')
    response=c.browser_context.request.get(c.url+'/api/v1/auth/session')
    assert response.status==200, 'Session expired; capture it again'

@then('the issuer workspace is usable')
def workspace(c):
    c.page.get_by_role('navigation',name='Workspace sections').wait_for()
    c.page.get_by_role('button',name='Configurations',exact=True).click()
    c.page.get_by_role('heading',name='Credential configurations',exact=True).first.wait_for()
    c.page.get_by_label('Search configurations').fill('bdd-no-such-configuration')
    assert c.page.get_by_text('No configurations match these filters.').is_visible(), 'Search did not filter the pre-seeded configurations'
    c.page.get_by_label('Search configurations').fill('')

@when('the Alpha session requests Beta issuer administration')
def cross_tenant(c):
    c.response=c.browser_context.request.get(c.url+'/api/v1/tenants/'+c.settings['betaTenantId']+'/credential-configurations')

@then('access is denied without returning Beta data')
def denied(c):assert c.response.status in [401,403,404], 'Cross-tenant access was allowed'

@then('an ordinary principal cannot administer configurations')
def principal_denied(c):
    response=c.browser_context.request.post(c.url+'/api/v1/tenants/'+c.settings['alphaTenantId']+'/credential-configurations',data={'data':{}},headers={'Origin':'/'.join(c.url.split('/')[:3])})
    assert response.status in [401,403,404], 'Ordinary principal reached configuration mutation'

@then('the public issuer metadata belongs to Alpha')
def metadata(c):
    base=c.settings['alphaUrl'].rstrip('/');status,body=fetch(base+'/.well-known/openid-credential-issuer',{'X-PCI-Tenant-ID':c.settings['betaTenantId'],'X-PCI-Tenant-Domain':c.settings['betaUrl'].split('/')[2]})
    assert status==200,'Issuer metadata not available';value=json.loads(body)
    assert value['credential_issuer']==base and value['credential_endpoint'].startswith(base+'/'),'Gateway accepted a forged tenant authority'
    assert not any('topic' in config for config in value['credential_configurations_supported'].values()),'Internal NATS subject exposed'

@given('a dedicated disposable deployment is explicitly enabled')
def lifecycle(c):
    assert os.getenv('PCI_BDD_ALLOW_LIFECYCLE')=='1','Set PCI_BDD_ALLOW_LIFECYCLE=1 only for a dedicated test deployment'
    c.args=json.loads(Path(c.settings['g0ArgsFile']).read_text());assert isinstance(c.args,list) and all(isinstance(x,str) for x in c.args)
    assert c.args[c.args.index('--orce-namespace')+1]==c.settings['namespace'],'G0 namespace differs from the test target'
    c.kubectl=['kubectl','--kubeconfig',c.args[c.args.index('--kubeconfig')+1],'--context',c.args[c.args.index('--context')+1]]

def deployment(c):
    out=subprocess.check_output(c.kubectl+['-n',c.settings['namespace'],'get','deploy',c.settings['deployment'],'-o','json'])
    return json.loads(out)['spec']['template']

@when('I apply the same G0 configuration twice')
def redeploy(c):
    command=['bash',str(ROOT/'dist/ground-zero.sh')]+c.args
    for i in range(2):
        r=subprocess.run(command,capture_output=True,timeout=1800)
        assert r.returncode==0,'G0 failed; inspect deployment events without sharing credentials'
        if i==0:c.first_template=deployment(c)
    c.second_template=deployment(c)

@then('the second apply does not restart ORCE')
def stable(c):assert c.first_template==c.second_template,'ORCE template changed on identical reapply'

@when('I uninstall the disposable PCI prerequisites')
def uninstall(c):
    r=subprocess.run(['bash',str(ROOT/'scripts/uninstall.sh'),c.settings['namespace'],c.settings['deployment']],capture_output=True,timeout=900)
    assert r.returncode==0,'Uninstall refused or failed; delete test tenants first'

@then('the original ORCE and OCM deployments remain')
def remain(c):
    assert deployment(c)
    r=subprocess.run(c.kubectl+['-n','ocm-wstack','get','deploy'],capture_output=True,timeout=30)
    assert r.returncode==0,'OCM namespace check failed'

def runner(c,operation):
    path=Path(c.settings['lifecycleConfigFile']);config=json.loads(path.read_text());args=config['g0Args']
    assert args[args.index('--orce-namespace')+1]==c.settings['namespace'],'Runner namespace differs'
    assert args[args.index('--context')+1]==c.args[c.args.index('--context')+1],'Runner context differs'
    assert args[args.index('--kubeconfig')+1]==c.args[c.args.index('--kubeconfig')+1],'Runner kubeconfig differs'
    result=subprocess.run(['python3',str(ROOT/'scripts/lifecycle.py'),operation,'--config',str(path)],capture_output=True,text=True,timeout=3600)
    lines=[json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    assert result.returncode==0 and lines and lines[-1]['event']=='pci.automation.result' and lines[-1]['status']=='complete','Release runner failed; inspect its safe phase/code'
    assert all(set(e)<=set(['event','runId','operation','version','status','step','code','elapsedMs','namespace','deployment']) for e in lines),'Unexpected runner output'
    c.runner_events=lines

@when('I deploy and upgrade through the release runner')
def runner_upgrade(c):
    runner(c,'deploy');c.first_template=deployment(c);runner(c,'upgrade');c.second_template=deployment(c)

@then('the deployment runner reports sanitized completion')
def runner_complete(c):assert c.runner_events[-1]['status']=='complete'

@when('I uninstall through the release runner')
def runner_uninstall(c):runner(c,'uninstall')
