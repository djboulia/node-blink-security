const Logger = {
  info: (message) => {
    console.info(message);
  },

  error: (message) => {
    console.error(message);
  },

  debug: (message) => {
    if (DEBUG) {
      console.debug(message);
    }
  },
};

module.exports = Logger;
