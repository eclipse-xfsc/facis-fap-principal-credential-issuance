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

# Browser and real server calls only. Run on a dedicated synthetic-data tenant.
import os
import uuid
from behave import given, when, then
from playwright.sync_api import expect


@given('a dedicated synthetic UX tenant is explicitly enabled')
def synthetic(context):
    assert os.getenv('PCI_BDD_ALLOW_MUTATIONS') == '1', 'Use a disposable synthetic-data tenant and set PCI_BDD_ALLOW_MUTATIONS=1'
    context.suffix = uuid.uuid4().hex[:12]
    context.draft_name = 'BDD employee ' + context.suffix


BRIDGE_OBSERVER = r'''({suffix, method}) => {
    const client = window.uibuilder;
    if (!client?.send || !client?.onChange) throw Error('UIBUILDER is unavailable');
    if (!window.__pciBddObserver) {
        const observer = {pending: null};
        const original = client.send;
        client.send = function (...args) {
            const command = args[0]?.payload, pending = observer.pending;
            if (pending && !pending.requestId && command?.type === 'command'
                && command.action === 'request' && command.payload?.method === pending.method
                && command.payload.path?.split('?')[0].endsWith(pending.suffix)) {
                pending.requestId = command.requestId;
            }
            return original.apply(this, args);
        };
        client.onChange('msg', message => {
            const result = message?.payload, pending = observer.pending;
            if (pending?.requestId && result?.requestId === pending.requestId
                && result.version === 1 && result.action === 'request'
                && result.type === 'result' && typeof result.ok === 'boolean') {
                pending.result = result;
            }
        });
        window.__pciBddObserver = observer;
    }
    window.__pciBddObserver.pending = {suffix, method};
}'''


class UiResult:
    def __init__(self, envelope):
        self.status = envelope['status']
        if envelope['ok']:
            self.body = envelope['data']
        else:
            errors = envelope.get('errors', {})
            self.body = next((errors[k] for k in ['field', 'action', 'integration', 'system'] if errors.get(k)), {})

    def json(self):
        return self.body


def observe_ui_action(page, click, suffix, method='POST'):
    # Observe the actual UI command/result. Never synthesize a server result or
    # retain bridge grants. HTTP response events do not cover UIBUILDER actions.
    page.evaluate(BRIDGE_OBSERVER, {'suffix': suffix, 'method': method})
    try:
        click()
        page.wait_for_function('!!window.__pciBddObserver?.pending?.result', timeout=125000)
        envelope = page.evaluate('window.__pciBddObserver.pending.result')
        return UiResult(envelope)
    finally:
        page.evaluate('if (window.__pciBddObserver) window.__pciBddObserver.pending = null')


def action(context, name, suffix, method='POST'):
    return observe_ui_action(context.page,
        lambda: context.page.get_by_role('button', name=name, exact=True).click(), suffix, method)


@when('I create a synthetic configuration draft in the UI')
def create_draft(c):
    c.page.get_by_role('button', name='Configurations', exact=True).click()
    c.page.get_by_role('button', name='+ Create configuration', exact=True).click()
    c.page.get_by_label('Stable identifier', exact=True).fill('Bdd' + c.suffix)
    c.page.get_by_label('Name', exact=True).fill(c.draft_name)
    c.page.get_by_label('Tenant key reference', exact=True).fill(c.settings.get('issuerKey', 'issuer'))
    result = action(c, 'Save draft', '/credential-configurations')
    assert result.status == 201, 'Draft save failed with HTTP ' + str(result.status)
    c.draft = result.json()['item']


@when('I validate it before assigning its connector and journey')
def incomplete(c):
    result = action(c, 'Validate', '/validate')
    assert result.status == 400 and result.json()['code'] == 'PCI-CONFIG-PREREQUISITES', 'Expected a typed prerequisite error'
    expect(c.page.get_by_role('alert')).to_contain_text('PCI-CONFIG-PREREQUISITES')
    c.error_text = c.page.get_by_role('alert').inner_text()


@then('the prerequisite error remains after navigation and refresh')
def persistent(c):
    c.page.get_by_role('button', name='Tenant settings', exact=True).click()
    c.page.get_by_role('button', name='Refresh', exact=True).click()
    expect(c.page.get_by_role('button', name='Refresh', exact=True)).to_be_enabled()
    expect(c.page.get_by_role('alert')).to_have_text(c.error_text)


@then('I can dismiss the error explicitly')
def dismiss(c):
    c.page.get_by_role('button', name='Dismiss error', exact=True).click()
    expect(c.page.get_by_role('alert')).to_have_count(0)


