const { Parser } = require('htmlparser2');

class OAuthArgsParser {
    constructor() {
        this.csrf_token = null;
        this._in_oauth_script = false;
        this._parser = new Parser({
            onopentag: (name, attribs) => {
                if (
                    name === 'script' &&
                    attribs.id === 'oauth-args' &&
                    attribs.type === 'application/json'
                ) {
                    this._in_oauth_script = true;
                }
            },
            ontext: (text) => {
                if (this._in_oauth_script) {
                    try {
                        const oauthData = JSON.parse(text);
                        this.csrf_token = oauthData['csrf-token'];
                    } catch (e) {
                        // Ignore parse errors
                    }
                    this._in_oauth_script = false;
                }
            },
            onclosetag: (name) => {
                if (name === 'script') {
                    this._in_oauth_script = false;
                }
            }
        }, { decodeEntities: true });
    }

    parse(html) {
        this.csrf_token = null;
        this._parser.write(html);
        this._parser.end();
        return this.csrf_token;
    }
}

module.exports = OAuthArgsParser;