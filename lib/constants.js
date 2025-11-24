/**
 * Created by madshall on 3/17/17.
 */

global.BLINK_URL = 'immedia-semi.com';
global.LOGIN_URL = 'https://rest-prod.' + BLINK_URL + '/api/v3/login';
global.LOGIN_URL_2FA = 'https://rest-prod.' + BLINK_URL + '/api/v5/account/login';
global.BASE_URL = 'https://rest-prod.' + BLINK_URL;
global.DEFAULT_URL = 'prod.' + BLINK_URL;
global.SIZE_NOTIFICATION_KEY = 152;
global.SIZE_UID = 16;

global.DEFAULT_USER_AGENT = "27.0ANDROID_28373244";
global.APP_BUILD = "ANDROID_28373244";
global.DEVICE_ID = "node-blink-security";
global.DEFAULT_MOTION_INTERVAL = 1;
global.DEFAULT_REFRESH = 30;
global.TIMEOUT = 10;

global.OAUTH_BASE_URL = "https://api.oauth.blink.com";
global.LOGIN_ENDPOINT = `${OAUTH_BASE_URL}/oauth/token`;
global.TIER_ENDPOINT = `${BASE_URL}/api/v1/users/tier_info`;

// OAuth
global.OAUTH_GRANT_TYPE_PASSWORD = "password";
global.OAUTH_GRANT_TYPE_REFRESH_TOKEN = "refresh_token";
global.OAUTH_SCOPE = "client";
global.OAUTH_CLIENT_ID = "android";

global.DEBUG = false;