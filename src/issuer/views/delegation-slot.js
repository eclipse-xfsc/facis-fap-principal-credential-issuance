// Delegation slot view. Actions are supplied by the issuer controller.
export const pciDelegationSlotTemplate = `
<slot v-if="tab==='delegation' && cap.tenantAdmin" name="members">
</slot>
`;
