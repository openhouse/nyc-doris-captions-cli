import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const pdfParse = require('pdf-parse/lib/pdf-parse.js') as typeof import('pdf-parse');

export default pdfParse;
