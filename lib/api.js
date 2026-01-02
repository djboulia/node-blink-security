
const Logger = require("./logger");
const OAuthArgsParser = require('./helpers/oauth_parser');

/* auth API functions */
const requestLogin = (
  auth,
  url,
  loginData,
  isRefresh
) => {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": DEFAULT_USER_AGENT,
    hardware_id: loginData.deviceId || "Blink-Home",
  };

  //   Add 2FA code to headers if provided
  if ("twoFACode" in loginData) {
    headers["2fa-code"] = loginData.twoFACode;
  }

  // Prepare form data for OAuth
  const formData = {
    username: loginData.username,
    client_id: OAUTH_CLIENT_ID,
    scope: OAUTH_SCOPE,
  };

  if (isRefresh) {
    formData.grant_type = OAUTH_GRANT_TYPE_REFRESH_TOKEN;
    formData.refresh_token = auth.refreshToken;
  } else {
    formData.grant_type = OAUTH_GRANT_TYPE_PASSWORD;
    formData.password = loginData.password;
  }

  const formParams = new URLSearchParams(formData);
  const data = formParams.toString();

  return auth.post(
    url,
    headers,
    data,
    false,  // not json
    true    // skipRefreshCheck
  );
};

const requestTier =  (auth, url) => {
  const loginData = auth.getLoginAttributes();

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": DEFAULT_USER_AGENT,
    Authorization: `Bearer ${loginData.token}`,
  };

  return auth.get(url, headers, false, true);
};

/* blink API functions */
const getIDs = (blink) => {
    return httpGet(blink, blink.urls.home_url,true)
}

const getSummary = (blink) => {
    return  httpGet(blink, blink.urls.home_url, true);
}

const setArmed = (blink, networkId, armed) => {
    let state = armed ? 'arm' : 'disarm';
    const url = blink.urls.arm_url + networkId + '/state/' + state;

    return httpPost(blink, url, {}, true);
}

const getVideos = (blink, since, page) => {
    const url = `${blink.urls.video_url}?since=${since.toISOString()}&page=${page}`
    return httpGet(blink, url, true);
}

const imageRefresh = (blink) => {
    return httpGet(blink, blink.urls.home_url, true);
}

/* camera API functions */
const snapPicture = (camera) => {
    const blink = camera.blink;
    const url = camera.image_link;
    return httpPost(blink, url, {}, true);
};    

const setMotionDetect = (camera, enable) => {
    const blink = camera.blink;
    const url = camera.arm_link + (enable ? 'enable' : 'disable')
    return httpPost(blink, url, {}, true);
}

const statusRefresh = (camera) => {
    const blink = camera.blink;
    const url = camera.arm_link + 'status';
    return httpPost(blink, url, {}, true);
}

const fetchImageData = (camera) => {
    const blink = camera.blink;
    const thumbnailUrl = camera.thumbnail;
    return httpGet(blink, thumbnailUrl, false, true /* binary */);
}

const fetchVideoData = (camera) => {
    const blink = camera.blink;
    const clipUrl = camera.clip;
    return httpGet(blink, clipUrl, false, true /* binary */);
}

const recordClip = (camera) => {
    const blink = camera.blink;
    const url = camera.arm_link + 'clip';
    return httpPost(blink, url, {}, true);
}

/* HTTP helper functions */
const httpGet =  (
  blink,
  url,
  json = true,
  binary=false
) => {
  Logger.debug(`Making GET request to ${url}`);

  return  blink.auth.get(
    url,
    blink.auth.getHeaders(),
    json,
    false, // skipRefreshCheck
    binary
  );
};

const httpPost =  (
  blink,
  url,
  data = null,
  json = true
) => {
  Logger.debug(`Making POST request to ${url}`);

  return blink.auth.post(
    url,
    blink.auth.getHeaders(),
    data,
    json
  );
};


// OAuth v2 Authorization Code Flow + PKCE functions