@when('I create and reorder its journey in the UI')
def journey(c):
    c.page.get_by_role('button', name='Journeys', exact=True).click()
    c.page.get_by_role('button', name='Create journey', exact=True).click()
    c.page.get_by_label('Configuration', exact=True).select_option(c.draft['id'])
    c.page.get_by_label('Journey name', exact=True).fill('BDD journey ' + c.suffix)
    c.page.get_by_role('button', name='Add step', exact=True).click()
    steps = c.page.locator('form fieldset')
    steps.nth(2).get_by_label('Heading', exact=True).fill('Synthetic information')
    steps.nth(2).get_by_role('button', name='Move up', exact=True).click()
    result = action(c, 'Save draft', '/flows')
    assert result.status == 201, 'Journey save failed'
    c.journey_order = [step['title'] for step in result.json()['item']['draft']['steps']]
    assert c.journey_order[1] == 'Synthetic information', 'Move up did not change the stored step order'


@then('the saved preview preserves that order')
def preview(c):
    result = action(c, 'Preview saved draft', '/preview')
    assert result.status == 200, 'Preview failed'
    expect(c.page.get_by_role('heading', name='Saved draft preview', exact=True)).to_be_visible()
    preview_card = c.page.locator('section.card').filter(has=c.page.get_by_role('heading', name='Saved draft preview', exact=True))
    expect(preview_card.locator('article h4')).to_have_text(c.journey_order)


@then('the journey publishes as an immutable version')
def publish(c):
    result = action(c, 'Publish journey', '/publish')
    assert result.status == 200 and result.json()['item']['activeVersion'] >= 1, 'Journey did not publish'


@when('I open tenant settings at desktop and narrow widths')
def layout(c):
    c.page.get_by_role('button', name='Tenant settings', exact=True).click()
    c.settings_widths = []
    for width in [1440, 390]:
        c.page.set_viewport_size({'width': width, 'height': 1000})
        tasks = c.page.get_by_role('navigation', name='Tenant settings tasks', exact=True)
        tasks.get_by_role('button', name='Branding', exact=True).click()
        expect(c.page.get_by_role('heading', name='Tenant branding', exact=True)).to_be_visible()
        expect(c.page.get_by_label('Content width', exact=True)).to_be_visible()
        expect(c.page.get_by_role('button', name='Activate branding', exact=True)).to_be_visible()
        assert c.page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2'), 'Horizontal overflow at width ' + str(width)
        tasks.get_by_role('button', name='Signing keys', exact=True).click()
        expect(c.page.get_by_role('heading', name='Signing keys', exact=True)).to_be_visible()
        expect(c.page.get_by_label('Key name', exact=True)).to_be_visible()
        expect(c.page.get_by_role('heading', name='Tenant branding', exact=True)).to_have_count(0)
        assert c.page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2'), 'Horizontal overflow at width ' + str(width)
        c.settings_widths.append(width)


@then('branding and signing-key panels are usable without horizontal overflow')
def layout_result(c):
    assert c.settings_widths == [1440, 390], 'Both viewport widths must be tested'


@when('I save a connector with an invalid protocol version')
def connector(c):
    c.page.get_by_role('button', name='Connectors', exact=True).click()
    c.page.get_by_role('button', name='+ New connector', exact=True).click()
    fields = {'Name': 'BDD invalid connector', 'HTTPS endpoint': 'https://repository.example.invalid:9443',
              'TLS server name': 'repository.example.invalid', 'Protocol version': 'unsupported-bdd',
              'Client TLS Secret name': 'bdd-do-not-create', 'Trust Secret name': 'bdd-do-not-create',
              'JWT issuer': 'https://identity.example.invalid', 'JWT audience': 'participant-data'}
    for label, value in fields.items():
        c.page.get_by_label(label, exact=True).fill(value)
    c.connector_result = action(c, 'Save and activate connector', '/participant-connectors')


@then('the connector error is actionable and remains visible')
def connector_error(c):
    assert c.connector_result.status == 400, 'Invalid protocol was not rejected as validation'
    error = c.connector_result.json()
    assert error['code'].startswith('PCI-') and error.get('detail') and error['detail'] != 'The request could not be completed.'
    expect(c.page.get_by_role('alert')).to_contain_text(error['code'])
    c.page.get_by_role('button', name='Refresh', exact=True).click()
    expect(c.page.get_by_role('button', name='Refresh', exact=True)).to_be_enabled()
    expect(c.page.get_by_role('alert')).to_contain_text(error['code'])


