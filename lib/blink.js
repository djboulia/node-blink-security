/**
 * Created by madshall on 3/17/17.
 */
const readline = require('readline');
require('./helpers/constants');
const BlinkCamera = require('./blink_camera');
const BlinkException = require('./blink_exception');
const BlinkTwoFARequiredError = require('./blink_2fa_exception');
const BlinkURLHandler = require('./blink_url_handler');
const util = require('./helpers/util');
const Logger = require('./logger');
const api = require('./api');

function _statusCodeIsError(response) {
  return response.statusCode < 200 || response.statusCode > 299
}
module.exports = class Blink {
  constructor(blinkAuth, options) {
    this._auth = blinkAuth;
    this._networks = [];
    this._account_id = null;
    this._region = null;
    this._region_id = null;
    this._host = null;
    this._events = [];
    this._cameras = {};
    this._idlookup = {};
    this.urls = null;
    Object.assign(this, options);
  }

  get cameras() {
    return this._cameras;
  }

  get idTable() {
    return this._idlookup;
  }

  get networks() {
    return this._networks;
  }

  get accountId() {
    return this._account_id;
  }

  get region() {
    return this._region;
  }

  get regionId() {
    return this._region_id;
  }

  get auth() {
    return this._auth;
  }

  refresh() {
    var promises = [];
    for (var id in this._cameras) {
      if (this._cameras.hasOwnProperty(id)) {
        let camera = this._cameras[id];
        promises.push(camera.statusRefresh());
      }
    }

    return Promise
      .all(promises)
      .then(() => this.getSummary())
      .then(summaries => {
        for (var id in this._cameras) {
          if (this._cameras.hasOwnProperty(id)) {
            let camera = this._cameras[id];

            summaries.cameras.forEach(device => {
              if (device.id === camera.id) {
                camera.update(device);
              }
            });
          }
        }
      });
  }

  filterNetworks(array, index) {
    const networks = this.networks.map(_ => _.id);
    const result = [];

    array.forEach((el) => {
      if (networks.includes(el[index])) {
        result.push(el);
      }
    });

    return result;
  }

  getSummary() {
    // const networks = this.networks.map(_ => _.id);
    // console.log('included networks: ' + JSON.stringify(networks));

    return new Promise((resolve, reject) => {
      if (!this.auth.hasToken()) {
        return reject(new BlinkException("Authentication token must be set"));
      }

      api.getSummary(this).then((response) => {
        const body = response.body;

        if ( _statusCodeIsError(response.status)) {
          return reject(new BlinkException(`Can't retrieve system summary`));
        }

        // filter based on networks that were selected

        body.networks = this.filterNetworks(body.networks, 'id');
        body.sync_modules = this.filterNetworks(body.sync_modules, 'network_id');
        body.cameras = this.filterNetworks(body.cameras, 'network_id');

        return resolve(body);
      });
    });
  }

  getCameraThumbs() {
    return this.refresh()
      .then(() => {
        var result = {};
        for (var id in this._cameras) {
          if (this._cameras.hasOwnProperty(id)) {
            result[id] = this._cameras[id].thumbnail;
          }
        }
        return result;
      });
  }

  isOnline(networkIds = []) {
    const networks = networkIds.length ? networkIds : this.networks.map(_ => _.id);

    return this.getSummary()
    .then(summaries => {

      const result = {};
      summaries.sync_modules.forEach((el) => {
        if (networks.includes(el.network_id)) {
          result[el.network_id] = (el.status === "online") ? true : false ;
        }
      });

      return result;
    });
  }

  getLastMotions() {
    return this.getVideos()
      .then(events => {
        var result = {};
        events.forEach(event => {
          let camera_id = event.camera_id;
          let camera = this._cameras[camera_id];sssssssssssss
          if (event.type === 'motion') {
            let url = this.urls.base_url + event.video_url;
            result[camera_id] = camera.motion = {
              'video': url,
              'image': url.replace(/\.[^.]+$]/, '.jpg'),
              'time': event.created_at
            };
          }
        });
        return result;
      });
  }

  isArmed() {
    return this.getSummary()
      .then(summaries => {

        const networks = this.networks.map(_ => _.id);

        const result = {};
        summaries.networks.forEach((el) => {
          result[el.id] = el.armed;
        });

        return result;
      });
  }

  setArmed(value = true, networkIds = []) {
    const promises = [];
    const networksToArm = networkIds.length ? networkIds : this.networks.map(_ => _.id);

    networksToArm.forEach(networkId => {
      promises.push(new Promise((resolve, reject) => {
        api.setArmed(this, networkId, value).then((response) => {
          return resolve(response.body);
        }).catch(() => {
            return reject(new BlinkException(`Can't ${value ? 'arm' : 'disarm'} the network: ${networkId}`));
        })
      }));
    });

    return Promise.all(promises)
      .then(results => {
        return results.reduce((acc, result, index) => {
          acc[networksToArm[index]] = result;
          return acc;
        }, {});
      });
  }

  getVideos(page = 0, since = new Date(2008)) { // Blink was founded in 2009
    return new Promise((resolve, reject) => {
        api.getVideos(this, since, page).then((response) => {
          return resolve(response.body);
        }).catch(() => {
          return reject(new BlinkException(`Can't fetch videos`));
        })
    });
  }

  getCameras() {
    return this.getSummary()
      .then(summaries => {

        // console.log('getCameras: ' + JSON.stringify(summaries.cameras));
        summaries.cameras.forEach(camera => {
          camera.region_id = this._region_id;

          const newDevice = new BlinkCamera(this, camera, this.urls);
          this._cameras[newDevice.id] = newDevice;
          this._idlookup[newDevice.id] = newDevice.name;
        });

        return this._cameras;
      });
  }

  getLinks() {
    for (var id in this._cameras) {
      if (this._cameras.hasOwnProperty(id)) {
        let camera = this._cameras[id];
        let network_id_url = this.urls.network_url + camera.network_id;
        let image_url = network_id_url + '/camera/' + camera.id + '/thumbnail';
        let arm_url = network_id_url + '/camera/' + camera.id + '/';
        camera.image_link = image_url;
        camera.arm_link = arm_url;
        // console.log("setting camera header " + this._auth_header);
        camera.header = this._auth_header;
      }
    }
  }

  setupUrls() {
    try {
      this.urls = new BlinkURLHandler(this.auth.accountId, this.auth.regionId);
    } catch (e) {
      Logger.error(
        `Unable to extract region is from response ${this.auth.tierInfo}`
      );

      throw new BlinkSetupError("Blink setup error!");
    }
  }

  prompt2fa() {
    return this.auth.prompt2fa();
  }

  initialize(name_or_id) {
      this.setupUrls();
      return this.getIDs(name_or_id)
        .then(this.getCameras.bind(this))
        .then(this.getLinks.bind(this));
  }

  setupSystem(name_or_id) {
    return new Promise((resolve, reject) => {
    
    this.auth.startup().then(() => {
      this.initialize(name_or_id).then(() => {
        resolve();
      });      
    }).catch((err) => {
      if (err instanceof BlinkTwoFARequiredError) {
        return this.auth.prompt2fa().then(() => {
          this.initialize(name_or_id).then(() => {
            resolve();
          });
        });
      }
      reject(err);
    });
  });
}

  getIDs(name_or_id) {
    var that = this;
    return new Promise((resolve, reject) => {
      if (!this.auth.hasToken()) {
        return reject(new BlinkException("You have to be authenticated before calling this method"));
      }
      
      api.getIDs(this).then((response) => {
        const body = response.body;
        if (_statusCodeIsError(response.status)) {
          Logger.error('error ', body);
          return reject(new BlinkException(`Can't retrieve system status`));
        } else {
          var network = false;
          if (typeof name_or_id != 'undefined') {
            body.networks.forEach(function (n) {
              if (n.id == name_or_id || n.name == name_or_id) {
                network = n;
                that._networks.push(network);
              }
            });

            if (!network) {
              return reject(new BlinkException("No network found for " + name_or_id));
            }
          } else {
            if (!body.networks.length) {
              return reject(new BlinkException("No networks found"));
            }
            body.networks.forEach(network => {
              that._networks.push(network);
            });
          }

          that._account_id = body.account.id;
          return resolve(that);
        }
      });
    });
  }
};
