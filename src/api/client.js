import { Client, Account, Databases, ID } from 'appwrite';
import { CONFIG } from '../config.js';

export const client = new Client()
  .setEndpoint(CONFIG.APPWRITE_ENDPOINT)
  .setProject(CONFIG.PROJECT_ID);

export const account = new Account(client);
export const db = new Databases(client);
export { ID };
