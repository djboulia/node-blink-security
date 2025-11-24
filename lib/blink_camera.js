/**
 * Created by madshall on 3/17/17.
 */
const BlinkException = require('./blink_exception');
const api = require('./api');

module.exports = class BlinkCamera {
  constructor(blink, config, urls) {
    this.blink = blink;
    this.urls = urls;
    this._id = config.id;
    this._name = config.name;
    this._status = config.status;
    this._enabled = config.enabled;
    this._thumb = this.urls.base_url + config.thumbnail + '.jpg';
    this._clip = this.urls.base_url + config.thumbnail + '.mp4';
    this._temperature = config.signals.temp;
    this._battery = config.battery;
    this._motion = {};
    this._header = null;
    this._image_link = null;
    this._arm_link = null;
    this._updated_at = config.updated_at;
    this._region_id = config.region_id;
    this._wifi = config.signals.wifi;
    this._lfr = config.signals.lfr;
    this._network_id = config.network_id;
  }

  get id() {
    return this._id;
  }

  get wifi() {
    return this._wifi;
  }

  get lfr() {
    return this._lfr;
  }

  get name() {
    return this._name;
  }

  set name(value) {
    this._name = value;
  }

  get region_id() {
    return this._region_id;
  }

  get armed() {
    return this._status;
  }

  get enabled() {
    return this._enabled;
  }

  get clip() {
    return this._clip;
  }

  set clip(value) {
    this._clip = value;
  }

  get thumbnail() {
    return this._thumb;
  }

  set thumbnail(value) {
    this._thumb = value;
  }

  get temperature() {
    return this._temperature;
  }

  set temperature(value) {
    this._temperature = value;
  }

  get battery() {
    return this._battery;
  }

  set battery(value) {
    this._battery = value;
  }

  get image_link() {
    return this._image_link;
  }

  set image_link(value) {
    this._image_link = value;
  }

  get arm_link() {
    return this._arm_link;
  }

  set arm_link(value) {
    this._arm_link = value;
  }

  get header() {
    return this._header;
  }

  set header(value) {
    this._header = value;
  }

  get motion() {
    return this._motion;
  }

  set motion(value) {
    this._motion = value;
  }

  get updated_at() {
    return this._updated_at;
  }

  get network_id() {
    return this._network_id;
  }

  set network_id(value) {
    this._network_id = value;
  }

  snapPicture() {
    return new Promise((resolve, reject) => {
      api.snapPicture(this).then((response) => {
        resolve(response.body);
      }).catch(() => {
        reject(new BlinkException(`Can't snap picture for camera ${this._id}:${this._name}`));
      });
    });
  }

  setMotionDetect(enable) {
    return new Promise((resolve, reject) => {
      api.setMotionDetect(this, enable).then((response) => {
        resolve(response.body);
      }).catch(() => {
        reject(new BlinkException(`Can't set motion detect for camera ${this._id}:${this._name}`));
      });
    });
  }

  update(values) {
    this._name = values['name'];
    this._status = values['status'];
    this._enabled = values['enabled'];
    this._thumb = this.urls.base_url + values['thumbnail'] + '.jpg';
    this._clip = this.urls.base_url + values['thumbnail'] + '.mp4';
    this._temperature = values['signals'].temp;
    this._battery = values['battery'];
    this._updated_at = values['updated_at'];
  }

  imageRefresh() {
    return new Promise((resolve, reject) => {
      api.imageRefresh(this.blink).then((response) => {
        let cameras = body.cameras;
        cameras.forEach((camera) => {
          if (camera.id === this._id) {
            this._thumb = this.urls.base_url + camera['thumbnail'] + '.jpg';
            this._updated_at = camera['updated_at'];
            resolve(this._thumb);
          }
        });
        resolve(null);
      }).catch(() => {
        reject(new BlinkException(`Can't refresh thumbnail for camera ${this._id}:${this._name}`));
      });
    });
  }

  statusRefresh() {
    return new Promise((resolve, reject) => {
      api.statusRefresh(this).then((response) => {
        resolve(response.body);
      }).catch(() => {
          reject(new BlinkException(`Can't refresh status for camera ${this._id}:${this._name}`));
      });
    });
  }

  fetchImageData() {
    return new Promise((resolve, reject) => {
      // console.log('thumbnail ' + this.thumbnail);
      // console.log('header ' + this._header);

      api.fetchImageData(this).then((response) => {
        resolve(response.body);
      }).catch(() => {
          reject(new BlinkException(`Can't refresh thumbnail for camera ${this._id}:${this._name}`));
      });
    });
  }

  fetchVideoData() {
    return new Promise((resolve, reject) => {
      api.fetchVideoData(this).then((response) => {
        resolve(response.body);
      }).catch(() => {
          reject(new BlinkException(`Can't refresh thumbnail for camera ${this._id}:${this._name}`));
      });
    });
  }

  recordClip() {
    return new Promise((resolve, reject) => {
      api.recordClip(this).then((response) => {
          resolve(response.body);
      }).catch(() => {
          reject(new BlinkException(`Can't record clip for camera ${this._id}:${this._name}`));
      });
    });
  }
};
