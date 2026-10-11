# SPDX-License-Identifier: Apache-2.0
import json,re,time,uuid,subprocess
from pathlib import Path
from urllib.parse import urlsplit,parse_qs,urlencode
from behave import given,when,then
from playwright.sync_api import expect
ROOT=Path(__file__).resolve().parents[4]

def call(c,path,method='GET',data=None,version=None,base=None):
    url=(base or c.url).rstrip('/')+path
    headers={'Origin':urlsplit(url).scheme+'://'+urlsplit(url).netloc}
    if version is not None:headers['If-Match']='"'+str(version)+'"'
    return c.browser_context.request.fetch(url,method=method,data=data,headers=headers)

def registration(c):
    r=call(c,'/api/v1/provider/tenant-registrations/'+c.registration_id);assert r.status==200,'Provider registration lookup failed';return r.json()['registration']

@when('I submit a new registration through the public form')
def submit(c):
    c.url=c.settings['mainUrl'].rstrip('/');c.slug='bdd'+uuid.uuid4().hex[:10];c.email=c.slug+'@example.com'
    c.page.goto(c.url+'/ui/#/register');c.page.get_by_label('Organization identifier',exact=True).fill('urn:example:'+c.slug)
    c.page.get_by_label('Organization name',exact=True).fill('Synthetic '+c.slug);c.page.get_by_label('Contact name',exact=True).fill('Synthetic Administrator')
    c.page.get_by_label('Contact email',exact=True).fill(c.email);c.page.get_by_label('Tenant slug',exact=True).fill(c.slug);c.page.get_by_role('checkbox').check()
    with c.page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/tenant-registrations')) as pending:c.page.get_by_role('button',name='Submit registration',exact=True).click()
    response=pending.value;assert response.status==202,'Registration failed with HTTP '+str(response.status);value=response.json()['registration'];c.registration_id=value['registrationId'];c.tenant_host=value['requestedDomain']
    expect(c.page.get_by_role('heading',name='Registration received',exact=True)).to_be_visible()

@then('provider approval is refused before email verification')
def unverified(c):
    r=registration(c);result=call(c,'/api/v1/provider/tenant-registrations/'+c.registration_id+'/approve','POST',{},r['version']);assert result.status==409,'Unverified approval accepted'

@when('I follow its Mailpit verification link')
def email(c):
    base=c.settings['mailpitUrl'].rstrip('/');assert base.startswith('https://'),'Mailpit HTTPS URL required'
    deadline=time.monotonic()+45;link=None
    while time.monotonic()<deadline and not link:
        response=c.browser_context.request.get(base+'/api/v1/search?'+urlencode({'query':'to:'+c.email}));assert response.status==200,'Mailpit search unavailable'
        for message in response.json().get('messages',[]):
            detail=c.browser_context.request.get(base+'/api/v1/message/'+message['ID']);assert detail.status==200,'Mailpit message unavailable'
            for found in re.findall(r'https://[^\s<>"\']+',detail.json().get('Text','')):
                parts=urlsplit(found);query=parse_qs(parts.query)
                if parts.netloc==urlsplit(c.url).netloc and query.get('verify_registration')==[c.registration_id]:link=found;break
        if not link:time.sleep(1)
    assert link,'Verification email not delivered before deadline'
    c.verification_token=parse_qs(urlsplit(link).query)['token'][0];c.page.goto(link)
    expect(c.page.get_by_role('heading',name='Registration verified',exact=True)).to_be_visible()

@then('the email verification token cannot be reused')
def replay(c):
    response=call(c,'/api/v1/tenant-registrations/'+c.registration_id+'/verify-email','POST',{'token':c.verification_token});del c.verification_token
    assert response.status==400,'Verification token replay accepted'

@when('the provider approves the verified registration')
def approve(c):
    r=registration(c);response=call(c,'/api/v1/provider/tenant-registrations/'+c.registration_id+'/approve','POST',{},r['version']);assert response.status==201,'Approval failed';c.created_tenant=response.json()['tenant']

@then('the new tenant becomes ready')
def ready(c):
    deadline=time.monotonic()+240
    while time.monotonic()<deadline:
        response=call(c,'/api/v1/provider/tenants/'+c.created_tenant['tenantId']+'/reconciliation');assert response.status==200
        tenant=response.json()['tenant']
        if tenant['state']=='active':return
        assert tenant['state']!='failed','Tenant reconciliation failed; inspect its safe condition code'
        time.sleep(2)
    assert False,'Tenant not active; check wildcard DNS, mail, Keycloak and Gateway conditions'

