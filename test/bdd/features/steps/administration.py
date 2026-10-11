# SPDX-License-Identifier: Apache-2.0
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


def action(context, name, suffix, method='POST'):
    with context.page.expect_response(lambda r: r.request.method == method and r.url.split('?')[0].endswith(suffix)) as pending:
        context.page.get_by_role('button', name=name, exact=True).click()
    return pending.value


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
    c.layout_gaps = []
    for width in [1440, 390]:
        c.page.set_viewport_size({'width': width, 'height': 1000})
        keys = c.page.locator('section.card').filter(has=c.page.get_by_role('heading', name='Signing keys', exact=True))
        branding = c.page.locator('section.card').filter(has=c.page.get_by_role('heading', name='Tenant branding', exact=True))
        expect(branding).to_be_visible()
        first, second = keys.bounding_box(), branding.bounding_box()
        c.layout_gaps.append(second['y'] - first['y'] - first['height'])
        assert c.page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2'), 'Horizontal overflow at width ' + str(width)


@then('branding follows signing keys at both widths')
def layout_result(c):
    assert all(0 <= gap <= 40 for gap in c.layout_gaps), 'Unexpected blank row between signing keys and branding'


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
    c.grant_case=c.settings['delegationCase'];c.page.get_by_role('button',name='Access & members',exact=True).click()
    c.page.get_by_label('Enabled member',exact=True).select_option(c.grant_case['subject'])
    c.page.get_by_label('Scope',exact=True).select_option(c.grant_case['configurationId'])
    with c.page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/administrators')) as pending:c.page.get_by_role('button',name='Assign issuer capability',exact=True).click()
    assert pending.value.status==200;c.granted=pending.value.json()['item']

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
    with c.page.expect_response(lambda r:r.request.method=='DELETE' and r.url.endswith('/administrators/'+c.granted['id'])) as pending:row.get_by_role('button',name='Revoke',exact=True).click()
    assert pending.value.status==200

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
