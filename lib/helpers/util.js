const prompt = require("prompt-sync")();

function tokenHex(nbytes = 32) {
  // Create a Uint8Array to store the random bytes.
  // The size of the array determines the number of random bytes generated.
  const randomBytes = new Uint8Array(nbytes);

  // Fill the array with cryptographically secure random values.
  crypto.getRandomValues(randomBytes);

  // Convert the Uint8Array to a hexadecimal string.
  // Each byte (0-255) is converted to a two-digit hexadecimal representation.
  return Array.from(randomBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const promptLoginData = (username, password) => {
  if (!username) {
    username = prompt("Username: ");
  }
  if (!password) {
    password = prompt("Password: ", { echo: "*" });
  }
  return {username, password};
};

const prompt2faCode = () => {
  const code = prompt("Enter the two-factor authentication code: ");
  return code;
}

const genUid = (size, uidFormat = false) => {
  if (uidFormat) {
    const token = `BlinkCamera_${tokenHex(4)}-${tokenHex(2)}-${tokenHex(
      2
    )}-${tokenHex(2)}-${tokenHex(6)}`;
    return token;
  }

  const token = tokenHex(size);
  return token;
};

const validateLoginData = (uid, deviceId) => {
  return {uid: uid || genUid(SIZE_UID, true),
    deviceId: deviceId || DEVICE_ID};
};

module.exports = {
  promptLoginData,
  prompt2faCode,
  validateLoginData
};