@when('the provider deletes that test tenant by its exact slug')
def delete(c):
    response=call(c,'/api/v1/provider/tenants/'+c.created_tenant['tenantId']+'/lifecycle','POST',{'state':'deleting','confirmation':c.slug});assert response.status==202
    deadline=time.monotonic()+240
    while time.monotonic()<deadline:
        value=call(c,'/api/v1/provider/tenants/'+c.created_tenant['tenantId']+'/reconciliation').json()['tenant']
        if value['state']=='deleted':return
        time.sleep(2)
    assert False,'Tenant deletion incomplete'

@then('the tenant route and public DID are unavailable')
def gone(c):
    base='https://'+c.tenant_host
    for path in [urlsplit(c.url).path+'/ui/','/.well-known/did.json']:
        response=c.browser_context.request.get(base+path);assert response.status==404,'Deleted tenant remains publicly routed'

@when('the provider rejects the verified registration')
def reject(c):
    value=registration(c);response=call(c,'/api/v1/provider/tenant-registrations/'+c.registration_id+'/reject','POST',{'reason':'Synthetic acceptance rejection'},value['version']);assert response.status==200 and response.json()['registration']['state']=='rejected'

@then('no tenant exists for that registration')
def absent(c):
    response=call(c,'/api/v1/provider/tenants');assert response.status==200
    assert all(x.get('registrationId')!=c.registration_id for x in response.json()['items']),'Rejected registration created a tenant'

@given('the prepared native case "{name}"')
def native(c,name):
    c.native_case=c.settings['nativeCases'][name]
    case=c.native_case;admin=c.settings['sessions'][case['adminSession']]
    with c.browser.new_context(storage_state=admin['stateFile']) as admin_context:
        base=admin['url'].rstrip('/')+'/api/v1/tenants/'+case['tenantId']+'/credential-configurations/'+case['configurationId']
        config=admin_context.request.get(base);assert config.status==200,'Native case configuration unavailable'
        resource=config.json()['item'];assert resource['activeVersion'],'Native case is unpublished'
        assert resource['version']==resource['activeVersion'],'Publish the latest test configuration before running the native pack'
        data=resource['draft']
        assert data and data['format']==case.get('format','jwt_vc_json') and data['profile']==case['profile'] and data['signingMode']==case['signingMode'],'Native case profile or signing mode differs'
    case['configuration']=data
    session=c.settings['sessions'][case['session']]
    c.browser_context=c.browser.new_context(storage_state=session['stateFile']);c.page=c.browser_context.new_page();c.url=session['url'].rstrip('/')
    response=call(c,'/api/v1/auth/session');assert response.status==200,'Principal session unavailable';c.session=response.json()['session']

@when('I complete its real issuance journey')
def journey(c):
    case=c.native_case;c.api='/api/v1/tenants/'+case['tenantId'];headers={'Idempotency-Key':str(uuid.uuid4()),'Origin':'https://'+urlsplit(c.url).netloc}
    response=c.browser_context.request.post(c.url+c.api+'/issuance-requests',data={'configurationId':case['configurationId']},headers=headers);assert response.status==201,'Issuance start failed';value=response.json();c.request_id=value['request']['requestId']
    for step in value['flow']['steps']:
        if step['type']=='offer':break
        result=call(c,c.api+'/issuance-requests/'+c.request_id+'/advance','POST',{'step':value['request']['step'],'consent':True,'values':case.get('answers',{}).get(step['id'],{})});assert result.status==200,'Journey advance failed';value=result.json()
    response=call(c,c.api+'/issuance-requests/'+c.request_id+'/offer','POST',{});assert response.status==200,'Native offer failed';c.offer=response.json()['offerUrl']

@when('the software wallet consumes its offer and presents the credential')
def wallet(c):
    cookie=next((x for x in c.browser_context.cookies(c.url) if x['name']=='fap_pci_session'),None);assert cookie,'Tenant session cookie unavailable'
    case=c.native_case;packet={'syntheticOnly':True,'offerUri':c.offer,'expectedIssuer':c.url,'profile':case['profile'],'tenantId':case['tenantId'],'configurationId':case['configurationId'],'sessionCookie':'fap_pci_session='+cookie['value'],'format':case.get('format','jwt_vc_json'),'configuration':case['configuration'],'subject':c.session['subject'],'linkedDataVerifier':case.get('linkedDataVerifier'),'archiveAfterIssue':case.get('archiveAfterIssue')}
    result=subprocess.run(['node',str(ROOT/'test/live/wallet.mjs')],input=json.dumps(packet),text=True,capture_output=True,timeout=180)
    assert result.returncode==0,'Native software wallet failed; inspect safe server error codes';c.wallet_result=json.loads(result.stdout)

@then('native issuance and both presentation protocols pass')
def wallet_pass(c):
    result=c.wallet_result;assert result['status']=='PASS' and result['issuanceProfile']==c.native_case['profile'];assert set(result['presentationProfiles'])=={'oid4vp-draft13','oid4vp-1.0'}

