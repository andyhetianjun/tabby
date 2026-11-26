const base = require("./app.json");

// EXPO_BASE_URL is set only for the GitHub Pages build (for example "/tabby"), because the site
// is served from a sub-folder. Left unset, the web build is served from the root as usual.
module.exports = () => ({
  ...base.expo,
  experiments: {
    ...base.expo.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
