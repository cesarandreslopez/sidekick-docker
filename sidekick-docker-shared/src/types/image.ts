export interface ImageInfo {
  id: string;
  repoTags: string[];
  size: number;
  created: Date;
  isDangling: boolean;
}
