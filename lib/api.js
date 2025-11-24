
const Logger = require("./logger");

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
    getVideos
};