declare module 'mailparser' {
  export interface MailParserMessage {
    messageId?: string;
    subject?: string;
    from?: {
      text?: string;
      value?: Array<{ name?: string; address: string }>;
    };
    to?: {
      text?: string;
      value?: Array<{ name?: string; address: string }>;
    };
    cc?: {
      text?: string;
      value?: Array<{ name?: string; address: string }>;
    };
    date?: Date;
    text?: string;
    html?: string;
    attachments?: any[];
    headers?: Record<string, string | string[]>;
  }

  export interface ParsedMail extends MailParserMessage {}

  export function simpleParser(input: any): Promise<ParsedMail>;
  export function simpleParser(input: any, options?: any): Promise<ParsedMail>;
}