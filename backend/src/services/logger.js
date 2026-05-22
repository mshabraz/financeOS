const winston = require('winston');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.join(__dirname, '../../logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 5_000_000,
      maxFiles: 3,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 10_000_000,
      maxFiles: 5,
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

module.exports = logger;
