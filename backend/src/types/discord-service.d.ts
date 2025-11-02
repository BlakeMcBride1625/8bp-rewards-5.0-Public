declare module '../../../services/discord-service' {
  export default class DiscordService {
    constructor();
    login(): Promise<void>;
    logout(): Promise<void>;
    get isReady(): boolean;
    get client(): any;
    sendConfirmation(bpAccountId: string, imagePath: string, claimedItems?: string[]): Promise<boolean>;
  }
}