/**
 * Step 1: Initial authorization request.
 * 
 * Args:
 *    auth: Auth instance
 *    hardware_id: Device hardware ID (UUID)
 *    code_challenge: PKCE code challenge
 *
 * @returns {Promise<boolean>} true if successful
 **/
const oauthAuthorizeRequest = (auth, hardwareId, codeChallenge) => {
  return new Promise( (resolve, reject) => {
    const headers = {
        "User-Agent": OAUTH_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    };

    const url = new URL(OAUTH_AUTHORIZE_URL);
    url.searchParams.append('app_brand', "blink");
    url.searchParams.append('app_version', "50.1");
    url.searchParams.append('client_id', OAUTH_V2_CLIENT_ID);
    url.searchParams.append('code_challenge', codeChallenge);
    url.searchParams.append('code_challenge_method', "S256");
    url.searchParams.append('device_brand', "Apple");
    url.searchParams.append('device_model', "iPhone16,1");
    url.searchParams.append('device_os_version', "26.1");
    url.searchParams.append('hardware_id', hardwareId);
    url.searchParams.append('redirect_uri', OAUTH_REDIRECT_URI);
    url.searchParams.append('response_type', "code");
    url.searchParams.append('scope', OAUTH_SCOPE);

    return auth.get(
        url.toString(), headers 
    ).then( (response) => {
        resolve(response.status == 200);
    });
  });
};

/**
 * Step 2: Get signin page and extract CSRF token.
 * 
 * Args:
 *    auth: Auth instance
 * 
 * @returns {Promise<string|null>} CSRF token or null
 **/
const oauthGetSigninPage = (auth) => {
  return new Promise( (resolve, reject) => {
    const headers = {
        "User-Agent": OAUTH_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    };

    return auth.get(OAUTH_SIGNIN_URL, headers).then( (response) => {
        if (response.status != 200) {
            resolve(null);
        }

        const html = response.body;

        // Extract CSRF token from oauth-args script tag
        try {
            const parser = new OAuthArgsParser();
            const csrf_token = parser.parse(html);
            Logger.debug('extracted csrf_token: ', csrf_token);
            if (csrf_token) {
                resolve(csrf_token);
            } else {
                resolve(null);
            }
        } catch (error) {
            Logger.error(`Failed to extract CSRF token: ${error}`);
            resolve(null);
        }
    });
  });
};

/**
 * Step 3: Submit login credentials.
 * 
 * Args:
 *   auth: Auth instance
 *   email: User email
 *   password: User password
 *   csrf_token: CSRF token from signin page
 * 
 * @returns {Promise<string|null>}
 **/
 const oauthSignin = (auth, email, password, csrf_token) => {
  return new Promise( (resolve, reject) => {
    const headers = {
        "User-Agent": OAUTH_USER_AGENT,
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://api.oauth.blink.com",
        "Referer": OAUTH_SIGNIN_URL,
    };

    const data = new URLSearchParams({
        "username": email,
        "password": password,
        "csrf-token": csrf_token,
    }).toString();

    return auth.post(
        OAUTH_SIGNIN_URL, headers, data, false, false, { followRedirect: false }
    ).then( (response) => {
        if (response.status == 412) {
            // 2FA required
            resolve("2FA_REQUIRED");
        } else if ([301, 302, 303, 307, 308].includes(response.status)) {
            // Success without 2FA
            resolve("SUCCESS");
        } else {
            resolve(null);
        }
    });
  });
};

/**
 * Step 3b: Verify 2FA code.
 * 
 * Args:
 *    auth: Auth instance
 *    csrf_token: CSRF token
 *    twofa_code: 2FA code from user
 * 
 * @returns {Promise<boolean>}
 **/
 const oauthVerify2FA = (auth, csrf_token, twofa_code) => {
  return new Promise( (resolve, reject) => {
    const headers = {
        "User-Agent": OAUTH_USER_AGENT,
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://api.oauth.blink.com",
        "Referer": OAUTH_SIGNIN_URL,
    };

    const data = new URLSearchParams({
        "2fa_code": twofa_code,
        "csrf-token": csrf_token,
        "remember_me": "false",
    }).toString();

    return auth.post(
        OAUTH_2FA_VERIFY_URL, headers, data, true /* json */
    ).then( (response) => {   
        if (response.status == 201) {
            try {
                const result = response.body;
                resolve(result.status === "auth-completed");
                return;
            } catch (error) {
                Logger.error(`Failed to parse 2FA response: ${error}`);
                resolve(false);
            }
        } else {
            resolve(false);
        }
    });
  });
}

