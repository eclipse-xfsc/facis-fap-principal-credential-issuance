import { store } from '../state/store.js';

export const UiFeedback = {
  props:['error'], emits:['dismiss','recover'],
  template:`<div v-if="error" class="error persistent-error" role="alert">
    <div><strong>{{error.category==='field'?'Check the highlighted fields':error.category==='integration'?'Service unavailable':error.category==='action'?'Action could not be completed':'Something needs attention'}}</strong>
      <p>{{error.message}}</p><small v-if="error.code">Code: {{error.code}}</small>
      <small v-if="error.reference"> · Reference: {{error.reference}}</small>
      <p v-if="error.category==='integration'||error.category==='system'">Refresh to check the current state. If this persists, share the code and reference with your administrator.</p>
      <ul v-if="Object.keys(error.fields || {}).length"><li v-for="(message,field) in error.fields" :key="field">{{field}}: {{message}}</li></ul>
    </div><div class="feedback-actions"><button v-if="error.retryable || error.category==='system' || error.category==='integration'" class="secondary" type="button" @click="$emit('recover')">Refresh state</button><button class="secondary" type="button" @click="$emit('dismiss')" aria-label="Dismiss error">Dismiss</button></div>
  </div>`,
};

export const UiProgress = {
  setup() { return { state:store }; },
  template:`<div class="job-progress" v-if="state.ui.pending || state.live.restoring" role="status" aria-live="polite">
    <template v-if="state.live.restoring">Connection restored. Reloading your workspace…</template>
    <div v-for="(job,id) in state.ui.jobs" :key="id"><span>{{job.label}}</span><progress :value="job.progress===null?undefined:job.progress" max="100" :aria-label="job.label"></progress></div>
    <span v-if="!Object.keys(state.ui.jobs).length && !state.live.restoring">Waiting for the server…</span>
  </div>`,
};

export const UiField = {
  props:['label','modelValue','error','name','type','required','placeholder','maxlength','pattern'], emits:['update:modelValue'],
  template:`<label class="field"><span>{{label}}</span><input :id="name" :name="name" :type="type || 'text'" :value="modelValue" @input="$emit('update:modelValue',$event.target.value)" :required="required" :placeholder="placeholder" :maxlength="maxlength" :pattern="pattern" :aria-invalid="error?'true':undefined" :aria-describedby="error?name+'-error':undefined"><small v-if="error" :id="name+'-error'" class="field-error">{{error}}</small><slot></slot></label>`,
};
