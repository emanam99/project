/**
 * Muat .env dari folder live/ SEBELUM modul lain (config, socket, chatRepository) dibaca.
 * Di ESM, import di-hoist jadi dotenv harus di file terpisah yang di-import paling awal.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
