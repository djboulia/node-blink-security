const request = require('request');
const api = require('./api');
const util = require('./util');
const Logger = require('./logger');
const BlinkTwoFARequiredError = require('./blink_2fa_exception');

/**
 * Centralize http operations and handle authentication
 */

module.exports = class BlinkAuth {    
    constructor(loginData, noPrompt=false, callback=null) {
        this.tierInfo = null;
        this.regionId = null;
        this.noPrompt = noPrompt;
        this.callback = callback;
        
        if (loginData) {
            this.username= loginData.username || null;
            this.password = loginData.password || null;
            this.deviceId = loginData.deviceId || null;
            this.token = loginData.token || null;
            this.expiresIn = loginData.expiresIn || null;
            this.expirationDate = loginData.expirationDate || null;
            this.refreshToken = loginData.refreshToken || null;
            this.regionId = loginData.regionId || null;
            this.host = loginData.host || null;
            this.accountId = loginData.accountId || null;
        }
    }

    hasToken() {
        return !!this.token;
    }

    getHeaders() {
        if (!this.hasToken()) {
            return null;
        }

        return {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
        };
    }

    // use this to store the credentials for a later login
    getLoginAttributes() {
        return {
            token : this.token,
            expiresIn : this.expiresIn,
            expirationDate : this.expirationDate,
            refreshToken : this.refreshToken,
            host : this.host,
            regionId : this.regionId,
            accountId : this.accountId,
        }
    }

    getLoginData() {
        return {
            username: this.username,
            password: this.password,
            deviceId: this.deviceId,
            twoFACode : this.twoFACode,
        }
    }

    validateLogin() {
        this.username = this.username || null;
        this.password = this.password || null;

        if (!this.noPrompt) {
            const loginData = util.promptLoginData(this.username, this.password);
            this.username = loginData.username;
            this.password = loginData.password;
        }

        const loginData = util.validateLoginData(this.uid, this.deviceId);
        this.uid = loginData.uid;
        this.deviceId = loginData.deviceId;
    }

    hasLoginAttributes() {
        const values = Object.values(this.getLoginAttributes());
        for (const value of values) {
            if (!value) return false;
        }
        return true;
    }

    login(loginUrl = LOGIN_ENDPOINT, refresh = false) {
        return new Promise((resolve, reject) => {
            this.validateLogin();

            api.requestLogin(
                this,
                loginUrl,
                this.getLoginData(),
                refresh
            ).then((response) => {
                if (response && response.status === 200) {
                    resolve(JSON.parse(response.body));
                    return;
                }

                if (response && response.status === 401) {
                    Logger.error("Invalid refresh token or invalid credentials.");
                    Logger.debug(response);
                }

                if (response && response.status === 412) {
                    reject(new BlinkTwoFARequiredError("2FA required"));
                    return;
                }

                reject(new Error("Login error " + response.status ));
            });
        });
    }

    getTierInfo(tierUrl = TIER_ENDPOINT) {
        return new Promise((resolve, reject) => {
            api.requestTier(this, tierUrl).then((response) => {
                if (response && response.status === 200) {
                    resolve(JSON.parse(response.body));
                    return;
                }
                
                reject(new Error("Tier info error " + response.status ));
            });
        });
    }

    refreshTokens(refresh = false) {
        return new Promise((resolve, reject) => {
            this.isErrored = true;

            try {
                Logger.info(
                    `${refresh ? "Refreshing" : "Obtaining"} authentication token.`
                );

                this.login(LOGIN_ENDPOINT, refresh).then((loginResponse) => {
                    this.setLoginInfo( loginResponse );

                    if (!refresh) {
                        this.getTierInfo().then((tierInfo) => {
                            this.setTierInfo(tierInfo);
                            this.isErrored = false;
                            resolve();
                        });
                    } else {
                        this.isErrored = false;
                        resolve();
                    }

                }).catch((err) => {
                    reject(err);
                });

            } catch (e) {
                if (e instanceof BlinkTwoFARequiredError) {
                    throw e;
                } else {
                    throw e;
                }
            }
        });
    }

    setLoginInfo(loginResponse) {
        this.token = loginResponse.access_token;
        this.expiresIn = loginResponse.expires_in;
        this.expirationDate = new Date().getTime() / 1000 + (this.expiresIn || 0);
        this.refreshToken = loginResponse.refresh_token;
    }

    setTierInfo(tierInfo) {
        if (!tierInfo) {
            throw new Error("No tier info to extract region and account from");
        }

        this.regionId = tierInfo["tier"];
        this.host = `${this.regionId}.${BLINK_URL}`;
        this.accountId = tierInfo["account_id"];
    }

    prompt2fa() {
        const code = util.prompt2faCode();
        if (!code) {
            throw new Error("2FA code is required");
        }
        return this.send2faCode(code);
    }

    send2faCode(code) {
        this.twoFACode = code;
        return this.startup();
    }

    startup() {
        return new Promise((resolve, reject) => {
            this.validateLogin();

            if (!this.hasLoginAttributes()) {
                this.refreshTokens().then(() => {
                    resolve();
                }).catch((err) => {
                    reject(err);
                });
                return;
            } else {
                Logger.debug('has login attributes');
            }

            resolve();
        });
    }

    refreshCheck(headers) {
        return new Promise( (resolve, reject) => {
            Logger.debug('refreshing tokens');
            this.refreshTokens(true).then(() => {
                if ("Authorization" in headers) {
                    // update the authorization header with the new token
                    headers["Authorization"] = `Bearer ${this.token}`;
                }

                if (this.callback !== null) {
                    this.callback(this.getLoginAttributes());

                    resolve(headers);
                }
            });
        });
    }

    needRefresh(skipRefreshCheck) {
        if (skipRefreshCheck) return false;

        if (!this.expirationDate) {
            return !!this.refreshToken;
        }

        return this.expirationDate - new Date().getTime() / 1000 < 60;
    }

    get(url, headers, json=false, skipRefreshCheck=false, binary=false) {
        return new Promise((resolve, reject) => {
            Logger.debug('get: ' + url);
            
            if (this.needRefresh(skipRefreshCheck)) {
                this.refreshCheck(headers).then( (updatedHeaders) => {
                    request({
                        url: url,
                        json: json,
                        headers: updatedHeaders,
                        encoding: binary ? null : undefined
                    }, (err, response) => {
                        if (err) {
                            Logger.error( err.message);
                            reject(err);
                        } else {
                            resolve({status: response.statusCode, body: response.body});
                        }
                    })

                });
            } else {
                request({
                    url: url,
                    json: json,
                    headers: headers,
                    encoding: binary ? null : undefined
                }, (err, response) => {
                    if (err) {
                        Logger.error( err.message);
                        reject(err);
                    } else {
                        resolve({status: response.statusCode, body: response.body});
                    }
                })
            }
        });
    }

    post(url, headers, body, json=false, skipRefreshCheck=false) {
        return new Promise((resolve, reject) => {
            Logger.debug('post: ' + url);

            if (this.needRefresh(skipRefreshCheck)) {
                this.refreshCheck(headers).then( (updatedHeaders) => {
                    request.post({
                        url: url,
                        json: json,
                        headers: updatedHeaders,
                        body: body
                    }, (err, response, body) => {
                        if (err) {
                            Logger.error( err.message);
                            reject(err);
                        } else {
                            resolve({status: response.statusCode, body: json ? JSON.parse(body) : body});
                        }
                    })
                });
            } else {
                request.post({
                        url: url,
                        json: json,
                        headers: headers,
                        body: body
                }, (err, response, body) => {
                    if (err) {
                        Logger.error( err.message);
                        reject(err);
                    } else {
                        try {
                            const parsedBody = json && body instanceof String ? JSON.parse(body) : body;
                            resolve({status: response.statusCode, body: parsedBody});
                        } catch (e) {
                            Logger.debug('body: ', JSON.stringify(body))
                            reject(e);
                        }
                    }
                })
            }
        });
    }
};