@when('I archive that disposable draft in the UI')
def archive(c):
    c.page.once('dialog', lambda dialog: dialog.accept())
    result = action(c, 'Archive', '/credential-configurations/' + c.draft['id'], 'DELETE')
    assert result.status == 200, 'Archive failed'


@then('the draft is shown as archived')
def archived(c):
    row = c.page.get_by_role('row').filter(has_text=c.draft_name)
    expect(row).to_contain_text('archived')
    expect(c.page.get_by_role('button', name='Save draft', exact=True)).to_be_disabled()


@when('I complete the configured request journey')
def principal_journey(c):
    name = c.settings['offerConfigurationName']
    c.page.get_by_role('button', name='Request credential', exact=True).click()
    choice = c.page.locator('article.credential-option').filter(has=c.page.get_by_role('heading', name=name, exact=True))
    choice.get_by_role('button', name='Start request', exact=True).click()
    form = c.page.locator('form.sr2-journey')
    expect(form).to_be_visible()
    for _ in range(20):
        offer = form.get_by_role('button', name='Prepare credential offer', exact=True)
        if offer.count():
            c.offer_result = action(c, 'Prepare credential offer', '/offer')
            return
        consent = form.get_by_role('checkbox')
        if consent.count(): consent.check()
        for label, value in c.settings.get('journeyAnswers', {}).items():
            control = form.get_by_label(label, exact=True)
            if control.count(): control.fill(value)
        result = action(c, 'Continue', '/advance')
        assert result.status == 200, 'Journey step failed with HTTP ' + str(result.status)
    assert False, 'Journey did not reach the offer within its configured step bound'


@then('the native offer and its QR are available')
def offer(c):
    assert c.offer_result.status == 200, 'Native offer failed with HTTP ' + str(c.offer_result.status)
    # Never attach the offer body, tokens, browser trace, or QR to shared logs.
    expect(c.page.get_by_role('img', name='Credential offer QR code', exact=True)).to_be_visible()

@when('I grant the prepared ordinary principal issuer access in the UI')
def grant_ui(c):
    c.grant_case=c.settings['delegationCase']
    assert principal_access(c) in [403,404], 'Use an ordinary test principal without existing issuer access'
    c.page.get_by_role('button',name='Access & members',exact=True).click()
    c.page.get_by_label('Enabled member',exact=True).select_option(c.grant_case['subject'])
    c.page.get_by_label('Scope',exact=True).select_option(c.grant_case['configurationId'])
    result=action(c,'Assign issuer capability','/administrators')
    assert result.status==200;c.granted=result.json()['item']
    c.grant_revoked=False
    def cleanup_grant():
        if c.grant_revoked:return
        from urllib.parse import urlsplit
        admin=c.settings['sessions']['alphaAdmin'];base=admin['url'].rstrip('/')
        with c.browser.new_context(storage_state=admin['stateFile']) as browser:
            result=browser.request.delete(base+'/api/v1/tenants/'+c.grant_case['tenantId']+'/administrators/'+c.granted['id'],headers={'Origin':'https://'+urlsplit(base).netloc})
            assert result.status in [200,404], 'Revoke the temporary BDD assignment in Access & members'
    c.add_cleanup(cleanup_grant)

def principal_access(c):
    fixture=c.settings['sessions'][c.grant_case['session']]
    with c.browser.new_context(storage_state=fixture['stateFile']) as browser:
        return browser.request.get(fixture['url'].rstrip('/')+'/api/v1/tenants/'+c.grant_case['tenantId']+'/credential-configurations/'+c.grant_case['configurationId']).status

@then('that principal can administer its assigned configuration')
def granted(c):assert principal_access(c)==200,'Delegation did not take effect'

@when('I revoke that assignment in the UI')
def revoke_ui(c):
    row=c.page.locator('li[data-assignment-id="'+c.granted['id']+'"]')
    # Assignment rows expose stable IDs for a precise revocation target.
    c.page.once('dialog',lambda dialog:dialog.accept())
    result=observe_ui_action(c.page,lambda:row.get_by_role('button',name='Revoke',exact=True).click(),'/administrators/'+c.granted['id'],'DELETE')
    assert result.status==200
    c.grant_revoked=True

@then('the same principal session immediately loses administration')
def revoked(c):assert principal_access(c) in [403,404],'Stale session retained delegated authority'

