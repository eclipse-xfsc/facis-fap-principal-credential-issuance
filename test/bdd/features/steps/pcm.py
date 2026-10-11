# SPDX-License-Identifier: Apache-2.0
# W3C WebDriver + Appium UiAutomator2; real PCM app, no wallet responses mocked.
import json,time,urllib.request,urllib.error
from urllib.parse import urlsplit,quote
from behave import when,then
KEY='element-6066-11e4-a52e-4f735466cecf'

@when('the dedicated PCM device imports that offer')
def import_pcm(c):
    c.pcm=c.native_case['pcm'];endpoint=c.pcm['appiumUrl'].rstrip('/')
    parts=urlsplit(endpoint)
    assert parts.scheme=='https' or (parts.scheme=='http' and parts.hostname in ['127.0.0.1','localhost']),'Use local or TLS Appium'
    assert c.pcm.get('dedicatedSyntheticDevice') is True,'A dedicated synthetic PCM device is required'
    def wire(method,path,body=None):
        request=urllib.request.Request(endpoint+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(request,timeout=60) as r:result=json.loads(r.read(2097152))
        except urllib.error.HTTPError:raise AssertionError('PCM automation command failed') from None
        assert not isinstance(result.get('value'),dict) or not result['value'].get('error'),'PCM automation command rejected'
        return result['value']
    result=wire('POST','/session',{'capabilities':{'alwaysMatch':c.pcm['capabilities']}});c.pcm_session='/session/'+quote(result['sessionId'],safe='');c.pcm_wire=wire
    c.add_cleanup(lambda:wire('DELETE',c.pcm_session))
    def element(selector):
        deadline=time.monotonic()+45
        while time.monotonic()<deadline:
            try:return wire('POST',c.pcm_session+'/element',selector)[KEY]
            except AssertionError:time.sleep(1)
        raise AssertionError('Expected PCM control was not found')
    c.pcm_element=element
    wire('POST',c.pcm_session+'/execute/sync',{'script':'mobile: deepLink','args':[{'url':c.offer,'package':c.pcm['package']}]})
    for step in c.pcm['importSteps']:
        identifier=element(step['selector']);assert step['action']=='click','Only explicit confirmation clicks are accepted'
        wire('POST',c.pcm_session+'/element/'+quote(identifier,safe='')+'/click',{})

@then('PCM shows the expected principal issuer and branding within the screen')
def rendered(c):
    wire=c.pcm_wire;size=wire('GET',c.pcm_session+'/window/rect')
    assert {'principal','issuer','credentialName','branding'}.issubset(c.pcm['assertions']),'Supply all display assertions'
    for name,check in c.pcm['assertions'].items():
        identifier=quote(c.pcm_element(check['selector']),safe='');base=c.pcm_session+'/element/'+identifier
        assert wire('GET',base+'/displayed') is True,'PCM display item is hidden'
        if 'text' in check:assert wire('GET',base+'/text')==check['text'],'PCM display value differs'
        if name=='branding' and c.native_case.get('modifiedName'):
            import base64,io
            from PIL import Image,ImageChops,ImageStat
            from pathlib import Path
            assert c.pcm.get('brandingReferenceFile'),'Provide the approved synthetic logo reference crop'
            actual=Image.open(io.BytesIO(base64.b64decode(wire('GET',base+'/screenshot')))).convert('RGB')
            expected=Image.open(c.pcm['brandingReferenceFile']).convert('RGB')
            assert actual.size==expected.size,'Logo dimensions differ from the approved device reference'
            error=sum(ImageStat.Stat(ImageChops.difference(actual,expected)).mean)/(3*255)
            assert error<=0.02,'PCM logo pixels differ from the modified logo reference'
        rect=wire('GET',base+'/rect');assert rect['width']>0 and rect['height']>0 and rect['x']>=0 and rect['y']>=0 and rect['x']+rect['width']<=size['width'] and rect['y']+rect['height']<=size['height'],'PCM content is clipped'

@then('native history confirms issuance for that principal')
def history_pcm(c):
    case=c.native_case;admin=c.settings['sessions'][case['adminSession']]
    with c.browser.new_context(storage_state=admin['stateFile']) as browser:
        url=admin['url'].rstrip('/')+'/api/v1/tenants/'+case['tenantId']+'/credential-configurations/'+case['configurationId']+'/history?requestId='+c.request_id
        response=browser.request.get(url);assert response.status==200
        assert any(r['currentState']=='issued' and r['principal']['username']==c.session['username'] for r in response.json()['items']),'PCM issuance was not recorded for the correct principal'
