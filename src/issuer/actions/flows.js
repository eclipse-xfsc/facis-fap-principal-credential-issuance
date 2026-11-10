/** Flows operations with explicit state and I/O dependencies. */
export function createPciFlowActions(state, dependencies) {
  const { selectedFlow, flowForm, selected, configs, versions, flows, notice, restoreVersion, preview } = state;
  const { run, call, clone, crypto } = dependencies;
  function newFlow() {
    selectedFlow.value = null;
    flowForm.value = {
      configurationId: selected.value?.id || configs.value[0]?.id || '',
      data: {
        name: 'Credential journey',
        steps: [
          {
            id: 'intro',
            type: 'information',
            title: 'Your credential',
            text: 'Review the information before requesting.',
            fields: []
          },
          {
            id: 'consent',
            type: 'consent',
            title: 'Privacy and consent',
            text: 'Your participant data is processed transiently for issuance.',
            fields: []
          },
          {
            id: 'offer',
            type: 'offer',
            title: 'Receive your credential',
            text: 'Open the credential offer in a compatible wallet.',
            fields: []
          }
        ]
      }
    };
  }
  async function editFlow(item) {
    await run(async() => {
      const r = await call('/flows/' + item.id);
      selectedFlow.value = r.item;
      flowForm.value = { configurationId: r.item.configurationId, data: clone(r.item.draft) };
      versions.value = r.versions;
    });
  }
  function moveStep(index, delta) {
    const steps = flowForm.value.data.steps,
    target = index + delta;
    if (target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
  }
  function addStep() {
    const list = flowForm.value.data.steps;
    list.splice(list.length - 1, 0, {
      id: 'step' + crypto.randomUUID().slice(0, 8),
      type: 'information',
      title: 'New step',
      text: '',
      fields: []
    });
  }
  async function flowAction(action) {
    if (action === 'save') return run(async() => {
      const r = await call('/flows' + (selectedFlow.value ? '/' + selectedFlow.value.id: ''), selectedFlow.value ? 'PATCH': 'POST', flowForm
        .value, selectedFlow.value?.version);
      selectedFlow.value = r.item;
      flows.value = (await call('/flows')).items;
      notice.value = 'Journey draft saved.';
    });
    if (!selectedFlow.value) return;
    await run(async() => {
      const r = await call('/flows/' + selectedFlow.value.id + '/' + action, 'POST', action === 'rollback' ? { version: Number(
        restoreVersion.value) }: {}, selectedFlow.value.version);
      if (r.item) {
        selectedFlow.value = r.item;
        flowForm.value = { configurationId: r.item.configurationId, data: clone(r.item.draft) };
      } preview.value = r.preview || null;
      flows.value = (await call('/flows')).items;
      notice.value = action === 'rollback' ? 'Version restored as a new draft. Publish to activate.': 'Journey ' + action + ' completed.';
    });
  }
  return { newFlow, editFlow, moveStep, addStep, flowAction };
}
