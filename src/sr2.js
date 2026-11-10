import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api, request } from './services/api.js';
import { runtime } from './config/runtime.js';
import { normalizeUiError } from './state/reducers.js';
import { UiFeedback, UiField } from './components/feedback.js';
import { pciQrImage } from './qr.js';
import { onBridgeReconnect } from './services/transport.js';
import { createPciIssuerController } from './issuer/controller.js';
import { pciIssuerTemplate } from './issuer/console-template.js';
// Component lifecycle only. Feature state and operations live in src/issuer/.
export const Sr2Console = {
  components: { UiFeedback, UiField },
  props: ['tenant', 'session'],
  setup(props) {
    const controller = createPciIssuerController(props,
      { ref, computed, api, request, runtime, normalizeUiError, pciQrImage, window, document, crypto });
    const stopReconnect = onBridgeReconnect(controller.refresh);
    onUnmounted(stopReconnect);
    onMounted(controller.refresh);
    return controller;
  },
  template: pciIssuerTemplate
};
