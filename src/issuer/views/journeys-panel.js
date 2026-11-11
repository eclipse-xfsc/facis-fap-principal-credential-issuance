// Copyright (c) 2026 LEANEA GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Apache License, Version 2.0 which is available at
// https://www.apache.org/licenses/LICENSE-2.0.
//
// SPDX-License-Identifier: Apache-2.0
//
// Prepared with AI-assisted tools and reviewed by the author.
// Assisted-by: AI
// Journeys panel view. Actions are supplied by the issuer controller.
export const pciJourneysPanelTemplate = `
<section class="card" v-if="tab==='journeys' && cap.issuer">
  <h3>Credential journeys</h3>
  <button @click="newFlow">Create journey</button>
  <ul class="sr2-list">
    <li v-for="f in flows" :key="f.id">
      <button class="secondary" @click="editFlow(f)">{{f.draft.name}} · {{f.state}} · active v{{f.activeVersion || 'none'}}</button>
    </li>
  </ul>
  <form v-if="flowForm" @submit.prevent="flowAction('save')" class="sr2-form">
    <label>
      Configuration
      <select v-model="flowForm.configurationId" :disabled="!!selectedFlow" required>
        <option v-for="c in configs" :value="c.id">{{c.draft.name}}</option>
      </select>
    </label>
    <label>
      Journey name
      <input v-model="flowForm.data.name" required maxlength="100">
    </label>
    <fieldset v-for="(s,i) in flowForm.data.steps" :key="s.id">
      <legend>Step {{i+1}}</legend>
      <label>
        Type
        <select v-model="s.type" @change="s.fields=[]">
          <option>information</option>
          <option>consent</option>
          <option>input</option>
          <option>confirmation</option>
          <option>status</option>
          <option>offer</option>
        </select>
      </label>
      <label>
        Heading
        <input v-model="s.title" required maxlength="100">
      </label>
      <label>
        Text
        <textarea v-model="s.text" maxlength="2000">
        </textarea>
      </label>
      <template v-if="s.type==='input'">
        <p class="muted">
          Use a declared claim name to collect its value for internal signing. Other fields are transient
          survey answers. Number claims accept a finite number; boolean claims accept true or false. A
          required claim needs a required field.
        </p>
        <div v-for="(f,j) in s.fields" :key="j" class="sr2-row">
          <label>
            Field name
            <input v-model="f.name" required>
          </label>
          <label>
            Label
            <input v-model="f.label" required>
          </label>
          <label>
            <input type="checkbox" v-model="f.required">Required</label>
          <button type="button" @click="s.fields.splice(j,1)">Remove field</button>
        </div>
        <button type="button" @click="s.fields.push({name:'',label:'',required:true})">Add input field</button>
      </template>
      <div class="actions">
        <button type="button" class="secondary" @click="moveStep(i,-1)" :disabled="i===0">Move up</button>
        <button
          type="button"
          class="secondary"
          @click="moveStep(i,1)"
          :disabled="i===flowForm.data.steps.length-1"
        >Move down</button>
        <button type="button" class="secondary" @click="flowForm.data.steps.splice(i,1)">Remove step</button>
      </div>
    </fieldset>
    <button type="button" class="secondary" @click="addStep">Add step</button>
    <button :disabled="busy">Save draft</button>
  </form>
  <div v-if="selectedFlow" class="actions">
    <button class="secondary" @click="flowAction('preview')">Preview saved draft</button>
    <button @click="flowAction('publish')">Publish journey</button>
    <label>
      Restore version
      <input type="number" min="1" v-model="restoreVersion">
    </label>
    <button class="secondary" @click="flowAction('rollback')">Restore as draft</button>
  </div>
</section>
`;
