declare module 'asterisk-manager' {
  import { EventEmitter } from 'events';

  interface AsteriskManagerInstance extends EventEmitter {
    keepConnected(): void;
    disconnect(): void;
    action(
      action: Record<string, string>,
      callback: (err: Error | null, res: Record<string, string>) => void
    ): void;
  }

  interface AsteriskManagerConstructor {
    new (
      port: number,
      host: string,
      user: string,
      secret: string,
      events?: boolean
    ): AsteriskManagerInstance;
    (
      port: number,
      host: string,
      user: string,
      secret: string,
      events?: boolean
    ): AsteriskManagerInstance;
  }

  const AsteriskManager: AsteriskManagerConstructor;
  export = AsteriskManager;
}
