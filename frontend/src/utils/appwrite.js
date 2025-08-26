import { Client, Account } from 'appwrite';

const appwrite = new Client();
appwrite
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

const account = new Account(appwrite);

export { appwrite, account };