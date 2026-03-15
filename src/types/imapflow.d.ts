declare module 'imapflow' {
  export interface ImapFlowOptions {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      username: string;
      password: string;
    };
    tls?: any;
  }

  export class ImapFlow {
    constructor(options: ImapFlowOptions);
    connect(): Promise<void>;
    logout(): Promise<void>;
    search(mailbox: string, criteria: any): Promise<string[]>;
    download(mailbox: string, uid: string, options?: any): Promise<ImapMessage | null>;
  }

  export interface ImapMessage {
    uid: string;
    raw: Buffer;
    flags?: string[];
    envelope?: any;
    structure?: any;
  }
}