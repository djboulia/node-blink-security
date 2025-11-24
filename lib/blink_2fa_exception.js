module.exports = class BlinkTwoFARequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = "BlinkTwoFARequiredError";
    Object.setPrototypeOf(this, BlinkTwoFARequiredError.prototype); // Important for instanceof checks
  }
}
