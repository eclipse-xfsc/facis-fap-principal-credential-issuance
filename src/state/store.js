import { reactive } from "vue";

export const store = reactive({
  session: null,
  tenant: null,
  platform: null,
  live: { connected: false, lastMessage: null },
  busy: false,
  error: "",
});
