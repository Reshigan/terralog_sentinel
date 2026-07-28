const encoder = new TextEncoder();

/**
 * Computes a device-bound salt by hashing device characteristics.
 * Uses navigator.userAgent, screen dimensions, and hardwareConcurrency.
 * Returns a base64-encoded SHA-256 hash suitable for PBKDF2.
 */
export async function getDeviceSalt(): Promise<string> {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const screenWidth = typeof screen !== 'undefined' ? screen.width : 0;
  const screenHeight = typeof screen !== 'undefined' ? screen.height : 0;
  const hardwareConcurrency =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency !== 'undefined'
      ? navigator.hardwareConcurrency
      : 0;

  const deviceData = `${userAgent}${screenWidth}${screenHeight}${hardwareConcurrency}`;
  const dataBuffer = encoder.encode(deviceData);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  return btoa(String.fromCharCode(...hashArray));
}
