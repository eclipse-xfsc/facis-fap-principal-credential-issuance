#!/usr/bin/env python3
import argparse,os
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--out',required=True);a=p.parse_args()
if not a.url.startswith('https://'):p.error('HTTPS required')
os.umask(0o077);destination=Path(a.out).resolve();destination.parent.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=False);context=browser.new_context();page=context.new_page();page.goto(a.url)
    input('Sign in and finish MFA in the browser. Press Enter here once the PCI workspace is visible. ')
    context.storage_state(path=str(destination));os.chmod(destination,0o600);browser.close()
print('Saved private browser session; do not commit or attach it to an acceptance report.')
