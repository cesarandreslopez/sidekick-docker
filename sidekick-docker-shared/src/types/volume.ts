export interface VolumeInfo {
  name: string;
  driver: string;
  mountpoint: string;
  created: Date;
  isInUse: boolean;
}
