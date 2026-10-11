#!/usr/bin/env python3
"""Check every local Gherkin step has an authored binding, without running BDD."""
import ast,json,re
from pathlib import Path
patterns=[]
for file in Path('test/bdd/features/steps').glob('*.py'):
    tree=ast.parse(file.read_text())
    for node in ast.walk(tree):
        if not isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):continue
        for decorator in node.decorator_list:
            if isinstance(decorator,ast.Call) and isinstance(decorator.func,ast.Name) and decorator.func.id in ['given','when','then'] and decorator.args and isinstance(decorator.args[0],ast.Constant):
                value=decorator.args[0].value
                patterns.append(re.compile('^'+re.sub(r'\\\{[^}]+\\\}',r'.+',re.escape(value))+'$'))
missing=[];count=0;scenarios=0
for file in Path('test/bdd/features').glob('*.feature'):
    for line in file.read_text().splitlines():
        if re.match(r'\s*Scenario(?: Outline)?:',line):scenarios+=1
        match=re.match(r'\s*(Given|When|Then|And|But) (.+)',line)
        if not match:continue
        count+=1
        if not any(pattern.fullmatch(match[2]) for pattern in patterns):missing.append(str(file)+': '+match[2])
if missing:raise SystemExit('\n'.join(missing))
print(json.dumps({'stepBindings':'PASS','stepOccurrences':count,'scenarioDefinitions':scenarios,'execution':'NOT_RUN'}))
