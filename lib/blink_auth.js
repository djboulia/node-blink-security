const request = require('request');
const api = require('./api');
const util = require('./helpers/util');
const Logger = require('./logger');
const {v4} = require('uuid');
const {generatePkcePair} = require('./helpers/pkce');
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
        this.refreshRate = DEFAULT_REFRESH;
        
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
            // OAuth v2 attributes
            this.hardwareId = loginData.hardwareId || null;
        }

        if (!this.hardwareId) {
            this.hardwareId = (v4()).toUpperCase();
            Logger.debug('hardwareId generated: ', this.hardwareId);
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
            hardwareId : this.hardwareId,
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
        return new Promise((resolve, reject) => {
            this.complete2faLogin(code).then( (success) => {
                if (!success) {
                    Logger.error("OAuth v2 2FA completion failed.");
                    reject(new Error("OAuth v2 2FA completion failed."));
                    return;
                }

                if (!this.lastRefresh) {
                    this.lastRefresh = Math.floor(Date.now() / 1000 - this.refreshRate * 1.05);
                    Logger.debug(
                        `Initialized lastRefresh to ${this.lastRefresh} == ${new Date(this.lastRefresh * 1000).toISOString()}`
                    );
                }

                // Continue setup flow
                resolve();
            });
        });
    }            

    startup() {
        return new Promise((resolve, reject) => {
            this.validateLogin();

            if (this.refreshToken && this.hardwareId) {
                Logger.debug('Attempting OAuth v2 token refresh');

                api.oauthRefreshToken(
                    this, this.refreshToken, this.hardwareId
                ).then((tokenData) => {
                    return this._processTokenData(tokenData)
                }).then(() => {
                    Logger.info("OAuth v2 token refresh successful");

                    // invoke callback with updated/refreshed tokens
                    if (this.callback !== null) {
                        this.callback(this.getLoginAttributes());
                    }
                    resolve();
                    return;
                }).catch((e) => {
                    Logger.debug('OAuth v2 refresh failed: ' + e.message);
                    reject(e);
                    return;
                });
            } else {
                Logger.debug("Attempting OAuth v2 login flow");

                this._oauthLoginFlow().then( (success) => {
                    if (success) {
                        Logger.info("OAuth v2 login successful")
                        resolve();
                        return;
                    }
                    Logger.error("OAuth v2 login failed");
                    reject("OAuth v2 login failed");
                }).catch( (error) => {
                    reject(error);
                });
            }
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

    get(url, headers, json=false, skipRefreshCheck=false, binary=false, options={}) {
        options.url = url;
        options.json = json;
        options.headers = headers;
        options.jar = true;
        options.encoding = binary ? null : undefined;

        return new Promise((resolve, reject) => {
            Logger.debug('get: ' + url);
            
            if (this.needRefresh(skipRefreshCheck)) {
                this.refreshCheck(headers).then( (updatedHeaders) => {
                    request(options, (err, response) => {
                        if (err) {
                            Logger.error( err.message);
                            reject(err);
                        } else {
                            resolve({status: response.statusCode, body: response.body, headers: response.headers});
                        }
                    })

                });
            } else {
                request(options, (err, response) => {
                    if (err) {
                        Logger.error( err.message);
                        reject(err);
                    } else {
                        resolve({status: response.statusCode, body: response.body, headers: response.headers});
                    }
                })
            }
        });
    }

    post(url, headers, body, json=false, skipRefreshCheck=false, options={}) {
        options.url = url;
        options.json = json;
        options.headers = headers;
        options.jar = true;
        options.body = body;

        return new Promise((resolve, reject) => {
            Logger.debug('post: ' + url);

            if (this.needRefresh(skipRefreshCheck)) {
                this.refreshCheck(headers).then( (updatedHeaders) => {
                    request.post(options, (err, response, body) => {
                        if (err) {
                            Logger.error( err.message);
                            reject(err);
                        } else {
                            try {
                                const parsedBody = json && typeof body === 'string' 
                                    ? JSON.parse(body) 
                                    : body;
                                resolve({status: response.statusCode, body: parsedBody, headers: response.headers});
                            } catch (e) {
                                Logger.error(`url ${url} status: ${response.statusCode}  body: `, 
                                    JSON.stringify(body))
                                reject(e);
                            }
                        }
                    })
                });
            } else {
                request.post(options, (err, response, body) => {
                    if (err) {
                        Logger.error( err.message);
                        reject(err);
                    } else {
                        try {
                            const parsedBody = json && typeof body === 'string' 
                                ? JSON.parse(body) 
                                : body;
                            resolve({status: response.statusCode, body: parsedBody, headers: response.headers});
                        } catch (e) {
                            Logger.error(`url ${url} status: ${response.statusCode}  body: `, 
                                JSON.stringify(body))
                            reject(e);
                        }
                    }
                })
            }
        });
    }

/**
 * Execute complete OAuth 2.0 login flow with PKCE.
 * @returns true if successful
 */
 _oauthLoginFlow() {
    return new Promise( (resolve, reject) => {
    // Step 1: Generate PKCE
    const { codeVerifier, codeChallenge } = generatePkcePair();

    // Step 2: Authorization request
    api.oauthAuthorizeRequest(this, this.hardwareId, codeChallenge).then( (auth_success) => {
        if (!auth_success) {
            Logger.error("OAuth authorization request failed")
            resolve(false);
            return;
        }

        api.oauthGetSigninPage(this).then( (csrf_token) => {
            if (!csrf_token) {
                Logger.error("Failed to get CSRF token")
                resolve(false);
                return;
            }
            
            // Step 4: Login
            const email = this.username;
            const password = this.password;

            api.oauthSignin(this, email, password, csrf_token).then( (login_result) => {

                // Step 4b: Handle 2FA if needed
                if (login_result === "2FA_REQUIRED") {
                    // Store CSRF token and verifier for later use
                    this._oauth_csrf_token = csrf_token;
                    this._oauth_code_verifier = codeVerifier;

                    // Raise exception to let the app handle 2FA prompt
                    Logger.info("Two-factor authentication required.");
                    reject(new BlinkTwoFARequiredError());
                    return;
                } else if (login_result !== "SUCCESS") {
                    Logger.error("Login failed")
                    resolve(false);
                    return;
                }
                
                // Step 5: Get authorization code
                api.oauthGetAuthorizationCode(this).then( (code) => {
                    if (!code) {
                        Logger.error("Failed to get authorization code")
                        resolve(false);
                        return;
                    }

                    // Step 6: Exchange code for token
                    api.oauthExchangeCodeForToken(
                        this, code, codeVerifier, this.hardwareId
                    ).then( (token_data) => {
                        if (!token_data) {
                            Logger.error("Failed to exchange code for token")
                            resolve(false);
                            return;
                        }
                        
                        // Process tokens
                        this._processTokenData(token_data).then( () => {
                            resolve(true);
                            return;
                        });
                    });
                });
            });
        });
    });
    });
 }

 _processTokenData(tokenData) {
    return new Promise( (resolve, reject) => {

        // Set tokens
        this.token = tokenData["access_token"];
        this.refreshToken = tokenData["refresh_token"];

        // Set expiration
        const expiresIn = tokenData["expires_in"] || 3600;
        this.expiresIn = expiresIn;
        this.expirationDate = new Date().getTime() / 1000 + expiresIn;

        // Get tier info if needed (for account_id, region_id, host)
        if (!this.host || !this.regionId || !this.accountId) {
            this.getTierInfo().then( (tierInfo) => {
                this.tierInfo = tierInfo;
                this.setTierInfo(tierInfo);
                resolve();
            }).catch( (error) => {
                Logger.warning("Failed to get tier info: " + error.message);
                resolve();
            });
        } else {
            resolve();
        }
    });
 }

 complete2faLogin(twofaCode) {
    return new Promise( (resolve, reject) => {
        // Check if we have stored OAuth state
        if (!this._oauth_csrf_token || !this._oauth_code_verifier) {
            Logger.error("No OAuth 2FA state found. Start login flow first.");
            resolve(false);
            return;
        }

        const csrfToken = this._oauth_csrf_token;
        const codeVerifier = this._oauth_code_verifier;

        // Verify 2FA
        api.oauthVerify2FA(this, csrfToken, twofaCode).then( (verified) => {
            if (!verified) {
                Logger.error("2FA verification failed")
                resolve(false);
                return;
            }

            //  Step 5: Get authorization code
            api.oauthGetAuthorizationCode(this).then( (code) => {
                if (!code) {
                    Logger.error("Failed to get authorization code after 2FA")
                    resolve(false);
                    return;
                }

                // Step 6: Exchange code for token
                api.oauthExchangeCodeForToken(
                    this, code, codeVerifier, this.hardwareId
                ).then( (token_data) => {
                    if (!token_data) {
                        Logger.error("Failed to exchange code for token after 2FA")
                        resolve(false);
                        return;
                    }

                    // Process tokens
                    this._processTokenData(token_data).then( () => {
                        // Clean up temporary state
                        delete this._oauth_csrf_token;
                        delete this._oauth_code_verifier;

                        resolve(true);
                        return;
                    });
                });
            });
        });
    });
 }

};