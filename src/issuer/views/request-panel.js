// Request panel view. Actions are supplied by the issuer controller.
export const pciRequestPanelTemplate = `
<div v-if="tab==='request'" class="card request-card">
  <h3>Available credentials</h3>
  <p class="empty" v-if="!eligible.length">
    No credentials are available for your account yet. Your administrator can publish a configuration and
    grant eligibility.
  </p>
  <p v-if="journey && !currentStep && !offer" role="status">
    Request status: {{journey.request.state}}.
    <button class="secondary" @click="refresh" :disabled="busy">Check request status</button>
  </p>
  <article class="credential-option" v-for="c in eligible" :key="c.id">
    <h4>{{c.name}}</h4>
    <p>{{c.description}}</p>
    <button @click="start(c.id)" :disabled="busy">Start request</button>
  </article>
  <form
    v-if="currentStep"
    @submit.prevent="currentStep.type==='offer'?prepareOffer():next()"
    class="sr2-journey"
  >
    <p>Step {{journey.request.step+1}} / {{journey.flow.steps.length}} · version {{journey.request.flowVersion}}</p>
    <h3>{{currentStep.title}}</h3>
    <p class="preserve-lines">{{currentStep.text}}</p>
    <label v-if="currentStep.type==='consent'">
      <input
        type="checkbox"
        v-model="consent"
        required
        :aria-invalid="error?.fields?.consent?'true':undefined"
        :aria-describedby="error?.fields?.consent?'consent-error':undefined"
      >
      I have read and accept this information.
      <small v-if="error?.fields?.consent" id="consent-error" class="field-error">{{error.fields.consent}}</small>
    </label>
    <ui-field
      v-for="f in currentStep.fields"
      :key="f.name"
      :label="f.label"
      :name="'journey-'+f.name"
      v-model="answers[f.name]"
      :required="f.required"
      maxlength="2000"
      :error="error?.fields?.[f.name]"
    />
    <button :disabled="busy">{{currentStep.type==='offer'?'Prepare credential offer':'Continue'}}</button>
  </form>
  <section v-if="offer" aria-live="polite">
    <p>Offer expires {{new Date(offer.expiresAt).toLocaleString()}}</p>
    <svg
      v-if="qr"
      class="offer-qr"
      :viewBox="'0 0 '+qr.size+' '+qr.size"
      role="img"
      aria-label="Credential offer QR code"
      shape-rendering="crispEdges"
    >
      <rect width="100%" height="100%" fill="white"/>
      <path :d="qr.path" fill="black"/>
    </svg>
    <p v-else>Open the link below; this offer exceeds QR capacity.</p>
    <a :href="offer.offerUrl" rel="noreferrer">Open credential offer</a>
  </section>
</div>
`;
