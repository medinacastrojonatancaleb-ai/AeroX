export interface CreatorProject {
  id: string;
  title: string;
  type: 'script' | 'image' | 'audio' | 'idea' | 'video' | 'chat' | 'text' | 'music' | 'avatar' | 'habit' | 'cv';
  content: string;
  data?: any;
  createdAt: number;
}

export interface UserStats {
  credits: number;
  isPremium: boolean;
  viralCount: number;
}

export type View = 
  | 'home' 
  | 'lab' 
  | 'viral-gen' 
  | 'video-ai' 
  | 'image-hq' 
  | 'tts' 
  | 'text-edit' 
  | 'chat' 
  | 'music-ai' 
  | 'avatar-ai' 
  | 'extra-tools'
  | 'settings';