/**
 * Step 4: Get authorization code from authorize endpoint.
 * 
 * Args:
 *    auth: Auth instance
 * 
 * @returns {Promise<string|null>}
 **/
const oauthGetAuthorizationCode = (auth) => {
  return new Promise( (resolve, reject) => {
    const headers = {
        "User-Agent": OAUTH_USER_AGENT,
        "Accept": "*/*",
        "Referer": OAUTH_SIGNIN_URL,
    };

    return auth.get( OAUTH_AUTHORIZE_URL, 
                      headers, 
                      false, 
                      false, 
                      false, 
                      { followRedirect: false }
      ).then( (response) => {
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.location || "";

            // Extract code from URL: https://blink.com/.../end?code=XXX&state=YYY
            const urlObj = new URL(location);
            const code = urlObj.searchParams.get("code");

            if (code) {
                resolve(code);
            } else {
                resolve(null);
            }
        } else {
            resolve(null);
        }
    });
  });
};

/**
 * Step 5: Exchange authorization code for access token.
 * Args:
 *   auth: Auth instance
 *   code: Authorization code
 *   code_verifier: PKCE code verifier
 *   hardware_id: Device hardware ID
 * 
 * @returns {Promise<Token Data>}
 **/
 const oauthExchangeCodeForToken = (auth, code, codeVerifier, hardwareId) => {
 return new Promise( (resolve, reject) => {
    const headers = {
        "User-Agent": OAUTH_TOKEN_USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "*/*",
    };

    const data = new URLSearchParams({
        "app_brand": "blink",
        "client_id": OAUTH_V2_CLIENT_ID,
        "code": code,
        "code_verifier": codeVerifier,
        "grant_type": "authorization_code",
        "hardware_id": hardwareId,
        "redirect_uri": OAUTH_REDIRECT_URI,
        "scope": OAUTH_SCOPE,
    }).toString();

    return auth.post(
        OAUTH_TOKEN_URL, headers, data, true /* json */
    ).then( (response) => {
        if (response.status == 200) {
            resolve(response.body);
        } else {
            resolve(null);
        }
    });
  });
};

/**
 * Refresh access token using refresh_token.
 * 
 * Args:
 *     auth: Auth instance
 *     refresh_token: Refresh token
 *     hardware_id: Device hardware ID
 * @returns {Promise<Token Data>}
 **/
const oauthRefreshToken = (auth, refreshToken, hardwareId) => {
  return new Promise( (resolve, reject) => {
    const headers = {
        "User-Agent": OAUTH_TOKEN_USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "*/*",
    };

    const data = new URLSearchParams({
        "grant_type": "refresh_token",
        "refresh_token": refreshToken,
        "client_id": OAUTH_V2_CLIENT_ID,
        "scope": OAUTH_SCOPE,
        "hardware_id": hardwareId,
    }).toString();

    return auth.post( OAUTH_TOKEN_URL, headers, data, true /* json */ ).then( (response) => {
        if (response.status == 200) {
            resolve(response.body);
        } else {
            resolve(null);
        }
    });
  });
} 

module.exports = {
    requestLogin,
    requestTier,
    getIDs,
    getSummary,
    snapPicture,
    setMotionDetect,
    imageRefresh,
    statusRefresh,
    fetchImageData,
    fetchVideoData,
    recordClip,
    setArmed,
    getVideos,
    oauthAuthorizeRequest,
    oauthGetSigninPage,
    oauthSignin,
    oauthVerify2FA,
    oauthGetAuthorizationCode,
    oauthExchangeCodeForToken,
    oauthRefreshToken 
};

