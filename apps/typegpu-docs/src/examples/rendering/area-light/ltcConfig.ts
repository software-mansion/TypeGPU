let configuredCanFilterFloat32Ltc = false;

export function configureLtcFiltering(enabled: boolean) {
  configuredCanFilterFloat32Ltc = enabled;
}

export function getCanFilterFloat32Ltc() {
  return configuredCanFilterFloat32Ltc;
}
