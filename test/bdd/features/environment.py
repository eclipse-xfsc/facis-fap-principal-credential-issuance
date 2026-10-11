import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright

def before_all(context):
    context.settings=json.loads(Path(os.environ['PCI_BDD_CONFIG']).read_text())
    for name in ['mainUrl','alphaUrl','betaUrl']:
        assert context.settings[name].startswith('https://'), 'HTTPS is required'
    context.pw=sync_playwright().start()
    context.browser=context.pw.chromium.launch(headless=os.getenv('PCI_BDD_HEADFUL')!='1')

def after_scenario(context,scenario):
    if hasattr(context,'browser_context'):
        context.browser_context.close();del context.browser_context

def after_all(context):
    context.browser.close();context.pw.stop()
