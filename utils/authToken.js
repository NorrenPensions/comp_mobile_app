const axios = require("axios");

let cachedToken = null;
let tokenExpiryTime = null;

// Refresh token a bit early (1 minute buffer)
const EXPIRY_BUFFER_MS = 60 * 1000;

async function fetchNewToken() {
  const username = 'admin';
  const password = 'Isomerism@3991';

  // Create Basic Auth header
  const basicAuth = Buffer.from(
    `${username}:${password}`
  ).toString("base64");

  console.log("Fetching new access token from Norrenberger API...");
  const response = await axios.post(
    "http://ffpro.norrenberger.com:8080/pensionserver-web/rest/partnerservice/auth/login",
    null, // usually no body for Basic Auth token endpoints
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json"
      }
    }
  );

  console.log("Token response status:", response.status);
  console.log("Token response headers:", JSON.stringify(response.headers, null, 2));
  console.log("Token response data:", JSON.stringify(response.data, null, 2));

  let access_token = response.data?.access_token || response.data?.token;
  let expires_in = response.data?.expires_in || 900;

  // Check headers if not in body
  if (!access_token && response.headers.authorization) {
    console.log("Found Authorization header...");
    access_token = response.headers.authorization;
  }

  if (access_token) {
    access_token = access_token.trim();
    console.log("Token successfully retrieved. Prefix:", access_token.substring(0, 15) + "...");
  } else {
    console.warn("WARNING: No token found in response data or headers.");
  }

  cachedToken = access_token;
  tokenExpiryTime = Date.now() + expires_in * 1000;

  return cachedToken;
}

async function getAccessToken() {
  const isTokenValid =
    cachedToken &&
    tokenExpiryTime &&
    Date.now() < tokenExpiryTime - EXPIRY_BUFFER_MS;

  if (isTokenValid) {
    return cachedToken;
  }

  return fetchNewToken();
}

module.exports = {
  getAccessToken
};
