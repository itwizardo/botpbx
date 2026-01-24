import winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

// Ensure log directory exists
const logDir = path.resolve('./logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

// Create the logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logDir, 'app.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    // File transport for errors only
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  ],
});

// Create child loggers for different components
export function createLogger(component: string): winston.Logger {
  return logger.child({ component });
}

// Specialized loggers
export const amiLogger = createLogger('AMI');
export const agiLogger = createLogger('AGI');
export const telegramLogger = createLogger('Telegram');
export const ttsLogger = createLogger('TTS');
export const dbLogger = createLogger('Database');
export const apiLogger = createLogger('API');
export const wsLogger = createLogger('WebSocket');
