export interface ImageInfo {
  id: string;
  repoTags: string[];
  size: number;
  created: Date;
  isDangling: boolean;
}

export interface ImageLayer {
  id: string;
  created: Date;
  createdBy: string;
  size: number;
  comment: string;
}
