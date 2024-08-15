import {
  createConnection,
  createServer,
  createSimpleProject,
} from '@volar/language-server/node';
import { create as createCssService } from 'volar-service-css';
import { create as createHtmlService } from 'volar-service-html';
import { language } from './languagePlugin';
import { typeGpuService } from './typegpu-service';

const connection = createConnection();
const server = createServer(connection);

connection.listen();

connection.onInitialize((params) => {
  console.log('INITIALIZED!');

  return server.initialize(
    params,
    createSimpleProject([
      // Language plugins, empty for now
      language,
    ]),
    [createHtmlService(), createCssService(), typeGpuService],
  );
});

connection.onInitialized(server.initialized);
connection.onShutdown(server.shutdown);