@then('its history identifies the principal and holder')
def history(c):
    import base64
    case=c.native_case;admin=c.settings['sessions'][case['adminSession']]
    with c.browser.new_context(storage_state=admin['stateFile']) as request_context:
        url=admin['url'].rstrip('/')+'/api/v1/tenants/'+case['tenantId']+'/credential-configurations/'+case['configurationId']+'/history?'+urlencode({'credentialId':c.wallet_result['credentialId']})
        response=request_context.request.get(url);assert response.status==200,'History unavailable'
        row=next((r for r in response.json()['items'] if r['requestId']==c.request_id),None)
        assert row and row['currentState']=='issued' and row['holderDid']==c.wallet_result['holderDid'],'History does not match verified issuance'
        assert row['principal']['username']==c.session['username'],'History principal differs'
        token=row['principalJwt'];payload=token.split('.')[1];statement=json.loads(base64.urlsafe_b64decode(payload+'='*((4-len(payload)%4)%4)))
        assert statement['aud']=='urn:xfsc:pci:issuance-history' and statement['tenant_id']==case['tenantId'],'History-only JWT has wrong audience'
        c.subject_hash=row['subjectHash']

@when('the administrator revokes that credential')
def revoke(c):
    case=c.native_case;admin=c.settings['sessions'][case['adminSession']];base=admin['url'].rstrip('/')
    with c.browser.new_context(storage_state=admin['stateFile']) as request_context:
        url=base+'/api/v1/tenants/'+case['tenantId']+'/credential-configurations/'+case['configurationId']+'/revocations'
        response=request_context.request.post(url,data={'requestId':c.request_id,'confirmed':True},headers={'Origin':'https://'+urlsplit(base).netloc})
        assert response.status==200,'Native revocation not confirmed'

@then('reissuance is refused until an audited unblock')
def blocked(c):
    case=c.native_case;headers={'Origin':'https://'+urlsplit(c.url).netloc,'Idempotency-Key':str(uuid.uuid4())}
    url=c.url+c.api+'/issuance-requests'
    response=c.browser_context.request.post(url,data={'configurationId':case['configurationId']},headers=headers)
    assert response.status==403 and response.json()['code']=='PCI-SR2-REISSUANCE-BLOCKED','Revocation did not block reissuance'
    admin=c.settings['sessions'][case['adminSession']];base=admin['url'].rstrip('/')
    with c.browser.new_context(storage_state=admin['stateFile']) as request_context:
        response=request_context.request.post(base+c.api+'/credential-configurations/'+case['configurationId']+'/reissuance-unblocks',data={'subjectHash':c.subject_hash},headers={'Origin':'https://'+urlsplit(base).netloc})
        assert response.status==200,'Administrative unblock failed'
    headers['Idempotency-Key']=str(uuid.uuid4());response=c.browser_context.request.post(url,data={'configurationId':case['configurationId']},headers=headers)
    assert response.status==201,'Explicit unblock did not allow a fresh request'

@when('the software wallet consumes and verifies the advertised credential format')
def wallet_format(c):wallet(c)

@then('that native format is issued and cryptographically verified')
def format_pass(c):
    assert c.wallet_result['status']=='PASS' and c.wallet_result['format']==c.native_case['format']


@then('the rejection email is delivered to that registrant')
def rejection_email(c):
    base=c.settings['mailpitUrl'].rstrip('/');assert base.startswith('https://')
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        result=c.browser_context.request.get(base+'/api/v1/search?'+urlencode({'query':'to:'+c.email}));assert result.status==200
        for item in result.json().get('messages',[]):
            response=c.browser_context.request.get(base+'/api/v1/message/'+item['ID']);assert response.status==200
            message=response.json()
            if message.get('Subject')=='FAP PCI tenant registration rejected' and 'Synthetic '+c.slug in message.get('Text',''):
                assert any(x.get('Address')==c.email for x in message.get('To',[])), 'Rejection recipient differs'
                return
        time.sleep(1)
    assert False,'Rejection email was not delivered'

@when('the software wallet verifies its issued credential after archiving the configuration')
def archived_wallet(c):
    assert c.settings.get('allowDestructiveAcceptance') is True,'Use a disposable published configuration'
    case=c.native_case;assert case['format']=='jwt_vc_json'
    admin=c.settings['sessions'][case['adminSession']]
    with c.browser.new_context(storage_state=admin['stateFile']) as browser:
        cookie=next(x for x in browser.cookies(admin['url']) if x['name']=='fap_pci_session')
        case['archiveAfterIssue']={'adminSessionCookie':'fap_pci_session='+cookie['value']}
        try:wallet(c)
        finally:case.pop('archiveAfterIssue',None)
    assert c.wallet_result['archiveAfterIssue']=='PASS' and len(c.wallet_result['presentationProfiles'])==2
