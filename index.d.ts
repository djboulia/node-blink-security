declare module 'node-blink-security' {
  export interface BlinkAuthLoginData {
    token: string;
    expiresIn: number;
    expirationDate: number;
    refreshToken: string;
    host: string;
    regionId: string;
    accountId: number;
    hardwareId: string;
  }

  export interface BlinkNetwork {
    id: number;
    name: string;
    created_at: string;
    updated_at: string;
    time_zone: string;
    dst: boolean;
    armed: boolean;
    lv_save: boolean;
  }

  export interface BlinkCamera {
    id: number;
    created_at: string;
    updated_at: string;
    name: string;
    serial: string;
    fw_version: string;
    type: string;
    enabled: boolean;
    thumbnail: string;
    status: string;
    battery: string;
    usage_rate: boolean;
    network_id: number;
    issues: any[];
    signals: {
      lfr: number;
      wifi: number;
      temp: number;
      battery: number;
    };
    local_storage_enabled: boolean;
    local_storage_compatible: boolean;
    snooze: boolean;
    snooze_time_remaining: number | null;
    revision: any;
    color: string;
  }

  export interface BlinkSyncModule {
    id: number;
    created_at: string;
    updated_at: string;
    onboarded: boolean;
    status: string;
    name: string;
    serial: string;
    fw_version: string;
    type: string;
    subtype: string;
    last_hb: string;
    wifi_strength: number;
    network_id: number;
    enable_temp_alerts: boolean;
    local_storage_enabled: boolean;
    local_storage_compatible: boolean;
    local_storage_status: string;
    revision: string | null;
  }

  export interface BlinkSummary {
    account: {
        id: number;
        email_verified: boolean;
        email_verification_required: boolean;
        amazon_account_linked: boolean;
    };
    networks: BlinkNetwork[];
    cameras: BlinkCamera[];
    sync_modules: BlinkSyncModule[];
}

  export class BlinkAuth {
    constructor(
      loginData?: BlinkAuthLoginData,
      noPrompt?:boolean,
      callback?: (loginData: BlinkAuthLoginData) => void,
    );
    getLoginAttributes(): BlinkAuthLoginData;
  }

  export class BlinkCameraClass {
    constructor(blink: Blink, config: any, urls : any);
    setMotionDetect(enable:boolean): Promise<any>;
    statusRefresh(): Promise<any>;
  }

  export class Blink {
    constructor(auth: BlinkAuth);
    setupSystem(location?:string): Promise<void>;
    getSummary(): Promise<BlinkSummary>;
    setArmed(armed: boolean, networkIds: number[]): Promise<boolean[]>;
    getCameras(): Promise<Record<string, BlinkCameraClass>>;
  }
}
