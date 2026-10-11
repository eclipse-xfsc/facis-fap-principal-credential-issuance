# SPDX-License-Identifier: Apache-2.0
# Credential material is read only from private fixture files, never reports.
import base64,hashlib,hmac,json,struct,time,uuid
from pathlib import Path
from urllib.parse import urlsplit
from behave import given,when,then
from playwright.sync_api import expect

def totp(secret):
    key=base64.b32decode(secret.replace(' ','').upper(),casefold=True)
    digest=hmac.new(key,struct.pack('>Q',int(time.time())//30),hashlib.sha1).digest();offset=digest[-1]&15
    return str((struct.unpack('>I',digest[offset:offset+4])[0]&0x7fffffff)%1000000).zfill(6)

@given('the fresh login case "{name}" in an empty browser context')
def fresh(c,name):
    c.login_case=c.settings['freshLogins'][name];c.login_name=name;c.completed_actions=[]
    if name=='firstLogin':
        c.first_admin=c.login_case['keycloakAdmin'];c.first_before=keycloak_state(c);assert {'UPDATE_PASSWORD','CONFIGURE_TOTP'}.issubset(set(c.first_before['user'].get('requiredActions',[]))), 'Fixture must be an actual first-login account with required actions'
        assert not any(x['type'] in ['otp','webauthn','webauthn-passwordless'] for x in c.first_before['credentials']), 'First-login fixture is already enrolled'
    c.browser_context=c.browser.new_context();c.page=c.browser_context.new_page();c.url=c.login_case['url'].rstrip('/')
    assert not c.browser_context.cookies(),'Fresh authentication cannot use stored cookies'
    if name=='passkey':
        c.authenticator=c.browser_context.new_cdp_session(c.page);c.authenticator.send('WebAuthn.enable')
        c.authenticator_id=c.authenticator.send('WebAuthn.addVirtualAuthenticator',{'options':{'protocol':'ctap2','transport':'internal','hasResidentKey':True,'hasUserVerification':True,'isUserVerified':True,'automaticPresenceSimulation':True}})['authenticatorId']

@when('I authenticate using that identity provider')
def authenticate(c):
    case=c.login_case;c.page.goto(c.url+'/ui/')
    label='Tenant administrator sign in' if case.get('nativeAdmin') else 'Sign in to your organization'
    c.page.get_by_role('button',name=label,exact=True).click()
    # Explicit, version-specific fixture selectors accommodate Entra conditional
    # access and the approved Keycloak theme. No response/token capture or traces.
    for step in case['steps']:
        control=c.page.locator(step['selector']);expect(control).to_be_visible(timeout=30000)
        assert urlsplit(c.page.url).netloc in case['allowedIdentityHosts'],'Unexpected identity host'
        action=step['action']
        if action=='fill':control.fill(Path(step['valueFile']).read_text().strip() if 'valueFile' in step else step['value'])
        elif action=='totp':
            secret=Path(step['secretFile']).read_text().strip() if 'secretFile' in step else c.page.locator(step['secretSelector']).inner_text().strip()
            control.fill(totp(secret));del secret
        elif action=='click':control.click()
        else:raise AssertionError('Unknown fresh login action')
        if step.get('requirementAction'):c.completed_actions.append(step['requirementAction'])
    c.page.wait_for_url(c.url+'/ui/**',timeout=60000)
    c.page.get_by_role('navigation',name='Workspace sections').wait_for(timeout=60000)
    response=c.browser_context.request.get(c.url+'/api/v1/auth/session');assert response.status==200,'Fresh authentication failed'
    c.fresh_session=response.json()['session']

@then('the fresh session belongs to its expected tenant and subject')
def identity(c):
    case=c.login_case;s=c.fresh_session
    assert s['tenantId']==case['tenantId'] and s['username']==case['username'],'Fresh identity binding differs'
    assert set(s['roles'])==set(case['expectedRoles']),'Unexpected privilege after fresh login'

@then('that principal can start its configured issuance journey')
def issuance(c):
    case=c.login_case;response=c.browser_context.request.post(c.url+'/api/v1/tenants/'+case['tenantId']+'/issuance-requests',data={'configurationId':case['configurationId']},headers={'Origin':'https://'+urlsplit(c.url).netloc,'Idempotency-Key':str(uuid.uuid4())})
    assert response.status==201,'Fresh principal cannot start issuance'

@then('password change and MFA enrollment were required and completed')
def first(c):
    assert {'passwordChange','mfaEnrollment'}.issubset(set(c.completed_actions)),'First-login actions were not exercised'
    after=keycloak_state(c)
    assert not {'UPDATE_PASSWORD','CONFIGURE_TOTP'}.intersection(after['user'].get('requiredActions',[])), 'Required actions remain on the actual account'
    assert any(x['type']=='otp' for x in after['credentials']), 'No MFA credential was enrolled in Keycloak'
    assert c.fresh_session['subject']==c.first_admin['userId'], 'First-login account differs'
    changed=[x for x in c.login_case['steps'] if x.get('requirementAction')=='passwordChange']
    enrolled=[x for x in c.login_case['steps'] if x.get('requirementAction')=='mfaEnrollment']
    assert changed and all(x['action']=='fill' and 'valueFile' in x for x in changed), 'Password-change evidence must be a submitted new password'
    assert enrolled and all(x['action']=='totp' for x in enrolled), 'MFA evidence must be a TOTP operation'

@then('a passkey was created by the browser authenticator')
def passkey(c):
    credentials=c.authenticator.send('WebAuthn.getCredentials',{'authenticatorId':c.authenticator_id})['credentials']
    assert credentials and any(x.get('isResidentCredential') for x in credentials),'Passkey registration did not create a discoverable credential'
    original_count=max(x.get('signCount',0) for x in credentials);del credentials
    assert c.login_case.get('repeatSteps'),'Supply a subsequent passkey-login fixture'
    c.browser_context.clear_cookies();c.page.evaluate('sessionStorage.clear();localStorage.clear()')
    c.login_case={**c.login_case,'steps':c.login_case['repeatSteps']};authenticate(c)
    again=c.authenticator.send('WebAuthn.getCredentials',{'authenticatorId':c.authenticator_id})['credentials']
    assert max(x.get('signCount',0) for x in again)>original_count,'Subsequent login did not use the passkey'
    del again

@when('I configure the synthetic tenant identity provider in the UI')
def configure(c):
    c.identity_fixture=json.loads(Path(c.settings['identityConfigurationFile']).read_text())
    c.page.get_by_role('button',name='Tenant settings',exact=True).click()
    c.page.get_by_label('Identity provider',exact=True).select_option('oidc')
    fields={'Sign-in display name':'displayName','OIDC issuer URL':'issuer','OIDC client ID':'clientId','Participant API audience':'audience','OIDC scopes':'scopes'}
    for label,key in fields.items():c.page.get_by_label(label,exact=True).fill(c.identity_fixture[key])
    c.page.get_by_label('Client secret (leave blank to retain)',exact=True).fill(Path(c.identity_fixture['clientSecretFile']).read_text().strip())
    with c.page.expect_response(lambda r:r.request.method=='PUT' and r.url.endswith('/identity-provider')) as pending:c.page.get_by_role('button',name='Save identity provider',exact=True).click()
    c.identity_response=pending.value;assert c.identity_response.status==200,'Identity configuration failed'

@then('its public settings omit the client secret')
def secret(c):
    body=c.identity_response.json();assert body['item']['state']=='active' and body['item']['issuer']==c.identity_fixture['issuer']
    assert 'clientSecret' not in body['item'];expect(c.page.get_by_label('Client secret (leave blank to retain)',exact=True)).to_have_value('')


def keycloak_state(c):
    import urllib.request,ssl
    from urllib.parse import quote
    a=c.first_admin;parts=urlsplit(a['url']);assert parts.scheme=='https' and parts.netloc in c.login_case['allowedIdentityHosts']
    token=Path(a['tokenFile']).read_text().strip();assert token and '\n' not in token
    tls=ssl.create_default_context();tls.minimum_version=ssl.TLSVersion.TLSv1_3
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    opener=urllib.request.build_opener(urllib.request.HTTPSHandler(context=tls),NoRedirect())
    base=a['url'].rstrip('/')+'/admin/realms/'+quote(a['realm'],safe='')+'/users/'+quote(a['userId'],safe='')
    def get(path):
        with opener.open(urllib.request.Request(base+path,headers={'Authorization':'Bearer '+token}),timeout=15) as r:return json.loads(r.read(1048576))
    user=get('');assert user['id']==a['userId'] and user['username']==c.login_case['username']
    return {'user':user,'credentials':get('/credentials')}