@given('a disposable participant tenant is configured for deletion')
def deletion_case(c):
    assert c.settings.get('allowDestructiveAcceptance') is True,'Enable disposable deletion explicitly'
    c.delete_case=c.settings['participantDeletionCase'];c.browser_context.close()
    session=c.settings['sessions'][c.delete_case['adminSession']];c.browser_context=c.browser.new_context(storage_state=session['stateFile']);c.page=c.browser_context.new_page();c.url=session['url'].rstrip('/');c.page.goto(c.url+'/ui/')

@when('its participant administrator requests deletion in the UI')
def delete_ui(c):
    c.page.get_by_role('button',name='Tenant settings',exact=True).click();c.page.once('dialog',lambda dialog:dialog.accept(c.delete_case['slug']))
    with c.page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/lifecycle')) as pending:c.page.get_by_role('button',name='Request tenant deletion',exact=True).click()
    assert pending.value.status==202

@then('the disposable tenant becomes deleted and its participant namespace disappears')
def deleted_ui(c):
    import subprocess,time
    provider=c.settings['sessions']['provider']
    with c.browser.new_context(storage_state=provider['stateFile']) as browser:
        deadline=time.monotonic()+300
        while time.monotonic()<deadline:
            response=browser.request.get(provider['url'].rstrip('/')+'/api/v1/provider/tenants/'+c.delete_case['tenantId']+'/reconciliation')
            assert response.status==200
            if response.json()['tenant']['state']=='deleted':break
            time.sleep(2)
        else:raise AssertionError('Tenant deletion did not finish')
    command=['kubectl','--kubeconfig',c.settings['kubeconfig'],'--context',c.settings['context'],'get','namespace',c.delete_case['participantNamespace'],'--ignore-not-found','-o','name']
    result=subprocess.run(command,capture_output=True,text=True,timeout=20);assert result.returncode==0 and not result.stdout.strip(),'Participant namespace remains'

@when('I modify the prepared published configuration and its logo in the UI')
def modify_published(c):
    from pathlib import Path
    from urllib.parse import urlsplit
    case=c.native_case;admin=c.settings['sessions'][case['adminSession']]
    with c.browser.new_context(storage_state=admin['stateFile']) as browser:
        page=browser.new_page();page.goto(admin['url'].rstrip('/')+'/ui/')
        page.get_by_role('button',name='Configurations',exact=True).click()
        page.get_by_role('row').filter(has_text=case['configuration']['identifier']).get_by_role('button',name='Edit',exact=True).click()
        page.get_by_label('Name',exact=True).fill(case['modifiedName'])
        page.get_by_label('Description',exact=True).fill(case['modifiedDescription'])
        with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/assets')) as pending:
            page.get_by_label('Upload PNG (RGB/RGBA, up to 1 MiB and 1024×1024)',exact=True).set_input_files(case['logoFile'])
        asset=pending.value;assert asset.status==201,'Logo upload failed';asset_id=asset.json()['item']['id']
        with page.expect_response(lambda r:r.request.method=='PUT' and r.url.endswith('/credential-configurations/'+case['configurationId'])) as pending:page.get_by_role('button',name='Save draft',exact=True).click()
        saved=pending.value;assert saved.status==200 and saved.json()['item']['draft']['logoAssetId']==asset_id
        with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/publish')) as pending:page.get_by_role('button',name='Publish locally',exact=True).click()
        assert pending.value.status==200,'Modified configuration did not publish'
        c.changed_asset_id=asset_id;case['configuration']=saved.json()['item']['draft']
        endpoint=admin['url'].rstrip('/')+'/api/v1/tenants/'+case['tenantId']+'/publication'
        result=browser.request.post(endpoint,headers={'Origin':'https://'+urlsplit(admin['url']).netloc},data={});assert result.status==200,'Native metadata publication failed'
    c.expected_modified_name=case['modifiedName']

@then('wallet discovery exposes the changed name description and logo')
def modified_discovery(c):
    r=c.browser_context.request.get(c.url+'/.well-known/openid-credential-issuer');assert r.status==200
    conf=r.json()['credential_configurations_supported'][c.native_case['configuration']['identifier']]
    display=(conf.get('display') or conf['credential_metadata']['display'])[0]
    assert display['name']==c.native_case['modifiedName'] and display['description']==c.native_case['modifiedDescription']
    assert display['logo']['uri'].endswith('/'+c.changed_asset_id)
    image=c.browser_context.request.get(display['logo']['uri']);assert image.status==200 and image.headers['content-type'].startswith('image/png')
    c.native_case['pcm']['assertions']['credentialName']['text']=c.native_case['modifiedName']
